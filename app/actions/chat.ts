'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { chatMessages, chatSessions, projectBots, projects } from '@/lib/db/schema'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export type SessionRow = typeof chatSessions.$inferSelect
export type MessageRow = typeof chatMessages.$inferSelect

/** One conversation per project + bot pair; created on first open. */
export async function getOrCreateSession(
  projectId: string,
  botId: string,
): Promise<SessionRow> {
  const userId = await getUserId()

  const [bot] = await db
    .select()
    .from(projectBots)
    .where(
      and(
        eq(projectBots.id, botId),
        eq(projectBots.projectId, projectId),
        eq(projectBots.userId, userId),
      ),
    )
    .limit(1)

  if (!bot) throw new Error('Bot not found in this project')

  const [existing] = await db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.projectId, projectId),
        eq(chatSessions.botId, botId),
        eq(chatSessions.userId, userId),
      ),
    )
    .limit(1)

  if (existing) return existing

  const [created] = await db
    .insert(chatSessions)
    .values({
      id: crypto.randomUUID(),
      userId,
      projectId,
      botId,
      title: bot.displayName,
    })
    .returning()

  revalidatePath('/')
  return created
}

/**
 * One conversation per project + sub-agent pair.
 *
 * A sub-agent borrows its parent department's bot row — it is not a separate bot —
 * but gets its own session and its own prompt built from its ontology entry, so
 * the user can address the SEO Specialist directly rather than only through the
 * Marketing head. When `objectiveId` is supplied the conversation is scoped to one
 * sub-goal, and the sub-agent is handed the task it is running there.
 */
export async function getOrCreateSubAgentSession(input: {
  projectId: string
  botId: string
  parentSpecialistKey: string
  subAgentKey: string
  subAgentTitle: string
  objectiveId?: string | null
}): Promise<SessionRow> {
  const userId = await getUserId()

  const [bot] = await db
    .select()
    .from(projectBots)
    .where(
      and(
        eq(projectBots.id, input.botId),
        eq(projectBots.projectId, input.projectId),
        eq(projectBots.userId, userId),
      ),
    )
    .limit(1)

  if (!bot) throw new Error('Bot not found in this project')

  const [existing] = await db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.projectId, input.projectId),
        eq(chatSessions.botId, input.botId),
        eq(chatSessions.userId, userId),
        eq(chatSessions.agentKind, 'sub_agent'),
        eq(chatSessions.subAgentKey, input.subAgentKey),
        input.objectiveId
          ? eq(chatSessions.objectiveId, input.objectiveId)
          : isNull(chatSessions.objectiveId),
      ),
    )
    .limit(1)

  if (existing) return existing

  const [created] = await db
    .insert(chatSessions)
    .values({
      id: crypto.randomUUID(),
      userId,
      projectId: input.projectId,
      botId: input.botId,
      agentKind: 'sub_agent',
      subAgentKey: input.subAgentKey,
      parentSpecialistKey: input.parentSpecialistKey,
      objectiveId: input.objectiveId ?? null,
      title: input.subAgentTitle,
    })
    .returning()

  revalidatePath('/')
  return created
}

/**
 * One orchestrator conversation per project. It has no bot row: the orchestrator
 * is the layer above the departments, not one of them.
 */
export async function getOrCreateOrchestratorSession(
  projectId: string,
): Promise<SessionRow> {
  const userId = await getUserId()

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1)

  if (!project) throw new Error('Project not found')

  const [existing] = await db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.projectId, projectId),
        eq(chatSessions.userId, userId),
        eq(chatSessions.agentKind, 'orchestrator'),
      ),
    )
    .limit(1)

  if (existing) return existing

  const [created] = await db
    .insert(chatSessions)
    .values({
      id: crypto.randomUUID(),
      userId,
      projectId,
      botId: null,
      agentKind: 'orchestrator',
      title: 'Orchestrator',
    })
    .returning()

  revalidatePath('/')
  return created
}

export async function getSessionMessages(
  sessionId: string,
): Promise<MessageRow[]> {
  const userId = await getUserId()
  return db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.sessionId, sessionId),
        eq(chatMessages.userId, userId),
      ),
    )
    .orderBy(asc(chatMessages.createdAt))
}

export async function listProjectSessions(
  projectId: string,
): Promise<SessionRow[]> {
  const userId = await getUserId()
  return db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.projectId, projectId),
        eq(chatSessions.userId, userId),
      ),
    )
}
