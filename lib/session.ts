import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { cache } from 'react'

/**
 * The signed-in user for the current request, resolved at most once.
 *
 * Every server action used to run its own `getSession` query, so rendering the
 * home page issued four separate session lookups — one in the page and one each
 * in `getOrientation`, `listProjects` and `getAccentKey` — serialised into two
 * sequential waves before any content shipped. Against a cold connection pool
 * that left the document unhydrated for seconds, which is exactly the window in
 * which the dev HMR socket can deliver a refresh before the client router has
 * been constructed, surfacing as "Router action dispatched before
 * initialization". React's `cache` collapses the lookups into one per request.
 */
export const getSessionUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
})

/** The signed-in user's id, or throws when the request is unauthenticated. */
export async function requireUserId(): Promise<string> {
  const user = await getSessionUser()
  if (!user) throw new Error('Unauthorized')
  return user.id
}
