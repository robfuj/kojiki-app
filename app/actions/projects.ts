'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  chatMessages,
  chatSessions,
  decisions,
  orientationProfiles,
  projectBots,
  projects,
} from '@/lib/db/schema'
import { deriveRoster } from '@/lib/ontology/orientation'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

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

/**
 * Creates a project and instantiates its bot roster. The roster is derived from
 * the Orientation Protocol answers, so the side rail reflects the registering
 * agent's function line and its handoff graph.
 */
export async function createProject(input: {
  name: string
  objective?: string
}): Promise<ProjectRow> {
  const userId = await getUserId()

  const name = input.name.trim()
  if (!name) throw new Error('Project name is required')

  const [orientation] = await db
    .select()
    .from(orientationProfiles)
    .where(eq(orientationProfiles.userId, userId))
    .orderBy(desc(orientationProfiles.createdAt))
    .limit(1)

  if (!orientation) {
    throw new Error('Complete the Orientation Protocol before creating a project')
  }

  const projectId = crypto.randomUUID()

  const [project] = await db
    .insert(projects)
    .values({
      id: projectId,
      userId,
      name,
      objective: input.objective?.trim() || null,
      orientationId: orientation.id,
    })
    .returning()

  const roster = deriveRoster({
    agentName: orientation.agentName,
    functionLine: orientation.functionLine,
    industry: orientation.industry,
    sector: orientation.sector,
    country: orientation.country,
    region: orientation.region,
    regulatoryRegime: orientation.regulatoryRegime,
    geography: orientation.geography,
    businessModel: orientation.businessModel,
    groupId: orientation.groupId,
  })

  await db.insert(projectBots).values(
    roster.map((bot) => ({
      id: crypto.randomUUID(),
      userId,
      projectId,
      specialistKey: bot.specialistKey,
      displayName: bot.displayName,
      functionLine: bot.functionLine,
      mandate: bot.mandate,
      decisionRights: bot.decisionRights,
      handoffTargets: bot.handoffTargets,
      synapsisStages: bot.synapsisStages,
      position: bot.position,
    })),
  )

  revalidatePath('/')
  return project
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
    .delete(projectBots)
    .where(and(eq(projectBots.projectId, projectId), eq(projectBots.userId, userId)))
  await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))

  revalidatePath('/')
}
