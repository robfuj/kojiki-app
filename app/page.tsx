import { getOrientation } from '@/app/actions/orientation'
import { listProjects } from '@/app/actions/projects'
import { OrientationFlow } from '@/components/orientation/orientation-flow'
import { WorkspaceShell } from '@/components/workspace/workspace-shell'
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

  const projects = await listProjects()

  return (
    <WorkspaceShell
      orientation={orientation}
      projects={projects}
      userName={session.user.name ?? null}
    />
  )
}
