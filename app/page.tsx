import { getOrientation } from '@/app/actions/orientation'
import { listProjects } from '@/app/actions/projects'
import { getAccentKey } from '@/app/actions/settings'
import { OrientationFlow } from '@/components/orientation/orientation-flow'
import { WorkspaceShell } from '@/components/workspace/workspace-shell'
import { accentByKey, accentStyle } from '@/lib/accents'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  const orientation = await getOrientation()

  // The Orientation Protocol activates immediately, before any decision work.
  if (!orientation) {
    return <OrientationFlow userName={session.user.name ?? null} />
  }

  const [projects, accentKey] = await Promise.all([listProjects(), getAccentKey()])

  // The accent is applied as CSS custom properties on a wrapper rather than as a
  // per-user stylesheet, so the choice is server-rendered and costs no extra
  // request. Both the workspace and the orientation flow inherit it.
  return (
    <div style={accentStyle(accentByKey(accentKey))}>
      <WorkspaceShell
        orientation={orientation}
        projects={projects}
        userName={session.user.name ?? null}
        accentKey={accentKey}
      />
    </div>
  )
}
