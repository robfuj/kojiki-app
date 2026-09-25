'use server'

import { populateSubGoals } from '@/app/actions/okr'
import type { ProjectRow } from '@/app/actions/projects'
import { getLocale } from '@/app/actions/settings'
import { requireUserId } from '@/lib/session'
import { db } from '@/lib/db'
import { objectives, orientationProfiles, projectBots, projects } from '@/lib/db/schema'
import { bootstrapProjectRegistry } from '@/lib/engine/registry'
import { deriveRoster, type OrientationAnswers } from '@/lib/ontology/orientation'
import {
  runClarifyPhase,
  runProjectIntake,
  runReResearchPhase,
  type ClarifyQuestion,
  type ProjectIntakeResult,
  type ReResearchResult,
  type ResearchBrief,
} from '@/lib/orchestrator'
import { desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const getUserId = requireUserId

async function loadOrientation(userId: string): Promise<OrientationAnswers> {
  const [row] = await db
    .select()
    .from(orientationProfiles)
    .where(eq(orientationProfiles.userId, userId))
    .orderBy(desc(orientationProfiles.createdAt))
    .limit(1)

  if (!row) {
    throw new Error('Complete the Orientation Protocol before creating a project')
  }

  return {
    userName: row.userName,
    goal: row.goal,
    industry: row.industry,
    jurisdiction: row.jurisdiction,
    geography: row.geography,
    businessModel: row.businessModel,
  }
}

/**
 * Step one of a new project: the orchestrator reads the goal, researches the
 * field, and returns the rundown plus the questions worth asking.
 *
 * Nothing is written. The user sees the brief and answers the questions before a
 * project row exists, so a goal they abandon costs nothing and a goal they refine
 * is not half-created.
 */
export async function researchProjectGoal(input: {
  goal: string
  clarifyAnswers?: IntakeAnswer[]
}): Promise<ProjectIntakeResult> {
  const userId = await getUserId()
  const goal = input.goal.trim()

  if (goal.length < 8) {
    throw new Error('Describe the goal in a little more detail.')
  }
  if (goal.length > 2000) {
    throw new Error('That goal is too long. Keep it under 2000 characters.')
  }

  const orientation = await loadOrientation(userId)
  const locale = await getLocale()

  return runProjectIntake({
    orientation,
    goal,
    userId,
    locale,
    clarifyAnswers: sanitiseAnswers(input.clarifyAnswers),
  })
}

/**
 * Phase one of the orientation protocol: the orchestrator reads the goal and
 * returns only the questions the goal leaves open. Nothing is written.
 */
export async function clarifyProjectGoal(input: {
  goal: string
}): Promise<ClarifyQuestion[]> {
  const userId = await getUserId()
  const goal = input.goal.trim()

  if (goal.length < 8) {
    throw new Error('Describe the goal in a little more detail.')
  }
  if (goal.length > 2000) {
    throw new Error('That goal is too long. Keep it under 2000 characters.')
  }

  const orientation = await loadOrientation(userId)
  const locale = await getLocale()

  return runClarifyPhase({ orientation, goal, userId, locale })
}

/**
 * Phases four and five: the answers fold into the research context, the field
 * is researched again, and the goal is restated around what the user said.
 */
export async function reResearchProjectGoal(input: {
  goal: string
  clarifyAnswers?: IntakeAnswer[]
  answers?: IntakeAnswer[]
  brief: ResearchBrief
}): Promise<ReResearchResult> {
  const userId = await getUserId()
  const goal = input.goal.trim()

  if (goal.length < 8) {
    throw new Error('Describe the goal in a little more detail.')
  }
  if (goal.length > 2000) {
    throw new Error('That goal is too long. Keep it under 2000 characters.')
  }

  const orientation = await loadOrientation(userId)
  const locale = await getLocale()

  return runReResearchPhase({
    orientation,
    goal,
    clarifyAnswers: sanitiseAnswers(input.clarifyAnswers),
    answers: sanitiseAnswers(input.answers),
    priorBrief: input.brief,
    userId,
    locale,
  })
}

function sanitiseAnswers(
  answers: IntakeAnswer[] | undefined,
): { prompt: string; answer: string }[] {
  return (answers ?? [])
    .filter((item) => item.answer.trim().length > 0)
    .slice(0, 8)
    .map((item) => ({
      prompt: item.prompt.slice(0, 500),
      answer: item.answer.trim().slice(0, 2000),
    }))
}

export interface IntakeAnswer {
  prompt: string
  answer: string
}

/**
 * Step two: build the project from the goal, the answers, and the roster the
 * orchestrator chose.
 *
 * The roster is derived from the keys the orchestrator selected for this goal
 * rather than inherited from orientation, so a project gets the specialists it
 * needs. Sub-goals are then decomposed under the root objective by the same
 * routine the tree uses, which means the project opens already dispatchable.
 *
 * The roster keys and answers travel back from the client, so they are validated
 * against the ontology and length-capped rather than trusted.
 */
export async function createProjectFromIntake(input: {
  name: string
  goal: string
  rosterKeys: string[]
  rosterRationale: string
  brief: ResearchBrief
  researchMethod: 'web-search' | 'model-reasoning'
  answers: IntakeAnswer[]
  /** Phase five's restatement; becomes the root objective when present. */
  refinedGoal?: string
  refinementNote?: string
}): Promise<ProjectRow> {
  const userId = await getUserId()

  const name = input.name.trim()
  const goal = input.goal.trim()
  if (!name) throw new Error('Project name is required')
  if (!goal) throw new Error('Project goal is required')

  const orientation = await loadOrientation(userId)

  // Only keys the ontology defines can become agents; anything else is dropped.
  const roster = deriveRoster(input.rosterKeys)
  if (roster.length === 0) {
    throw new Error('The orchestrator selected no specialists for this goal')
  }

  const answers = input.answers
    .filter((item) => item.answer.trim().length > 0)
    .slice(0, 5)
    .map((item) => ({
      prompt: item.prompt.slice(0, 500),
      answer: item.answer.trim().slice(0, 2000),
    }))

  // The refined goal is capped and falls back to the raw goal: the root
  // objective must never be empty or unbounded.
  const refinedObjective = (input.refinedGoal?.trim() || goal).slice(0, 2000)

  const projectId = crypto.randomUUID()

  const [project] = await db
    .insert(projects)
    .values({
      id: projectId,
      userId,
      name,
      objective: goal,
      orientationId: null,
      intakeContext: {
        goal,
        refinedGoal: refinedObjective,
        refinementNote: input.refinementNote?.slice(0, 1000) ?? null,
        brief: input.brief,
        answers,
        rosterRationale: input.rosterRationale,
        researchMethod: input.researchMethod,
        companyGoal: orientation.goal,
        industry: orientation.industry,
      },
    })
    .returning()

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

  // The registry is the engine's authority on who exists: the orchestrator node
  // plus every head beneath it, carrying its ontology decision rights.
  await bootstrapProjectRegistry({ userId, projectId, roster })

  const [root] = await db
    .insert(objectives)
    .values({
      id: crypto.randomUUID(),
      userId,
      projectId,
      parentObjectiveId: null,
      ownerBotId: null,
      title: refinedObjective,
      description: name,
      kind: 'overall_goal',
      status: 'active',
      progress: 0,
      depth: 0,
      position: 0,
    })
    .returning()

  // Decomposition is best-effort: a project with a root objective and a roster is
  // usable, and the user can decompose from the tree if this call fails. Failing
  // the whole creation here would discard work that already succeeded.
  try {
    await populateSubGoals({ projectId, parentObjectiveId: root.id })
  } catch (error) {
    console.log(
      '[v0] intake decomposition deferred, project created with root objective only:',
      error instanceof Error ? error.message : String(error),
    )
  }

  revalidatePath('/')
  return project
}
