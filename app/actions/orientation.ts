'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { orientationProfiles } from '@/lib/db/schema'
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

export async function completeOrientation(
  answers: OrientationAnswers,
): Promise<OrientationRecord> {
  const userId = await getUserId()

  const id = crypto.randomUUID()
  const [row] = await db
    .insert(orientationProfiles)
    .values({
      id,
      userId,
      agentName: answers.agentName,
      functionLine: answers.functionLine,
      industry: answers.industry ?? null,
      sector: answers.sector ?? null,
      country: answers.country ?? null,
      region: answers.region ?? null,
      regulatoryRegime: answers.regulatoryRegime ?? null,
      geography: answers.geography ?? null,
      businessModel: answers.businessModel ?? null,
      groupId: answers.groupId ?? null,
      siblingAgents: [],
      completedAt: new Date(),
    })
    .returning()

  return row
}

export async function updateOrientation(
  id: string,
  answers: OrientationAnswers,
): Promise<OrientationRecord> {
  const userId = await getUserId()

  const [row] = await db
    .update(orientationProfiles)
    .set({
      agentName: answers.agentName,
      functionLine: answers.functionLine,
      industry: answers.industry ?? null,
      sector: answers.sector ?? null,
      country: answers.country ?? null,
      region: answers.region ?? null,
      regulatoryRegime: answers.regulatoryRegime ?? null,
      geography: answers.geography ?? null,
      businessModel: answers.businessModel ?? null,
      groupId: answers.groupId ?? null,
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
