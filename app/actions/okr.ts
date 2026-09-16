'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { objectives, projectBots, projects } from '@/lib/db/schema'
import { resolveModel } from '@/lib/ai'
import { and, asc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { generateObject } from 'ai'
import { z } from 'zod'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export type ObjectiveRow = typeof objectives.$inferSelect

export interface OkrNode extends ObjectiveRow {
  children: OkrNode[]
}

const MAX_DEPTH = 3

async function assertProjectOwnership(userId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1)
  if (!project) throw new Error('Project not found')
  return project
}

/**
 * Loads the whole OKR tree for a project and nests it. Rows are fetched once and
 * assembled in memory — the tree is small and this avoids recursive queries.
 */
export async function getOkrTree(projectId: string): Promise<OkrNode[]> {
  const userId = await getUserId()
  await assertProjectOwnership(userId, projectId)

  const rows = await db
    .select()
    .from(objectives)
    .where(and(eq(objectives.projectId, projectId), eq(objectives.userId, userId)))
    .orderBy(asc(objectives.depth), asc(objectives.position), asc(objectives.createdAt))

  const nodes = new Map<string, OkrNode>()
  for (const row of rows) nodes.set(row.id, { ...row, children: [] })

  const roots: OkrNode[] = []
  for (const row of rows) {
    const node = nodes.get(row.id)!
    const parent = row.parentObjectiveId ? nodes.get(row.parentObjectiveId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  return roots
}

/**
 * Recomputes progress for every ancestor of `startId`, bottom-up. A node that has
 * children always derives its percentage from them, so the root Overall Goal
 * reflects the whole tree rather than a hand-entered number.
 */
async function rollupAncestors(userId: string, startId: string | null) {
  let currentId = startId
  let guard = 0

  while (currentId && guard < MAX_DEPTH + 2) {
    guard += 1

    const [node] = await db
      .select()
      .from(objectives)
      .where(and(eq(objectives.id, currentId), eq(objectives.userId, userId)))
      .limit(1)
    if (!node) break

    const children = await db
      .select({ progress: objectives.progress })
      .from(objectives)
      .where(
        and(
          eq(objectives.parentObjectiveId, currentId),
          eq(objectives.userId, userId),
        ),
      )

    if (children.length > 0) {
      const average = Math.round(
        children.reduce((sum, child) => sum + child.progress, 0) / children.length,
      )
      await db
        .update(objectives)
        .set({ progress: average, updatedAt: new Date() })
        .where(and(eq(objectives.id, currentId), eq(objectives.userId, userId)))
    }

    currentId = node.parentObjectiveId
  }
}

export async function createObjective(input: {
  projectId: string
  parentObjectiveId?: string | null
  title: string
  description?: string
  ownerBotId?: string | null
}): Promise<ObjectiveRow> {
  const userId = await getUserId()
  await assertProjectOwnership(userId, input.projectId)

  const title = input.title.trim()
  if (!title) throw new Error('Goal title is required')

  let depth = 0
  if (input.parentObjectiveId) {
    const [parent] = await db
      .select()
      .from(objectives)
      .where(
        and(
          eq(objectives.id, input.parentObjectiveId),
          eq(objectives.userId, userId),
          eq(objectives.projectId, input.projectId),
        ),
      )
      .limit(1)
    if (!parent) throw new Error('Parent goal not found')
    if (parent.depth >= MAX_DEPTH) {
      throw new Error(`Goal trees are limited to ${MAX_DEPTH + 1} levels`)
    }
    depth = parent.depth + 1
  }

  const siblings = await db
    .select({ id: objectives.id })
    .from(objectives)
    .where(
      and(
        eq(objectives.projectId, input.projectId),
        eq(objectives.userId, userId),
        depth === 0
          ? eq(objectives.parentObjectiveId, input.parentObjectiveId ?? '')
          : eq(objectives.parentObjectiveId, input.parentObjectiveId!),
      ),
    )

  const [created] = await db
    .insert(objectives)
    .values({
      id: crypto.randomUUID(),
      userId,
      projectId: input.projectId,
      parentObjectiveId: input.parentObjectiveId ?? null,
      ownerBotId: input.ownerBotId ?? null,
      title,
      description: input.description?.trim() || null,
      kind: depth === 0 ? 'overall_goal' : 'sub_goal',
      status: 'proposed',
      progress: 0,
      depth,
      position: siblings.length,
    })
    .returning()

  revalidatePath('/')
  return created
}

/**
 * Sets a leaf goal's completion percentage and rolls the change up the tree, so
 * department agents finishing work moves every ancestor including the root.
 */
export async function setObjectiveProgress(input: {
  id: string
  progress: number
  status?: string
}): Promise<void> {
  const userId = await getUserId()

  const progress = Math.max(0, Math.min(100, Math.round(input.progress)))

  const [node] = await db
    .select()
    .from(objectives)
    .where(and(eq(objectives.id, input.id), eq(objectives.userId, userId)))
    .limit(1)
  if (!node) throw new Error('Goal not found')

  const status =
    input.status ?? (progress >= 100 ? 'complete' : progress > 0 ? 'in_progress' : 'proposed')

  await db
    .update(objectives)
    .set({ progress, status, updatedAt: new Date() })
    .where(and(eq(objectives.id, input.id), eq(objectives.userId, userId)))

  await rollupAncestors(userId, node.parentObjectiveId)
  revalidatePath('/')
}

export async function updateObjective(input: {
  id: string
  title?: string
  description?: string
  ownerBotId?: string | null
  status?: string
}): Promise<void> {
  const userId = await getUserId()

  const [node] = await db
    .select()
    .from(objectives)
    .where(and(eq(objectives.id, input.id), eq(objectives.userId, userId)))
    .limit(1)
  if (!node) throw new Error('Goal not found')

  await db
    .update(objectives)
    .set({
      ...(input.title !== undefined ? { title: input.title.trim() || node.title } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
      ...(input.ownerBotId !== undefined ? { ownerBotId: input.ownerBotId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(objectives.id, input.id), eq(objectives.userId, userId)))

  revalidatePath('/')
}

/** Deletes a goal and everything beneath it. */
export async function deleteObjective(id: string): Promise<void> {
  const userId = await getUserId()

  const [node] = await db
    .select()
    .from(objectives)
    .where(and(eq(objectives.id, id), eq(objectives.userId, userId)))
    .limit(1)
  if (!node) return

  const all = await db
    .select({ id: objectives.id, parentObjectiveId: objectives.parentObjectiveId })
    .from(objectives)
    .where(
      and(eq(objectives.projectId, node.projectId), eq(objectives.userId, userId)),
    )

  const childrenOf = new Map<string | null, string[]>()
  for (const row of all) {
    const key = row.parentObjectiveId
    const list = childrenOf.get(key) ?? []
    list.push(row.id)
    childrenOf.set(key, list)
  }

  const toDelete: string[] = []
  const stack = [id]
  while (stack.length > 0) {
    const current = stack.pop()!
    toDelete.push(current)
    for (const child of childrenOf.get(current) ?? []) stack.push(child)
  }

  for (const targetId of toDelete) {
    await db
      .delete(objectives)
      .where(and(eq(objectives.id, targetId), eq(objectives.userId, userId)))
  }

  await rollupAncestors(userId, node.parentObjectiveId)
  revalidatePath('/')
}

const subGoalSchema = z.object({
  subGoals: z.array(
    z.object({
      title: z.string().describe('Short imperative goal title'),
      description: z.string().describe('One sentence on the deliverable and how completion is measured'),
      ownerSpecialistKey: z.string().describe('Specialist key of the department that owns this goal'),
    }),
  ),
})

/**
 * Asks the project's department agents to break a goal into sub-goals. Each
 * sub-goal is assigned to the department whose decision rights cover it, which is
 * how the tree gets populated by agents rather than by hand.
 */
export async function populateSubGoals(input: {
  projectId: string
  parentObjectiveId: string
}): Promise<ObjectiveRow[]> {
  const userId = await getUserId()
  const project = await assertProjectOwnership(userId, input.projectId)

  const [parent] = await db
    .select()
    .from(objectives)
    .where(
      and(
        eq(objectives.id, input.parentObjectiveId),
        eq(objectives.userId, userId),
        eq(objectives.projectId, input.projectId),
      ),
    )
    .limit(1)
  if (!parent) throw new Error('Parent goal not found')
  if (parent.depth >= MAX_DEPTH) {
    throw new Error(`Goal trees are limited to ${MAX_DEPTH + 1} levels`)
  }

  const bots = await db
    .select()
    .from(projectBots)
    .where(
      and(eq(projectBots.projectId, input.projectId), eq(projectBots.userId, userId)),
    )
    .orderBy(asc(projectBots.position))
  if (bots.length === 0) throw new Error('This project has no department agents yet')

  const roster = bots
    .map((bot) => `- ${bot.specialistKey}: ${bot.displayName} — ${bot.mandate ?? ''}`)
    .join('\n')

  const { object } = await generateObject({
    model: resolveModel(),
    schema: subGoalSchema,
    prompt: [
      'You are the Kojiki orchestration layer decomposing an objective into sub-goals.',
      '',
      `Project: ${project.name}`,
      project.objective ? `Project objective: ${project.objective}` : '',
      `Parent goal: ${parent.title}`,
      parent.description ? `Parent goal detail: ${parent.description}` : '',
      '',
      'Available department agents (use ownerSpecialistKey exactly as written):',
      roster,
      '',
      'Rules:',
      '- Produce 3 to 6 sub-goals that together fully deliver the parent goal.',
      '- Assign each to exactly one department agent whose decision rights cover it.',
      '- Spread ownership across departments where the work genuinely crosses them.',
      '- Each description must state the deliverable and how completion is measured.',
      '- Titles are short and imperative. No numbering, no markdown.',
    ]
      .filter(Boolean)
      .join('\n'),
  })

  const botByKey = new Map(bots.map((bot) => [bot.specialistKey, bot]))
  const depth = parent.depth + 1

  const existing = await db
    .select({ id: objectives.id })
    .from(objectives)
    .where(
      and(
        eq(objectives.parentObjectiveId, input.parentObjectiveId),
        eq(objectives.userId, userId),
      ),
    )

  const created: ObjectiveRow[] = []

  for (const [index, subGoal] of object.subGoals.entries()) {
    const owner = botByKey.get(subGoal.ownerSpecialistKey) ?? null
    const [row] = await db
      .insert(objectives)
      .values({
        id: crypto.randomUUID(),
        userId,
        projectId: input.projectId,
        parentObjectiveId: input.parentObjectiveId,
        ownerBotId: owner?.id ?? null,
        title: subGoal.title.trim(),
        description: subGoal.description.trim() || null,
        kind: 'sub_goal',
        status: 'proposed',
        progress: 0,
        depth,
        position: existing.length + index,
      })
      .returning()
    created.push(row)
  }

  revalidatePath('/')
  return created
}
