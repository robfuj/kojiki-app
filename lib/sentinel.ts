import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as ed25519Sign,
  verify as ed25519Verify,
} from 'node:crypto'
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sentinelEntries, sentinelKeys } from '@/lib/db/schema'

/**
 * SENTINEL — the provenance layer.
 *
 * Every time a node or specialist is brought in, the engagement is wrapped in a
 * non-fungible, hash-chained, Ed25519-signed token. The chain is append-only:
 * this module exposes no update and no delete, because an editable ledger proves
 * nothing.
 *
 * Signing authority is deliberately NOT per-agent. Upstream Kojiki issues each
 * department its own private key; here a single runtime-held keypair signs
 * everything and agents hold none. An agent is *named* as the signer of an entry
 * for attribution, but it cannot produce a signature — so it cannot mint
 * provenance for a claim it never earned, backdate an engagement, or repudiate
 * one it made. A rogue agent can still act badly; it cannot rewrite the record of
 * having done so.
 */

const GENESIS_HASH = '0'.repeat(64)

export type SentinelEntryType =
  | 'specialist_engaged'
  | 'sub_agent_engaged'
  | 'task_dispatched'
  | 'task_reported'
  | 'task_reabsorbed'
  | 'signal_propagated'
  | 'objective_proposed'
  | 'objective_status_changed'
  // KAIZEN — the Check verdict, sealed so an outcome cannot be restated later.
  | 'kaizen_checked'
  // NEURAXIS — the causal trace, the escalation, and the gate lifecycle. Sealing
  // experiences is what lets the gate count verified corroboration rather than
  // accepting an agent's assertion that it has earned more authority.
  | 'experience_recorded'
  | 'escalation_raised'
  | 'gate_requested'
  | 'gate_decided'
  // MODEL ROUTING — sealing the proposal, the authorisation and the spend means
  // the record shows who chose the model, who approved it, and what it actually
  // cost. An agent cannot later claim it was authorised for a model it was not.
  | 'model_proposed'
  | 'model_approved'
  | 'cost_recorded'

/** Deterministic JSON: sorted keys at every depth, so a hash is reproducible. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value))
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, sortDeep(source[key])]),
    )
  }
  return value
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

function privateKeyFrom(key: { privateKey: string }) {
  return createPrivateKey({
    key: Buffer.from(key.privateKey, 'base64'),
    format: 'der',
    type: 'pkcs8',
  })
}

function publicKeyFrom(base64: string) {
  return createPublicKey({
    key: Buffer.from(base64, 'base64'),
    format: 'der',
    type: 'spki',
  })
}

export interface SentinelKey {
  projectId: string
  userId: string
  publicKey: string
  privateKey: string
}

/**
 * The project's single signing key, generated on first use. There is no path to
 * issue a second one, and no path to hand it to an agent.
 */
export async function getOrCreateSentinelKey(
  userId: string,
  projectId: string,
): Promise<SentinelKey> {
  const existing = await db
    .select()
    .from(sentinelKeys)
    .where(eq(sentinelKeys.projectId, projectId))
    .limit(1)

  if (existing[0]) return existing[0]

  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const row: SentinelKey = {
    projectId,
    userId,
    publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  }

  try {
    await db.insert(sentinelKeys).values(row)
  } catch {
    // Lost a race with a concurrent first use; the winner's key is authoritative.
    const winner = await db
      .select()
      .from(sentinelKeys)
      .where(eq(sentinelKeys.projectId, projectId))
      .limit(1)
    if (!winner[0]) throw new Error('Sentinel key could not be established')
    return winner[0]
  }

  return row
}

/** The fields a signature covers. Anything outside this is not authenticated. */
function sealPayload(entry: {
  sequence: number
  projectId: string
  entryType: string
  subjectKey: string
  subjectTitle: string
  signer: string
  payloadHash: string
  entryHash: string
  prevEntryId: string | null
  prevHash: string
}): string {
  return canonicalJson({
    entryHash: entry.entryHash,
    entryType: entry.entryType,
    payloadHash: entry.payloadHash,
    prevEntryId: entry.prevEntryId,
    prevHash: entry.prevHash,
    projectId: entry.projectId,
    sequence: entry.sequence,
    signer: entry.signer,
    subjectKey: entry.subjectKey,
    subjectTitle: entry.subjectTitle,
  })
}

export interface AppendEntryInput {
  userId: string
  projectId: string
  entryType: SentinelEntryType
  /** The node brought in, e.g. "marketing-brand/seo-specialist". */
  subjectKey: string
  subjectTitle: string
  /** Attribution: the agent that acted. It holds no key and does not sign. */
  signer: string
  payload: Record<string, unknown>
  payloadRef?: string | null
  objectiveId?: string | null
}

export interface AppendedEntry {
  id: string
  sequence: number
  entryHash: string
  signature: string
  publicKey: string
}

