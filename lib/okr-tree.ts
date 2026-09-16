import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { objectives } from '@/lib/db/schema'

/**
 * Shared OKR tree mechanics, used by both the goal actions and the task
 * reabsorption flow. Kept out of the 'use server' modules so it can be imported
 * by either without becoming a callable endpoint.
 */

export const MAX_DEPTH = 3

/**
 * Recomputes progress for every ancestor of `startId`, bottom-up. A node that has
 * children always derives its percentage from them, so the root Overall Goal
 * reflects the whole tree rather than a hand-entered number.
 *
 * This is what makes reabsorption visible: a sub-agent finishing work moves its
 * sub-goal, which moves its parent, which moves the root.
 */
export async function rollupAncestors(userId: string, startId: string | null) {
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
        and(eq(objectives.parentObjectiveId, currentId), eq(objectives.userId, userId)),
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
