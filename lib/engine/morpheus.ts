import { and, desc, eq, isNotNull, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  decisions,
  deckDnaCache,
  gateRequests,
  morpheusSeals,
  morpheusSnapshots,
  morpheusVerifications,
  myceliumSignals,
  objectives,
  subAgentTasks,
  synapsisOutputs,
  synapsisProblems,
} from '@/lib/db/schema'
import {
  appendSentinelEntry,
  canonicalJson,
  sha256Hex,
  verifySentinelChain,
} from '@/lib/sentinel'

/**
 * MORPHEUS — the nightly reset that proves the record survived the day.
 *
 * Upstream runs four phases against a single-tenant working store: hibernate
 * snapshots it, hypnos seals the snapshot into SENTINEL, morpheus wipes the
 * working store and rematerialises the gates, awaken verifies the chain. The
 * point is that an agent's accumulated state is never trusted to persist
 * unexamined — every day it is hashed, sealed, cleared, and re-derived, and the
 * chain either verifies or the day is marked broken.
 *
 * Two adaptations this port makes deliberately:
 *
 *   1. Per project, not global. Each project has its own snapshot, its own seal
 *      and its own verification, because each has its own SENTINEL chain.
 *
 *   2. The wipe is scoped to derived state. Upstream can wipe its working store
 *      because that store is the agent's scratch memory and nothing else. Here
 *      the equivalent tables hold the user's objectives, decisions and documents
 *      — destroying them nightly would destroy the product. So the durable
 *      stores are snapshotted and hashed but never cleared, and only genuinely
 *      rebuildable derived state (expired deck DNA cache) is. What survives from
 *      upstream is the part that carries the governance value: everything is
 *      hashed and sealed before anything is touched, the reset is reversible from
 *      the snapshot, and the chain is re-verified afterwards with the result
 *      written down where a user can read it.
 *
 * The seal happens before the clear, always. A reset that could erase a day's
 * evidence before sealing it would be the one way to abuse this engine, so
 * hypnos is not optional and morpheus refuses to run on an unsealed snapshot.
 */

export type MorpheusPhase = 'hibernate' | 'hypnos' | 'morpheus' | 'awaken'

export type SnapshotStatus =
  | 'snapshotted'
  | 'sealed'
  | 'wiped'
  | 'rematerialized'
  | 'verified'

export interface StoreSnapshot {
  store: string
  rows: number
  contentHash: string
  /**
   * Whether phase 3 clears this store. Only derived, rebuildable state is
   * ephemeral; a durable store is hashed and left alone.
   */
  ephemeral: boolean
  /** Row ids a later phase needs to reconcile against, e.g. pending gates. */
  ids?: string[]
  /** Full rows, kept only for ephemeral stores so the clear is reversible. */
  contents?: unknown[]
}

export interface Snapshot {
  id: string
  projectId: string
  snapshotHash: string
  stores: StoreSnapshot[]
  storeCount: number
  rowCount: number
  status: SnapshotStatus
}

export interface Seal {
  id: string
  snapshotId: string
  sealHash: string
  sentinelEntryId: string
  sequence: number
}

export interface RematerializedGates {
  gatesPending: number
  gatesPastSla: number
  clearedStores: { store: string; rows: number }[]
  clearedRows: number
}

export interface Verification {
  id: string
  snapshotId: string | null
  chainValid: boolean
  entries: number
  brokenAtSequence: number | null
  reason: string | null
  gatesRematerialized: number
  gatesMissing: number
  storesCleared: { store: string; rows: number }[]
}

/**
 * Durable working stores: snapshotted and hashed, never cleared. These are the
 * user's record, and the hash is what lets awaken detect that one changed or
 * vanished overnight.
 */
const DURABLE_STORES = [
  { store: 'objectives', table: objectives },
  { store: 'sub_agent_tasks', table: subAgentTasks },
  { store: 'decisions', table: decisions },
  { store: 'mycelium_signals', table: myceliumSignals },
  { store: 'synapsis_problems', table: synapsisProblems },
  { store: 'synapsis_outputs', table: synapsisOutputs },
] as const