/** Appends one non-fungible token to the project's chain. */
export async function appendSentinelEntry(
  input: AppendEntryInput,
): Promise<AppendedEntry> {
  const key = await getOrCreateSentinelKey(input.userId, input.projectId)

  return db.transaction(async (tx) => {
    const last = await tx
      .select()
      .from(sentinelEntries)
      .where(eq(sentinelEntries.projectId, input.projectId))
      .orderBy(desc(sentinelEntries.sequence))
      .limit(1)

    const prev = last[0]
    const sequence = (prev?.sequence ?? 0) + 1
    const prevEntryId = prev?.id ?? null
    const prevHash = prev?.entryHash ?? GENESIS_HASH

    const payloadHash = sha256Hex(canonicalJson(input.payload))
    // Non-fungibility, per upstream: the token id derives from what it says, who
    // acted, and what came before. No two engagements can collide, and reordering
    // one breaks every hash after it.
    const entryHash = sha256Hex(
      `${payloadHash}${input.signer}${prevEntryId ?? ''}`,
    )

    const seal = sealPayload({
      sequence,
      projectId: input.projectId,
      entryType: input.entryType,
      subjectKey: input.subjectKey,
      subjectTitle: input.subjectTitle,
      signer: input.signer,
      payloadHash,
      entryHash,
      prevEntryId,
      prevHash,
    })

    const signature = ed25519Sign(
      null,
      Buffer.from(seal, 'utf8'),
      privateKeyFrom(key),
    ).toString('base64')

    const id = crypto.randomUUID()

    await tx.insert(sentinelEntries).values({
      id,
      userId: input.userId,
      projectId: input.projectId,
      sequence,
      prevEntryId,
      prevHash,
      entryHash,
      entryType: input.entryType,
      subjectKey: input.subjectKey,
      subjectTitle: input.subjectTitle,
      signer: input.signer,
      signature,
      publicKey: key.publicKey,
      payloadRef: input.payloadRef ?? null,
      payloadHash,
      payload: input.payload,
      objectiveId: input.objectiveId ?? null,
    })

    return { id, sequence, entryHash, signature, publicKey: key.publicKey }
  })
}

export interface ChainVerification {
  valid: boolean
  entries: number
  brokenAtSequence: number | null
  reason: string | null
  publicKey: string | null
}

/**
 * Re-derives every hash and re-checks every signature from the genesis link. Any
 * edit, deletion, or reordering of a row shows up here.
 */
export async function verifySentinelChain(
  projectId: string,
): Promise<ChainVerification> {
  const rows = await db
    .select()
    .from(sentinelEntries)
    .where(eq(sentinelEntries.projectId, projectId))
    .orderBy(asc(sentinelEntries.sequence))

  let prevHash = GENESIS_HASH
  let prevId: string | null = null

  for (const row of rows) {
    const broken = (reason: string): ChainVerification => ({
      valid: false,
      entries: rows.length,
      brokenAtSequence: row.sequence,
      reason,
      publicKey: rows[0]?.publicKey ?? null,
    })

    if (row.prevHash !== prevHash) return broken('link hash mismatch')
    if (row.prevEntryId !== prevId) return broken('link id mismatch')

    const payloadHash = sha256Hex(canonicalJson(row.payload))
    if (payloadHash !== row.payloadHash) return broken('payload tampered')

    const entryHash = sha256Hex(
      `${payloadHash}${row.signer}${row.prevEntryId ?? ''}`,
    )
    if (entryHash !== row.entryHash) return broken('token id mismatch')

    const seal = sealPayload({
      sequence: row.sequence,
      projectId: row.projectId,
      entryType: row.entryType,
      subjectKey: row.subjectKey,
      subjectTitle: row.subjectTitle,
      signer: row.signer,
      payloadHash: row.payloadHash,
      entryHash: row.entryHash,
      prevEntryId: row.prevEntryId,
      prevHash: row.prevHash,
    })

    const signatureValid = ed25519Verify(
      null,
      Buffer.from(seal, 'utf8'),
      publicKeyFrom(row.publicKey),
      Buffer.from(row.signature, 'base64'),
    )
    if (!signatureValid) return broken('signature invalid')

    prevHash = row.entryHash
    prevId = row.id
  }

  return {
    valid: true,
    entries: rows.length,
    brokenAtSequence: null,
    reason: null,
    publicKey: rows[0]?.publicKey ?? null,
  }
}

/** The chain for one project, oldest first, for display. */
export async function readSentinelChain(projectId: string, limit = 200) {
  const rows = await db
    .select()
    .from(sentinelEntries)
    .where(and(eq(sentinelEntries.projectId, projectId)))
    .orderBy(desc(sentinelEntries.sequence))
    .limit(limit)

  return rows.reverse()
}
