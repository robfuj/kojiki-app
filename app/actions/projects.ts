'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  chatMessages,
  chatSessions,
  decisions,
  objectives,
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
 * Creates a project and instantiates its bot roster. The roster is the set of
 * specialists the orchestrator selected for the user's goal during orientation,
 * ordered by the handoff graph so the side rail reads in routing order.
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

  // The orchestrator selected these specialists for the user's goal during
  // orientation. Only they are instantiated — the roster follows the goal.
  const rosterKeys = Array.isArray(orientation.rosterKeys)
    ? (orientation.rosterKeys as string[])
    : []

  if (rosterKeys.length === 0) {
    throw new Error(
      'No specialists were selected for your goal. Re-run the Orientation Protocol.',
    )
  }

  const roster = deriveRoster(rosterKeys)

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

  // The OKR tree is rooted at the project's Overall Goal. Department agents
  // populate sub-goals beneath it and roll their percentages up to this node.
  await db.insert(objectives).values({
    id: crypto.randomUUID(),
    userId,
    projectId,
    parentObjectiveId: null,
    ownerBotId: null,
    title: input.objective?.trim() || name,
    description: input.objective?.trim() ? name : null,
    kind: 'overall_goal',
    status: 'active',
    progress: 0,
    depth: 0,
    position: 0,
  })

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