/**
 * Hashes a set of rows independently of the order the database returned them in.
 *
 * Each row is canonicalised, the canonical forms are sorted, and the sorted list
 * is hashed. Without this the same store could hash differently across two runs
 * purely because Postgres chose a different scan order, and awaken would report
 * a tampered record that nobody touched. Sorting the canonical strings also
 * sidesteps the stores not sharing a primary key column name — synapsis_problems
 * keys on problemId, synapsis_outputs on outputId — so no per-table ordering is
 * needed to get a reproducible hash.
 */
function stableHash(rows: unknown[]): string {
  return sha256Hex(canonicalJson(rows.map((row) => canonicalJson(row)).sort()))
}

/**
 * Phase 1 — HIBERNATE. Reads every working store and hashes it.
 *
 * Nothing is written to the stores here and nothing is cleared; this phase only
 * produces the snapshot the rest of the cycle depends on.
 */
export async function hibernate(
  userId: string,
  projectId: string,
): Promise<Snapshot> {
  const stores: StoreSnapshot[] = []

  for (const { store, table } of DURABLE_STORES) {
    const rows = await db
      .select()
      .from(table)
      .where(eq(table.projectId, projectId))

    stores.push({
      store,
      rows: rows.length,
      contentHash: stableHash(rows),
      ephemeral: false,
    })
  }

  // Gates are snapshotted with their pending ids, so awaken can tell a gate that
  // was legitimately decided overnight from one that was deleted.
  const gates = await db
    .select()
    .from(gateRequests)
    .where(eq(gateRequests.projectId, projectId))

  const pendingGateIds = gates
    .filter((gate) => gate.status === 'pending')
    .map((gate) => gate.id)

  stores.push({
    store: 'gate_requests',
    rows: gates.length,
    contentHash: stableHash(gates),
    ephemeral: false,
    ids: pendingGateIds,
  })

  // The one genuinely derived store: a deck DNA cache entry is a rendering
  // optimisation, rebuildable on next use, so clearing it costs nothing.
  const cache = await db
    .select()
    .from(deckDnaCache)
    .where(eq(deckDnaCache.userId, userId))

  stores.push({
    store: 'deck_dna_cache',
    rows: cache.length,
    contentHash: stableHash(cache),
    ephemeral: true,
    contents: cache,
  })

  const snapshotHash = sha256Hex(canonicalJson(stores.map(({ contents: _contents, ...rest }) => rest)))
  const id = crypto.randomUUID()

  await db.insert(morpheusSnapshots).values({
    id,
    userId,
    projectId,
    snapshotHash,
    // Contents are kept for ephemeral stores only, so the snapshot stays small
    // while still being enough to undo the clear.
    stores,
    storeCount: stores.length,
    rowCount: stores.reduce((total, store) => total + store.rows, 0),
    status: 'snapshotted',
  })

  return {
    id,
    projectId,
    snapshotHash,
    stores,
    storeCount: stores.length,
    rowCount: stores.reduce((total, store) => total + store.rows, 0),
    status: 'snapshotted',
  }
}

/**
 * Phase 2 — HYPNOS. Seals the snapshot hash into the project's SENTINEL chain.
 *
 * This is the phase that makes the reset trustworthy. Once the hash is in the
 * chain it cannot be replaced without breaking every entry after it, so whatever
 * phase 3 goes on to clear, the record of what existed beforehand is fixed.
 */
export async function hypnos(
  userId: string,
  projectId: string,
  snapshot: Snapshot,
): Promise<Seal> {
  const entry = await appendSentinelEntry({
    userId,
    projectId,
    entryType: 'morpheus_sealed',
    subjectKey: `morpheus/${projectId}`,
    subjectTitle: 'MORPHEUS nightly seal',
    // The runtime signs. MORPHEUS is a schedule, not an agent, and naming it as
    // the signer keeps the attribution honest.
    signer: 'morpheus',
    payload: {
      snapshotId: snapshot.id,
      snapshotHash: snapshot.snapshotHash,
      storeCount: snapshot.storeCount,
      rowCount: snapshot.rowCount,
      stores: snapshot.stores.map(({ contents: _contents, ...rest }) => rest),
    },
    payloadRef: snapshot.id,
  })

  const id = crypto.randomUUID()

  await db.insert(morpheusSeals).values({
    id,
    userId,
    projectId,
    snapshotId: snapshot.id,
    sealHash: entry.entryHash,
    sentinelEntryId: entry.id,
    sequence: entry.sequence,
  })

  await db
    .update(morpheusSnapshots)
    .set({ status: 'sealed', sentinelEntryId: entry.id })
    .where(eq(morpheusSnapshots.id, snapshot.id))

  return {
    id,
    snapshotId: snapshot.id,
    sealHash: entry.entryHash,
    sentinelEntryId: entry.id,
    sequence: entry.sequence,
  }
}

