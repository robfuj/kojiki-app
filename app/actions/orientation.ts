'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { orientationProfiles } from '@/lib/db/schema'
import { runOrchestrator } from '@/lib/orchestrator'
import type { OrientationAnswers } from '@/lib/ontology/orientation'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export type OrientationRecord = typeof orientationProfiles.$inferSelect

export async function getOrientation(): Promise<OrientationRecord | null> {
  const userId = await getUserId()
  const rows = await db
    .select()
    .from(orientationProfiles)
    .where(eq(orientationProfiles.userId, userId))
    .orderBy(desc(orientationProfiles.createdAt))
    .limit(1)
  return rows[0] ?? null
}

/** Validates and normalizes the protocol answers before anything is persisted. */
function normalize(answers: OrientationAnswers): OrientationAnswers {
  const userName = answers.userName.trim()
  const goal = answers.goal.trim()
  const industry = answers.industry.trim()

  if (!userName) throw new Error('Your name is required')
  if (!goal) throw new Error('Your goal is required')
  if (!industry) throw new Error('Your industry is required')

  return {
    userName,
    goal,
    industry,
    jurisdiction: answers.jurisdiction?.trim() || null,
    geography: answers.geography?.trim() || null,
    businessModel: answers.businessModel?.trim() || null,
  }
}

/**
 * Completes the Orientation Protocol.
 *
 * The orchestrator runs here, before the workspace opens: it researches the
 * user's goal and industry, then selects which specialists that goal needs.
 * Both the brief and the selected roster are persisted so projects seed from
 * them and every sibling agent sees the same research.
 */
export async function completeOrientation(
  answers: OrientationAnswers,
): Promise<OrientationRecord> {
  const userId = await getUserId()
  const normalized = normalize(answers)

  const orchestrated = await runOrchestrator(normalized)

  const [row] = await db
    .insert(orientationProfiles)
    .values({
      id: crypto.randomUUID(),
      userId,
      userName: normalized.userName,
      goal: normalized.goal,
      industry: normalized.industry,
      jurisdiction: normalized.jurisdiction,
      geography: normalized.geography,
      businessModel: normalized.businessModel,
      researchBrief: orchestrated.brief,
      researchMethod: orchestrated.researchMethod,
      rosterRationale: orchestrated.rosterRationale,
      rosterKeys: orchestrated.rosterKeys,
      researchedAt: new Date(),
      completedAt: new Date(),
    })
    .returning()

  return row
}

/**
 * Re-runs the orchestrator on update, because a changed goal means a changed
 * roster — the specialists are a consequence of the goal.
 */
export async function updateOrientation(
  id: string,
  answers: OrientationAnswers,
): Promise<OrientationRecord> {
  const userId = await getUserId()
  const normalized = normalize(answers)

  const orchestrated = await runOrchestrator(normalized)

  const [row] = await db
    .update(orientationProfiles)
    .set({
      userName: normalized.userName,
      goal: normalized.goal,
      industry: normalized.industry,
      jurisdiction: normalized.jurisdiction,
      geography: normalized.geography,
      businessModel: normalized.businessModel,
      researchBrief: orchestrated.brief,
      researchMethod: orchestrated.researchMethod,
      rosterRationale: orchestrated.rosterRationale,
      rosterKeys: orchestrated.rosterKeys,
      researchedAt: new Date(),
    })
    .where(
      and(
        eq(orientationProfiles.id, id),
        eq(orientationProfiles.userId, userId),
      ),
    )
    .returning()

  if (!row) throw new Error('Orientation not found')
  return row
}
