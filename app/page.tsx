import { getOrientation } from '@/app/actions/orientation'
import { listProjects } from '@/app/actions/projects'
import { getAccentKey } from '@/app/actions/settings'
import { OrientationFlow } from '@/components/orientation/orientation-flow'
import { WorkspaceShell } from '@/components/workspace/workspace-shell'
import { accentByKey, accentStyle } from '@/lib/accents'
import { getSessionUser } from '@/lib/session'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const user = await getSessionUser()
  if (!user) redirect('/sign-in')

  // Read in parallel. These are independent, and serialising them is what kept the
  // first paint slow enough for a dev HMR refresh to arrive before the client
  // router had been constructed.
  const [orientation, projects, accentKey] = await Promise.all([
    getOrientation(),
    listProjects(),
    getAccentKey(),
  ])

  // The Orientation Protocol activates immediately, before any decision work. Both
  // branches sit inside the accent wrapper, so a first-run user sees the accent
  // they will see after orientation rather than the default.
  return (
    <div style={accentStyle(accentByKey(accentKey))}>
      {orientation ? (
        <WorkspaceShell
          orientation={orientation}
          projects={projects}
          userName={user.name ?? null}
          accentKey={accentKey}
        />
      ) : (
        <OrientationFlow userName={user.name ?? null} />
      )}
    </div>
  )
}
