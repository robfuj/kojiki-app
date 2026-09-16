'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { chatMessages, chatSessions, projectBots } from '@/lib/db/schema'
import { and, asc, eq } from 'drizzle-orm'
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
