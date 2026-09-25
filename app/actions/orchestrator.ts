'use server'

/**
 * The Orchestrator tab's server surface: run a whole-project review, read the
 * latest one back, and record a decision the review recommended.
 */

import { requireUserId } from '@/lib/session'
import { db } from '@/lib/db'
import {
  decisions,
  gateRequests,
  myceliumSignals,
  objectives,
  orchestratorReviews,
  projectBots,
  projects,
  subAgentTasks,
  userPreferences,
} from '@/lib/db/schema'
import { runOrchestratorReview, type OrchestratorReview } from '@/lib/orchestrator'
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/locales'
import { and, asc, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const getUserId = requireUserId

export type ReviewRow = typeof orchestratorReviews.$inferSelect
export type { OrchestratorReview }

async function assertProjectOwnership(userId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1)
  if (!project) throw new Error('Project not found')
  return project
}

export async function getLatestReview(projectId: string): Promise<ReviewRow | null> {
  const userId = await getUserId()
  await assertProjectOwnership(userId, projectId)

  const [row] = await db
    .select()
    .from(orchestratorReviews)
    .where(
      and(
        eq(orchestratorReviews.projectId, projectId),
        eq(orchestratorReviews.userId, userId),
      ),
    )
    .orderBy(desc(orchestratorReviews.createdAt))
    .limit(1)

  return row ?? null
}

/**
 * Builds the digest from the project's own rows and runs the review over it.
 * Objective ids are included so an "open objective" action can point at a real
 * node; department names are mapped back to bot ids so an "ask" action opens a
 * real conversation.
 */
export async function runProjectReview(projectId: string): Promise<ReviewRow> {
  const userId = await getUserId()
  const project = await assertProjectOwnership(userId, projectId)

  const [bots, objs, tasks, gates, signals] = await Promise.all([
    db
      .select()
      .from(projectBots)
      .where(and(eq(projectBots.projectId, projectId), eq(projectBots.userId, userId)))
      .orderBy(asc(projectBots.position)),
    db
      .select()
      .from(objectives)
      .where(and(eq(objectives.projectId, projectId), eq(objectives.userId, userId)))
      .orderBy(asc(objectives.depth), asc(objectives.position)),
    db
      .select()
      .from(subAgentTasks)
      .where(and(eq(subAgentTasks.projectId, projectId), eq(subAgentTasks.userId, userId))),
    db
      .select()
      .from(gateRequests)
      .where(and(eq(gateRequests.projectId, projectId), eq(gateRequests.userId, userId))),
    db
      .select()
      .from(myceliumSignals)
      .where(and(eq(myceliumSignals.projectId, projectId), eq(myceliumSignals.userId, userId)))
      .orderBy(desc(myceliumSignals.firedAt))
      .limit(15),
  ])

  const botNames = new Map(bots.map((bot) => [bot.id, bot.displayName]))
  const objectiveTitles = new Map(objs.map((objective) => [objective.id, objective.title]))

  const digest = [
    `Project: ${project.name}`,
    project.objective ? `Project objective: ${project.objective}` : '',
    '',
    'Objectives (id · status · progress · title · owner):',
    ...(objs.length
      ? objs.map(
          (objective) =>
            `- ${objective.id} · [${objective.status} · ${objective.progress}%] ${objective.title} (owner: ${
              objective.ownerBotId
                ? (botNames.get(objective.ownerBotId) ?? 'unassigned')
                : 'unassigned'
            })`,
        )
      : ['- none']),
    '',
    'Sub-agent tasks:',
    ...(tasks.length
      ? tasks.map(
          (task) =>
            `- [${task.status}${task.validationResult ? ` · ${task.validationResult}` : ''}] ${task.title} — ${task.subAgentTitle} on "${objectiveTitles.get(task.objectiveId) ?? 'unknown objective'}"`,
        )
      : ['- none']),
    '',
    'Governance gates:',
    ...(gates.length
      ? gates.map(
          (gate) =>
            `- [${gate.status}] ${gate.title} (${gate.layer}, requested by ${gate.requestedByTitle})`,
        )
      : ['- none']),
    '',
    'Recent agent traffic:',
    ...(signals.length
      ? signals.map(
          (signal) =>
            `- ${signal.fromTitle} → ${signal.toTitle} (${signal.signalKind}): ${signal.body.slice(0, 140)}`,
        )
      : ['- none']),
  ]
    .filter((line) => line !== null)
    .join('\n')

  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)
  const locale = prefs && isLocale(prefs.locale) ? prefs.locale : DEFAULT_LOCALE

  const review = await runOrchestratorReview({ digest, userId, locale })

  // The model names departments and copies ids; neither can be trusted to
  // resolve, so both are mapped back to rows that exist before persisting.
  const botIdByName = new Map(
    bots.map((bot) => [bot.displayName.toLowerCase(), bot.id]),
  )
  const actions: OrchestratorReview['actions'] = review.actions.map((action) => {
    if (action.kind === 'ask_department') {
      const name = (action.departmentName ?? '').trim().toLowerCase()
      return { ...action, targetId: botIdByName.get(name) ?? null }
    }
    if (action.kind === 'open_objective') {
      return {
        ...action,
        targetId:
          action.targetId && objectiveTitles.has(action.targetId) ? action.targetId : null,
      }
    }
    return { ...action, targetId: null }
  })

  const [row] = await db
    .insert(orchestratorReviews)
    .values({
      id: crypto.randomUUID(),
      userId,
      projectId,
      findings: review.findings,
      actions,
    })
    .returning()

  revalidatePath('/')
  return row
}

/** Records a decision the user made from a review recommendation. */
export async function recordDecision(input: {
  projectId: string
  title: string
  summary?: string | null
}): Promise<void> {
  const userId = await getUserId()
  await assertProjectOwnership(userId, input.projectId)

  const title = input.title.trim()
  if (!title) throw new Error('A decision needs a title')

  await db.insert(decisions).values({
    id: crypto.randomUUID(),
    userId,
    projectId: input.projectId,
    botId: null,
    sessionId: null,
    stage: 'orchestrator',
    title,
    summary: input.summary?.trim() || null,
    payload: { source: 'orchestrator_review' },
    status: 'accepted',
  })

  revalidatePath('/')
}