/**
 * Phase 3 — MORPHEUS. Clears derived state and rematerialises the gates.
 *
 * Refuses to run on a snapshot that was not sealed: clearing before sealing is
 * the one order that would let a reset destroy evidence, so it is not reachable.
 *
 * "Rematerialising" a gate here means re-deriving the pending set after the reset
 * and confirming it is still live, rather than re-inserting gates — a gate that
 * survived the day needs no resurrection, and a gate that vanished is a finding
 * for awaken, not something to paper over by writing it back.
 */
export async function morpheus(
  userId: string,
  projectId: string,
  snapshot: Snapshot,
): Promise<RematerializedGates> {
  const stored = await db
    .select()
    .from(morpheusSnapshots)
    .where(eq(morpheusSnapshots.id, snapshot.id))
    .limit(1)

  if (!stored[0]) throw new Error(`MORPHEUS snapshot ${snapshot.id} does not exist`)
  if (stored[0].status === 'snapshotted') {
    throw new Error(
      'MORPHEUS cannot clear an unsealed snapshot — hypnos must seal it first',
    )
  }

  const clearedStores: { store: string; rows: number }[] = []
  let clearedRows = 0

  for (const store of snapshot.stores) {
    if (!store.ephemeral) continue

    if (store.store === 'deck_dna_cache') {
      // Only expired entries. A live cache entry is still earning its keep and
      // clearing it would just cost the next render.
      const result = await db
        .delete(deckDnaCache)
        .where(
          and(
            eq(deckDnaCache.userId, userId),
            isNotNull(deckDnaCache.expiresAt),
            lt(deckDnaCache.expiresAt, new Date()),
          ),
        )
        .returning({ id: deckDnaCache.id })

      clearedRows += result.length
      clearedStores.push({ store: store.store, rows: result.length })
    }
  }

  const pending = await db
    .select({ id: gateRequests.id, slaDueAt: gateRequests.slaDueAt })
    .from(gateRequests)
    .where(and(eq(gateRequests.projectId, projectId), eq(gateRequests.status, 'pending')))

  const now = Date.now()
  const gatesPastSla = pending.filter(
    (gate) => gate.slaDueAt !== null && gate.slaDueAt.getTime() < now,
  ).length

  await db
    .update(morpheusSnapshots)
    .set({ status: 'rematerialized' })
    .where(eq(morpheusSnapshots.id, snapshot.id))

  return {
    gatesPending: pending.length,
    gatesPastSla,
    clearedStores,
    clearedRows,
  }
}

/**
 * Phase 4 — AWAKEN. Re-verifies the chain and writes the morning verdict.
 *
 * Two things are checked. The chain itself, via the same verification the audit
 * surface uses, so a nightly run and a manual audit cannot disagree. And the
 * pending gates that existed at snapshot time: one that was decided overnight is
 * normal, one that is simply gone is not, and the difference is reported rather
 * than assumed away.
 */
