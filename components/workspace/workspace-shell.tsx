'use client'

import { getProjectWorkspace } from '@/app/actions/projects'
import type { ProjectRow } from '@/app/actions/projects'
import type { OrientationRecord } from '@/app/actions/orientation'
import { useLocale } from '@/components/i18n/locale-provider'
import {
  ChatModule,
  type ChatFocus,
  type ChatSeed,
} from '@/components/workspace/chat-module'
import { ResearchPanel } from '@/components/workspace/research-panel'
import { SettingsPanel } from '@/components/workspace/settings-panel'
import { Sidebar, type TabKey } from '@/components/workspace/sidebar'
import { TopBar } from '@/components/workspace/topbar'
import { ReviewCard } from '@/components/workspace/review-card'
import { DecisionsTab } from '@/components/workspace/tabs/decisions-tab'
import { DepartmentsTab } from '@/components/workspace/tabs/departments-tab'
import { EvidenceTab } from '@/components/workspace/tabs/evidence-tab'
import { LearningTab } from '@/components/workspace/tabs/learning-tab'
import { OverviewTab } from '@/components/workspace/tabs/overview-tab'
import { WorkTab } from '@/components/workspace/tabs/work-tab'
import { Waypoints } from 'lucide-react'
import { useEffect, useState } from 'react'
import useSWR from 'swr'

const TAB_KEYS: TabKey[] = [
  'overview',
  'work',
  'decisions',
  'departments',
  'evidence',
  'learning',
  'orchestrator',
]

