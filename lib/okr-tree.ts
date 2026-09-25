import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { objectiveProgressHistory, objectives, subAgentTasks } from '@/lib/db/schema'

/**
 * Shared OKR tree mechanics, used by both the goal actions and the task
 * reabsorption flow. Kept out of the 'use server' modules so it can be imported
 * by either without becoming a callable endpoint.
 */

export const MAX_DEPTH = 3

/**
 * What the tasks committed to a sub-goal contribute to its percentage.
 *
 * The tree is the evidence ledger, so only Check's verdict counts: a checked
 * task contributes the score it was awarded, and a reabsorbed task contributes
 * nothing here because it lives on as a child node carrying that same score.
 * Undispatched, running and merely reported tasks contribute zero — a claim is
 * not delivery, and counting only child nodes would let one verified task read
 * as a finished sub-goal while siblings sit untouched.
 */
async function taskShares(userId: string, objectiveId: string): Promise<number[]> {
  const tasks = await db
    .select({
      validationResult: subAgentTasks.validationResult,
      outcomeScore: subAgentTasks.outcomeScore,
    })
    .from(subAgentTasks)
    .where(
      and(
        eq(subAgentTasks.objectiveId, objectiveId),
        eq(subAgentTasks.userId, userId),
        ne(subAgentTasks.status, 'reabsorbed'),
      ),
    )

  return tasks.map((task) =>
    task.validationResult === 'PASS' ? 100 : (task.outcomeScore ?? 0),
  )
}

/**
 * Recomputes progress for every ancestor of `startId`, bottom-up. A node that has
 * children or tasks in flight always derives its percentage from them, so the
 * root Overall Goal reflects the whole tree rather than a hand-entered number.
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

    const shares = [
      ...children.map((child) => child.progress),
      ...(await taskShares(userId, currentId)),
    ]

    if (shares.length > 0) {
      const average = Math.round(
        shares.reduce((sum, share) => sum + share, 0) / shares.length,
      )
      if (average !== node.progress) {
        await db
          .update(objectives)
          .set({ progress: average, updatedAt: new Date() })
          .where(and(eq(objectives.id, currentId), eq(objectives.userId, userId)))
        // Rollups are progress movements too: a parent's sparkline should show
        // the climb its children caused.
        await db.insert(objectiveProgressHistory).values({
          id: crypto.randomUUID(),
          userId,
          objectiveId: currentId,
          progress: average,
        })
      }
    }

    currentId = node.parentObjectiveId
  }
}