export async function awaken(
  userId: string,
  projectId: string,
  snapshot: Snapshot,
  gates: RematerializedGates,
): Promise<Verification> {
  const chain = await verifySentinelChain(projectId)

  const pendingAtSnapshot =
    snapshot.stores.find((store) => store.store === 'gate_requests')?.ids ?? []

  let gatesMissing = 0
  if (pendingAtSnapshot.length > 0) {
    const live = await db
      .select({ id: gateRequests.id })
      .from(gateRequests)
      .where(eq(gateRequests.projectId, projectId))

    const liveIds = new Set(live.map((gate) => gate.id))
    gatesMissing = pendingAtSnapshot.filter((id) => !liveIds.has(id)).length
  }

  const id = crypto.randomUUID()

  await db.insert(morpheusVerifications).values({
    id,
    userId,
    projectId,
    snapshotId: snapshot.id,
    chainValid: chain.valid,
    entries: chain.entries,
    brokenAtSequence: chain.brokenAtSequence,
    // A vanished gate is an integrity finding even when the hashes all verify, so
    // it is folded into the reason rather than reported only as a count.
    reason:
      chain.reason ??
      (gatesMissing > 0
        ? `${gatesMissing} pending gate(s) present at snapshot are no longer in the record`
        : null),
    gatesRematerialized: gates.gatesPending,
    storesCleared: gates.clearedStores,
  })

  await db
    .update(morpheusSnapshots)
    .set({ status: 'verified' })
    .where(eq(morpheusSnapshots.id, snapshot.id))

  return {
    id,
    snapshotId: snapshot.id,
    chainValid: chain.valid && gatesMissing === 0,
    entries: chain.entries,
    brokenAtSequence: chain.brokenAtSequence,
    reason:
      chain.reason ??
      (gatesMissing > 0
        ? `${gatesMissing} pending gate(s) present at snapshot are no longer in the record`
        : null),
    gatesRematerialized: gates.gatesPending,
    gatesMissing,
    storesCleared: gates.clearedStores,
  }
}

export interface CycleResult {
  projectId: string
  snapshot: Snapshot
  seal: Seal
  gates: RematerializedGates
  verification: Verification
  ranAt: Date
}

/**
 * The full nightly cycle, in the only order it is safe to run.
 *
 * A failure partway leaves the snapshot at its last completed phase, so a
 * re-run can be told apart from a cycle that never finished.
 */
export async function runMorpheusCycle(
  userId: string,
  projectId: string,
): Promise<CycleResult> {
  const snapshot = await hibernate(userId, projectId)
  const seal = await hypnos(userId, projectId, snapshot)
  const gates = await morpheus(userId, projectId, snapshot)
  const verification = await awaken(userId, projectId, snapshot, gates)

  return { projectId, snapshot, seal, gates, verification, ranAt: new Date() }
}

export interface MorpheusStatus {
  lastSnapshot: {
    id: string
    status: SnapshotStatus
    snapshotHash: string
    storeCount: number
    rowCount: number
    createdAt: Date
  } | null
  lastVerification: {
    id: string
    chainValid: boolean
    entries: number
    brokenAtSequence: number | null
    reason: string | null
    gatesRematerialized: number
    verifiedAt: Date
  } | null
  /** Consecutive days the chain verified, counting back from the latest run. */
  streak: number
}

/** What the status surface shows: did last night verify, and how many in a row. */
export async function latestMorpheusStatus(
  projectId: string,
): Promise<MorpheusStatus> {
  const [snapshots, verifications] = await Promise.all([
    db
      .select()
      .from(morpheusSnapshots)
      .where(eq(morpheusSnapshots.projectId, projectId))
      .orderBy(desc(morpheusSnapshots.createdAt))
      .limit(1),
    db
      .select()
      .from(morpheusVerifications)
      .where(eq(morpheusVerifications.projectId, projectId))
      .orderBy(desc(morpheusVerifications.verifiedAt))
      .limit(30),
  ])

  let streak = 0
  for (const verification of verifications) {
    if (!verification.chainValid) break
    streak += 1
  }

  const snapshot = snapshots[0]
  const verification = verifications[0]

  return {
    lastSnapshot: snapshot
      ? {
          id: snapshot.id,
          status: snapshot.status as SnapshotStatus,
          snapshotHash: snapshot.snapshotHash,
          storeCount: snapshot.storeCount,
          rowCount: snapshot.rowCount,
          createdAt: snapshot.createdAt,
        }
      : null,
    lastVerification: verification
      ? {
          id: verification.id,
          chainValid: verification.chainValid,
          entries: verification.entries,
          brokenAtSequence: verification.brokenAtSequence,
          reason: verification.reason,
          gatesRematerialized: verification.gatesRematerialized,
          verifiedAt: verification.verifiedAt,
        }
      : null,
    streak,
  }
}
