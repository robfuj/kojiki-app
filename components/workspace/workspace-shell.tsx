'use client'

import { getProjectWorkspace } from '@/app/actions/projects'
import { ChatModule, type ChatFocus } from '@/components/workspace/chat-module'
import { OkrTree } from '@/components/workspace/okr-tree'
import { ProjectsRail } from '@/components/workspace/projects-rail'
import { SubGoalPanel } from '@/components/workspace/sub-goal-panel'
import { SettingsPanel } from '@/components/workspace/settings-panel'
import { SignOutButton } from '@/components/sign-out-button'
import type { OrientationRecord } from '@/app/actions/orientation'
import type { ProjectRow } from '@/app/actions/projects'
import { Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import useSWR from 'swr'

interface WorkspaceShellProps {
  orientation: OrientationRecord
  projects: ProjectRow[]
  userName: string | null
  /** The accent the server resolved for this user, so the picker shows the truth. */
  accentKey: string
}

export function WorkspaceShell({
  orientation,
  projects,
  userName,
  accentKey,
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
  const [settingsOpen, setSettingsOpen] = useState(false)

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
      <header className="surface-translucent flex shrink-0 items-center gap-4 border-b border-border px-5 py-3">
        <div className="flex items-baseline gap-2.5">
          <span className="font-serif text-2xl leading-none tracking-tight text-foreground">
            古事記
          </span>
          <span className="hidden text-sm text-muted-foreground sm:block">Kojiki</span>
        </div>

        <div className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

        <dl className="flex min-w-0 items-center gap-4 text-sm">
          <div className="flex shrink-0 items-baseline gap-1.5">
            <dt className="text-muted-foreground">User</dt>
            <dd className="font-medium text-foreground">{orientation.userName}</dd>
          </div>
          <div className="hidden min-w-0 items-baseline gap-1.5 md:flex">
            <dt className="shrink-0 text-muted-foreground">Industry</dt>
            <dd className="truncate text-foreground">{orientation.industry}</dd>
          </div>
          <div className="hidden min-w-0 items-baseline gap-1.5 xl:flex">
            <dt className="shrink-0 text-muted-foreground">Goal</dt>
            <dd className="truncate text-foreground">{orientation.goal}</dd>
          </div>
        </dl>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-sumi hover:text-foreground"
          >
            <Settings className="size-3.5" aria-hidden="true" />
            Settings
          </button>

          <p className="hidden items-center gap-2 text-sm text-muted-foreground lg:flex">
            {userName ? `Signed in as ${userName}` : 'Orientation complete'}
            {userName && (
              <>
                <span aria-hidden="true">·</span>
                <SignOutButton />
              </>
            )}
          </p>
        </div>
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

      {settingsOpen && (
        <SettingsPanel
          accentKey={accentKey}
          projectId={activeId}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}

function EmptyWorkspace({ hasProjects }: { hasProjects: boolean }) {
  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="max-w-md text-center">
        <p className="font-serif text-6xl leading-none text-border" aria-hidden="true">
          目
        </p>
        <h2 className="mt-6 font-serif text-2xl text-balance text-foreground">
          {hasProjects ? 'No project selected' : 'No projects yet'}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-pretty text-muted-foreground">
          {hasProjects
            ? 'Choose a project from the rail above to load its OKR tree and department agents.'
            : 'Create a project from the rail above. The orchestrator researches the goal, asks what it needs to know, and chooses the department agents the work requires.'}
        </p>
      </div>
    </div>
  )
}
