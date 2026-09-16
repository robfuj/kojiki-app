'use client'

import { getProjectWorkspace } from '@/app/actions/projects'
import { ChatModule, type ChatFocus } from '@/components/workspace/chat-module'
import { OkrTree } from '@/components/workspace/okr-tree'
import { ProjectsRail } from '@/components/workspace/projects-rail'
import { SubGoalPanel } from '@/components/workspace/sub-goal-panel'
import { SignOutButton } from '@/components/sign-out-button'
import type { OrientationRecord } from '@/app/actions/orientation'
import type { ProjectRow } from '@/app/actions/projects'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import useSWR from 'swr'

interface WorkspaceShellProps {
  orientation: OrientationRecord
  projects: ProjectRow[]
  userName: string | null
}

export function WorkspaceShell({
  orientation,
  projects,
  userName,
}: WorkspaceShellProps) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(
    projects[0]?.id ?? null,
  )
  // Which sub-goal's execution panel is open, and which agent the sidebar is
  // talking to. The orchestrator is the default conversation because it is the
  // layer the user coordinates through; drilling into a sub-agent from the
  // sub-goal panel overrides it until the user goes back.
  const [openSubGoalId, setOpenSubGoalId] = useState<string | null>(null)
  const [chatFocus, setChatFocus] = useState<ChatFocus | null>({
    kind: 'orchestrator',
  })

  // A newly created project arrives through router.refresh(); follow it if the
  // current selection no longer exists.
  const activeId =
    selectedId && projects.some((project) => project.id === selectedId)
      ? selectedId
      : (projects[0]?.id ?? null)

  const { data: workspace } = useSWR(
    activeId ? ['workspace', activeId] : null,
    () => getProjectWorkspace(activeId!),
    { revalidateOnFocus: false },
  )

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center gap-4 border-b border-border bg-card px-5 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-2xl leading-none text-foreground">古事記</span>
          <span className="font-serif text-sm text-muted-foreground">Kojiki</span>
        </div>

        <div className="mx-2 h-6 w-px bg-border" aria-hidden="true" />

        <dl className="flex min-w-0 items-center gap-5 font-mono text-xs">
          <div className="flex shrink-0 items-center gap-1.5">
            <dt className="uppercase tracking-wide text-muted-foreground/70">user</dt>
            <dd className="text-foreground">{orientation.userName}</dd>
          </div>
          <div className="hidden min-w-0 items-center gap-1.5 sm:flex">
            <dt className="shrink-0 uppercase tracking-wide text-muted-foreground/70">
              industry
            </dt>
            <dd className="truncate text-foreground">{orientation.industry}</dd>
          </div>
          <div className="hidden min-w-0 items-center gap-1.5 lg:flex">
            <dt className="shrink-0 uppercase tracking-wide text-muted-foreground/70">
              goal
            </dt>
            <dd className="truncate text-foreground">{orientation.goal}</dd>
          </div>
        </dl>

  <p className="ml-auto hidden items-center gap-2 text-xs text-muted-foreground md:flex">
    {userName ? `Signed in as ${userName}` : 'Orientation complete'}
    {userName && (
      <>
        <span aria-hidden="true">·</span>
        <SignOutButton />
      </>
    )}
  </p>
      </header>

      <ProjectsRail
        projects={projects}
        selectedId={activeId}
        onSelect={(projectId) => {
          setSelectedId(projectId)
          // A sub-goal from another project is not open in this one.
          setOpenSubGoalId(null)
          setChatFocus({ kind: 'orchestrator' })
        }}
        onCreated={(project) => {
          router.refresh()
          setSelectedId(project.id)
          setOpenSubGoalId(null)
          setChatFocus({ kind: 'orchestrator' })
        }}
      />

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto">
          {activeId && workspace ? (
            openSubGoalId ? (
              <SubGoalPanel
                key={openSubGoalId}
                objectiveId={openSubGoalId}
                bots={workspace.bots}
                onBack={() => setOpenSubGoalId(null)}
                onTalkToSubAgent={(subAgent) =>
                  setChatFocus({ kind: 'sub_agent', ...subAgent })
                }
              />
            ) : (
              <OkrTree
                projectId={activeId}
                projectName={workspace.project.name}
                bots={workspace.bots}
                onOpenSubGoal={setOpenSubGoalId}
              />
            )
          ) : (
            <EmptyWorkspace hasProjects={projects.length > 0} />
          )}
        </main>

        <aside className="hidden w-[25rem] shrink-0 flex-col border-l border-border bg-sidebar lg:flex xl:w-[28rem]">
          {activeId && workspace ? (
            <ChatModule
              projectId={activeId}
              projectName={workspace.project.name}
              bots={workspace.bots}
              focus={chatFocus}
              onClearFocus={() => setChatFocus({ kind: 'orchestrator' })}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Open a project to load its department agents.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function EmptyWorkspace({ hasProjects }: { hasProjects: boolean }) {
  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="max-w-md text-center">
        <p className="font-serif text-5xl leading-none text-border">目</p>
        <h2 className="mt-5 font-serif text-xl text-foreground">
          {hasProjects ? 'No project selected' : 'No projects yet'}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {hasProjects
            ? 'Choose a project from the rail above to load its OKR tree and department agents.'
            : 'Create a project from the rail above. The orchestrator already selected which department agents your goal needs, and in what handoff order.'}
        </p>
      </div>
    </div>
  )
}
