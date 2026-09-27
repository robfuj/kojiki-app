import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects, sentinelKeys } from '@/lib/db/schema'
import { latestMorpheusStatus, runMorpheusCycle } from '@/lib/engine/morpheus'
import { getSessionUser } from '@/lib/session'

/**
 * MORPHEUS trigger — the nightly cron entry point, and the manual run a user can
 * fire from the governance surface.
 *
 * Two callers, two scopes. Vercel Cron arrives with a bearer token and no
 * session, so it runs the cycle for every project that has ever sealed an entry.
 * A signed-in user arrives with a session and no token, so they may run it for
 * their own projects and nobody else's. Neither path trusts a projectId from the
 * request without checking ownership.
 */

export const maxDuration = 300
export const dynamic = 'force-dynamic'

function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

interface ProjectScope {
  projectId: string
  userId: string
}

/** Projects that have a SENTINEL key — i.e. have produced a chain worth verifying. */
async function activeProjectScopes(): Promise<ProjectScope[]> {
  const keys = await db
    .select({ projectId: sentinelKeys.projectId, userId: sentinelKeys.userId })
    .from(sentinelKeys)

  return keys.map((key) => ({ projectId: key.projectId, userId: key.userId }))
}

async function ownedProjectScopes(userId: string): Promise<ProjectScope[]> {
  const rows = await db
    .select({ id: projects.id, userId: projects.userId })
    .from(projects)
    .where(eq(projects.userId, userId))

  return rows.map((row) => ({ projectId: row.id, userId: row.userId }))
}

/** Last night's verdict for one of the caller's projects. */
export async function GET(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = new URL(request.url).searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  const owned = await ownedProjectScopes(session.id)
  if (!owned.some((scope) => scope.projectId === projectId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(await latestMorpheusStatus(projectId))
}

export async function POST(request: Request) {
  const cron = isCronRequest(request)
  const session = cron ? null : await getSessionUser()

  if (!cron && !session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let scopes: ProjectScope[]

  if (cron) {
    scopes = await activeProjectScopes()
  } else {
    const body = (await request.json().catch(() => ({}))) as { projectId?: unknown }
    const owned = await ownedProjectScopes(session!.id)

    if (typeof body.projectId === 'string' && body.projectId.length > 0) {
      const scope = owned.find((candidate) => candidate.projectId === body.projectId)
      // A projectId the caller does not own is reported as missing, not forbidden:
      // confirming that someone else's project exists is not the caller's business.
      if (!scope) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      scopes = [scope]
    } else {
      scopes = owned
    }
  }

  const results: {
    projectId: string
    ok: boolean
    chainValid?: boolean
    entries?: number
    reason?: string | null
    error?: string
  }[] = []

  for (const scope of scopes) {
    try {
      const cycle = await runMorpheusCycle(scope.userId, scope.projectId)
      results.push({
        projectId: scope.projectId,
        ok: true,
        chainValid: cycle.verification.chainValid,
        entries: cycle.verification.entries,
        reason: cycle.verification.reason,
      })
    } catch (error) {
      // One project failing must not stop the rest of the fleet from resetting.
      // The failure is reported per project so a broken chain is visible rather
      // than swallowed by an aggregate success.
      results.push({
        projectId: scope.projectId,
        ok: false,
        error: error instanceof Error ? error.message : 'unknown error',
      })
    }
  }

  const failed = results.filter((result) => !result.ok).length
  const broken = results.filter((result) => result.ok && result.chainValid === false).length

  return NextResponse.json(
    {
      ranAt: new Date().toISOString(),
      trigger: cron ? 'cron' : 'manual',
      projects: results.length,
      failed,
      chainsBroken: broken,
      results,
    },
    // A broken chain is a finding, not a transport error: the run succeeded at
    // discovering it, so the response stays 200 and the verdict carries the news.
    { status: failed === results.length && results.length > 0 ? 500 : 200 },
  )
}
