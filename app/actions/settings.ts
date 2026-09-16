'use server'

import { auth } from '@/lib/auth'
import { ACCENTS, DEFAULT_ACCENT_KEY } from '@/lib/accents'
import { db } from '@/lib/db'
import { userPreferences } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

/**
 * The user's chosen accent key.
 *
 * Falls back to the default rather than throwing: an accent is a preference, and a
 * missing or unreadable preference row should never stop the workspace rendering.
 */
export async function getAccentKey(): Promise<string> {
  try {
    const userId = await getUserId()

    const [row] = await db
      .select({ accentKey: userPreferences.accentKey })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1)

    // An unknown key can survive a change to the palette; resolve it to the
    // default rather than emitting CSS variables for a colour that no longer exists.
    const known = ACCENTS.some((accent) => accent.key === row?.accentKey)
    return known ? (row?.accentKey as string) : DEFAULT_ACCENT_KEY
  } catch {
    return DEFAULT_ACCENT_KEY
  }
}

export async function setAccentKey(accentKey: string): Promise<string> {
  const userId = await getUserId()

  if (!ACCENTS.some((accent) => accent.key === accentKey)) {
    throw new Error('That accent does not exist')
  }

  await db
    .insert(userPreferences)
    .values({ userId, accentKey, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { accentKey, updatedAt: new Date() },
    })

  // The accent is applied on the server-rendered shell, so the tree has to be
  // re-read for the change to appear anywhere other than the picker itself.
  revalidatePath('/')
  return accentKey
}