function initialTab(): TabKey {
  if (typeof window === 'undefined') return 'overview'
  const param = new URLSearchParams(window.location.search).get('tab')
  return TAB_KEYS.includes(param as TabKey) ? (param as TabKey) : 'overview'
}

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
  const { t } = useLocale()
  const [selectedId, setSelectedId] = useState<string | null>(
    projects[0]?.id ?? null,
  )
  const [tab, setTab] = useState<TabKey>(initialTab)
  const [returnTab, setReturnTab] = useState<TabKey>('overview')
  const [query, setQuery] = useState('')
  const [chatFocus, setChatFocus] = useState<ChatFocus | null>({
    kind: 'orchestrator',
  })
  const [seed, setSeed] = useState<ChatSeed | null>(null)
  const [workObjectiveId, setWorkObjectiveId] = useState<string | null>(null)
  const [deptBotId, setDeptBotId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [researchOpen, setResearchOpen] = useState(false)

  // A newly created project arrives through router.refresh(); follow it if the
  // current selection no longer exists.
  const activeId =
    selectedId && projects.some((project) => project.id === selectedId)
      ? selectedId
      : (projects[0]?.id ?? null)
  const activeProject =
    projects.find((project) => project.id === activeId) ?? null

  const { data: workspace } = useSWR(
    activeId ? ['workspace', activeId] : null,
    () => getProjectWorkspace(activeId!),
    { revalidateOnFocus: false },
  )

  // The open view lives in the URL so a refresh lands where the user left off.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('tab', tab)
    window.history.replaceState(null, '', `?${params.toString()}`)
  }, [tab])

  function goTo(next: TabKey) {
    if (next === 'orchestrator') {
      setReturnTab(tab === 'orchestrator' ? returnTab : tab)
      setChatFocus({ kind: 'orchestrator' })
    }
    setTab(next)
  }

  function openConversation(focus: ChatFocus) {
    setReturnTab(tab === 'orchestrator' ? returnTab : tab)
    setChatFocus(focus)
    setTab('orchestrator')
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar
        projects={projects}
        activeId={activeId}
        onSelect={(projectId) => {
          setSelectedId(projectId)
          setWorkObjectiveId(null)
          setDeptBotId(null)
          setChatFocus({ kind: 'orchestrator' })
        }}
        onCreated={(project) => {
          setSelectedId(project.id)
          setWorkObjectiveId(null)
          setDeptBotId(null)
          setChatFocus({ kind: 'orchestrator' })
        }}
        query={query}
        onQueryChange={setQuery}
        userName={userName}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenResearch={() => setResearchOpen(true)}
        onOpenDecisions={() => goTo('decisions')}
      />

      {tab === 'orchestrator' && activeId && workspace ? (
        <div className="flex min-h-0 flex-1 justify-center">
          <div className="flex min-h-0 w-full max-w-3xl flex-col px-4 py-5">
            <div className="flex shrink-0 items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                <Waypoints className="size-4 text-foreground" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {t.tabs.orchestrator.brand} / {t.nav.orchestrator}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.tabs.orchestrator.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTab(returnTab)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {t.tabs.orchestrator.collapse}
              </button>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
              <ReviewCard
                projectId={activeId}
                bots={workspace.bots}
                onAskDepartment={(botId) => setChatFocus({ kind: 'bot', botId })}
                onOpenObjective={(objectiveId) => {
                  setWorkObjectiveId(objectiveId)
                  setTab('work')
                }}
              />
            </div>

            <div className="mt-3 flex shrink-0 flex-wrap gap-1.5">
              {t.tabs.orchestrator.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() =>
                    setSeed({ text: suggestion, nonce: Date.now() })
                  }
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-seal/40 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <div className="mt-3 flex min-h-[22rem] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
              <ChatModule
                projectId={activeId}
                projectName={workspace.project.name}
                bots={workspace.bots}
                focus={chatFocus}
                onFocusChange={setChatFocus}
                seed={seed}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <Sidebar
            projectName={activeProject?.name ?? null}
            projectMeta={activeProject?.objective ?? null}
            tab={tab}
            onTab={goTo}
          />

          <main className="min-w-0 flex-1 overflow-y-auto">
            {activeId && workspace ? (
              <>
                {tab === 'overview' && (
                  <OverviewTab
                    projectId={activeId}
                    projectName={workspace.project.name}
                    projectObjective={workspace.project.objective}
                    onOpenWork={() => goTo('work')}
                    onOpenDecisions={() => goTo('decisions')}
                    onChatWithBot={(botId) =>
                      openConversation({ kind: 'bot', botId })
                    }
                  />
                )}
                {tab === 'work' && (
                  <WorkTab
                    projectId={activeId}
                    selectedId={workObjectiveId}
                    onSelect={setWorkObjectiveId}
                    onTalkToSubAgent={openConversation}
                  />
                )}
                {tab === 'decisions' && (
                  <DecisionsTab projectId={activeId} query={query} />
                )}
                {tab === 'departments' && (
                  <DepartmentsTab
                    projectId={activeId}
                    query={query}
                    selectedBotId={deptBotId}
                    onSelectBot={setDeptBotId}
                    onChatWithBot={(botId) =>
                      openConversation({ kind: 'bot', botId })
                    }
                  />
                )}
                {tab === 'evidence' && (
                  <EvidenceTab projectId={activeId} query={query} />
                )}
                {tab === 'learning' && <LearningTab projectId={activeId} />}
              </>
            ) : (
              <EmptyWorkspace hasProjects={projects.length > 0} />
            )}
          </main>
        </div>
      )}

      {researchOpen && (
        <ResearchPanel
          project={activeProject}
          orientation={orientation}
          onClose={() => setResearchOpen(false)}
        />
      )}

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
  const { t } = useLocale()

  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="max-w-md text-center">
        <p className="font-serif text-6xl leading-none text-border" aria-hidden="true">
          目
        </p>
        <h2 className="mt-6 text-2xl font-semibold text-balance text-foreground">
          {hasProjects
            ? t.workspace.noneSelectedTitle
            : t.workspace.noneYetTitle}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-pretty text-muted-foreground">
          {hasProjects
            ? t.workspace.noneSelectedBody
            : t.workspace.noneYetBody}
        </p>
      </div>
    </div>
  )
}
