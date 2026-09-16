'use server'

import { ACCENTS, DEFAULT_ACCENT_KEY } from '@/lib/accents'
import { db } from '@/lib/db'
import { userPreferences } from '@/lib/db/schema'
import {
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  toLocale,
} from '@/lib/i18n/locales'
import { requireUserId } from '@/lib/session'
import { eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

const getUserId = requireUserId

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

/**
 * The language to render in.
 *
 * The cookie takes precedence because it is the only source that exists on the
 * sign-in pages, and because an explicit choice on this device should beat a
 * preference saved from another one. A signed-in visitor with no cookie falls
 * back to their stored preference, so the choice follows the account.
 *
 * Never throws: an unreadable preference must not stop the shell rendering.
 */
export async function getLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value
  if (isLocale(fromCookie)) return fromCookie

  try {
    const userId = await getUserId()

    const [row] = await db
      .select({ locale: userPreferences.locale })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1)

    return toLocale(row?.locale)
  } catch {
    return DEFAULT_LOCALE
  }
}

/**
 * Changes the language.
 *
 * Writes the cookie unconditionally so the choice applies even before sign-in,
 * and additionally persists it for a signed-in user so it follows the account to
 * other devices. The path is revalidated because the language is rendered on the
 * server, including the `lang` attribute of the document.
 */
export async function setLocale(locale: string): Promise<Locale> {
  const next = toLocale(locale)

  ;(await cookies()).set(LOCALE_COOKIE, next, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
  })

  try {
    const userId = await getUserId()

    await db
      .insert(userPreferences)
      .values({ userId, locale: next, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { locale: next, updatedAt: new Date() },
      })
  } catch {
    // Not signed in. The cookie alone carries the choice, which is enough.
  }

  revalidatePath('/')
  return next
}
