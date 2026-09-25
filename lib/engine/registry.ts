import 'server-only'

import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  myceliumEdgeExchanges,
  myceliumEdges,
  myceliumNodeAudit,
  myceliumNodes,
} from '@/lib/db/schema'

/**
 * The mycelium registry — the engine's authority on which nodes exist and
 * which pathways between them carry traffic. Mirrors the upstream
 * kojiki-ontology registry (mycelium_nodes / mycelium_edges), scoped per user.
 */

/** Registry identity for an agent inside a project: `projectId:agentKey`. */
export function nodeKey(projectId: string, agentKey: string): string {
  return `${projectId}:${agentKey}`
}

export async function registerNode(input: {
  userId: string
  projectId: string
  agentKey: string
  domain: string
  type: string
  status?: string
  publicKey?: string | null
  decisionRights?: unknown
  decisionRight?: string | null
  parentId?: string | null
}): Promise<string> {
  const id = nodeKey(input.projectId, input.agentKey)
  const now = new Date()
  const rights = (input.decisionRights ?? {}) as Record<string, unknown>

  await db
    .insert(myceliumNodes)
    .values({
      id,
      userId: input.userId,
      projectId: input.projectId,
      domain: input.domain,
      type: input.type,
      status: input.status ?? 'active',
      publicKey: input.publicKey ?? null,
      keyStatus: input.publicKey ? 'active' : 'none',
      keyIssuedAt: input.publicKey ? now : null,
      parentId: input.parentId ?? null,
      decisionRights: rights,
      decisionRight: input.decisionRight ?? null,
    })
    .onConflictDoUpdate({
      target: myceliumNodes.id,
      set: {
        status: input.status ?? 'active',
        decisionRights: rights,
        decisionRight: input.decisionRight ?? null,
        updatedAt: now,
      },
    })

  await recordNodeAudit({
    userId: input.userId,
    eventType: 'node_registered',
    nodeId: id,
    actor: 'runtime',
    detail: { domain: input.domain, type: input.type },
  })

  return id
}

/**
 * Registers a freshly created project: the orchestrator node, then every
 * department head beneath it carrying its ontology decision rights.
 */
export async function bootstrapProjectRegistry(input: {
  userId: string
  projectId: string
  roster: {
    specialistKey: string
    displayName: string
    functionLine: string
    mandate: string
    decisionRights: unknown
  }[]
}): Promise<void> {
  const orchestratorId = await registerNode({
    userId: input.userId,
    projectId: input.projectId,
    agentKey: 'orchestrator',
    domain: 'orchestration',
    type: 'orchestrator',
    decisionRights: { role: 'orchestrator' },
    decisionRight: 'orchestrate',
  })

  for (const bot of input.roster) {
    await registerNode({
      userId: input.userId,
      projectId: input.projectId,
      agentKey: bot.specialistKey,
      domain: bot.functionLine,
      type: 'department_head',
      parentId: orchestratorId,
      decisionRights: bot.decisionRights ?? {},
      decisionRight: bot.specialistKey,
    })
  }
}

export async function recordNodeAudit(input: {
  userId: string
  eventType: string
  nodeId: string
  actor?: string | null
  detail?: Record<string, unknown>
}): Promise<void> {
  await db.insert(myceliumNodeAudit).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    eventType: input.eventType,
    nodeId: input.nodeId,
    actor: input.actor ?? null,
    detail: input.detail ?? {},
  })
}

/**
 * Reinforces the edge between two nodes — the way the upstream registry learns
 * which pathways carry real traffic. Creates the edge on first contact and
 * counts every exchange after that.
 */
export async function reinforceEdge(input: {
  userId: string
  projectId: string
  fromAgent: string
  toAgent: string
  exchangeType?: 'reciprocal' | 'one_directional'
  signalId?: string | null
  triggerEvent?: string | null
}): Promise<void> {
  const fromKr = nodeKey(input.projectId, input.fromAgent)
  const toKr = nodeKey(input.projectId, input.toAgent)
  const reciprocal = input.exchangeType === 'reciprocal'
  const now = new Date()

  const [edge] = await db
    .insert(myceliumEdges)
    .values({
      id: crypto.randomUUID(),
      userId: input.userId,
      fromKr,
      toKr,
      weight: '1',
      reciprocalExchanges: reciprocal ? 1 : 0,
      oneDirectionalExchanges: reciprocal ? 0 : 1,
      lastReinforced: now,
      triggerEvent: input.triggerEvent ?? null,
    })
    .onConflictDoUpdate({
      target: [myceliumEdges.userId, myceliumEdges.fromKr, myceliumEdges.toKr],
      set: {
        reciprocalExchanges: sql`${myceliumEdges.reciprocalExchanges} + ${reciprocal ? 1 : 0}`,
        oneDirectionalExchanges: sql`${myceliumEdges.oneDirectionalExchanges} + ${reciprocal ? 0 : 1}`,
        weight: sql`(${myceliumEdges.reciprocalExchanges} + ${myceliumEdges.oneDirectionalExchanges} + 1)::text`,
        lastReinforced: now,
        triggerEvent: input.triggerEvent ?? null,
        updatedAt: now,
      },
    })
    .returning()

  await db.insert(myceliumEdgeExchanges).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    edgeId: edge.id,
    fromKr,
    toKr,
    exchangeType: input.exchangeType ?? 'one_directional',
    signalId: input.signalId ?? null,
  })
}
