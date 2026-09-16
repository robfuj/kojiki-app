'use server'

import { requireUserId } from '@/lib/session'
import { db } from '@/lib/db'
import {
  chatMessages,
  chatSessions,
  decisions,
  objectives,
  projectBots,
  projects,
} from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const getUserId = requireUserId

export type ProjectRow = typeof projects.$inferSelect
export type BotRow = typeof projectBots.$inferSelect

export async function listProjects(): Promise<ProjectRow[]> {
  const userId = await getUserId()
  return db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt))
}

export interface ProjectWorkspace {
  project: ProjectRow
  bots: BotRow[]
}

export async function getProjectWorkspace(
  projectId: string,
): Promise<ProjectWorkspace | null> {
  const userId = await getUserId()

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1)

  if (!project) return null

  const bots = await db
    .select()
    .from(projectBots)
    .where(
      and(
        eq(projectBots.projectId, projectId),
        eq(projectBots.userId, userId),
      ),
    )
    .orderBy(projectBots.position)

  return { project, bots }
}

export async function deleteProject(projectId: string): Promise<void> {
  const userId = await getUserId()
  const scope = and(
    eq(chatSessions.projectId, projectId),
    eq(chatSessions.userId, userId),
  )

  const sessions = await db.select({ id: chatSessions.id }).from(chatSessions).where(scope)
  const sessionIds = sessions.map((s) => s.id)

  for (const sessionId of sessionIds) {
    await db
      .delete(chatMessages)
      .where(
        and(
          eq(chatMessages.sessionId, sessionId),
          eq(chatMessages.userId, userId),
        ),
      )
  }

  await db.delete(chatSessions).where(scope)
  await db
    .delete(decisions)
    .where(and(eq(decisions.projectId, projectId), eq(decisions.userId, userId)))
  await db
    .delete(objectives)
    .where(and(eq(objectives.projectId, projectId), eq(objectives.userId, userId)))
  await db
    .delete(projectBots)
    .where(and(eq(projectBots.projectId, projectId), eq(projectBots.userId, userId)))
  await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))

  revalidatePath('/')
}
