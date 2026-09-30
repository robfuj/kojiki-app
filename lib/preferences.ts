import { db } from '@/lib/db'
import { userPreferences } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Reading and writing the preference row, separate from the server actions that
 * expose it.
 *
 * Model resolution needs the free-first flag on every call that picks a default
 * model, and lib/ must not reach into app/actions for it — the actions are the
 * client-facing surface, this is the storage fact underneath.
 */

export const DEFAULT_FREE_FIRST = true

/**
 * Whether this user prefers free models.
 *
 * Never throws and never blocks a render: a missing or unreadable preference row
 * resolves to the default, because a preference is not a reason to fail a call.
 */
export async function readFreeFirst(userId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ freeFirst: userPreferences.freeFirst })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1)

    return row?.freeFirst ?? DEFAULT_FREE_FIRST
  } catch {
    return DEFAULT_FREE_FIRST
  }
}

export async function writeFreeFirst(userId: string, freeFirst: boolean): Promise<void> {
  await db
    .insert(userPreferences)
    .values({ userId, freeFirst, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { freeFirst, updatedAt: new Date() },
    })
}
