'use client'

import { deleteProject } from '@/app/actions/projects'
import type { ProjectRow } from '@/app/actions/projects'
import { listProjectGates } from '@/app/actions/workspace'
import { LanguageSelector } from '@/components/i18n/language-selector'
import { useLocale } from '@/components/i18n/locale-provider'
import { ProjectIntake } from '@/components/intake/project-intake'
import { SignOutButton } from '@/components/sign-out-button'
import { AvatarCircle, useRelativeTime } from '@/components/workspace/ui/primitives'
import { format } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  Bell,
  ChevronDown,
  ChevronRight,
  Microscope,
  PanelLeft,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'

interface TopBarProps {
  projects: ProjectRow[]
  activeId: string | null
  activeName: string | null
  onSelect: (id: string) => void
  onCreated: (project: ProjectRow) => void
  query: string
  onQueryChange: (query: string) => void
  userName: string | null
  onOpenSettings: () => void
  onOpenResearch: () => void
  onOpenDecisions: () => void
  onOpenAsk: () => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

/**
 * Two-tier chrome: the Kojiki bar carries brand and the places a human gets
 * pulled in (Ask, gates, account); the white bar beneath carries the project
 * switcher, the breadcrumb and search.
 */
export function TopBar({
  projects,
  activeId,
  activeName,
  onSelect,
  onCreated,
  query,
  onQueryChange,
  userName,
  onOpenSettings,
  onOpenResearch,
  onOpenDecisions,
  onOpenAsk,
  sidebarCollapsed,
  onToggleSidebar,
}: TopBarProps) {
  const { t } = useLocale()
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function remove(projectId: string) {
    setDeleting(true)
    try {
      await deleteProject(projectId)
      window.location.reload()
    } catch {
      setDeleting(false)
    }
  }

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-xl">
        <div className="flex shrink-0 items-center gap-2.5">
          <span
            className="flex size-7 items-center justify-center rounded-lg bg-primary font-serif text-sm text-primary-foreground"
            aria-hidden="true"
          >
            古
          </span>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Kojiki
          </span>
        </div>

        <div className="flex-1" aria-hidden="true" />

        <button
          type="button"
          onClick={onOpenAsk}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          {t.tabs.orchestrator.ask}
        </button>

        <GateBell activeId={activeId} onOpenDecisions={onOpenDecisions} />
        <AccountMenu
          userName={userName}
          onOpenSettings={onOpenSettings}
          onOpenResearch={onOpenResearch}
        />
      </header>

      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-expanded={!sidebarCollapsed}
          aria-label={t.nav.label}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelLeft className="size-4" aria-hidden="true" />
        </button>

        <div className="hidden shrink-0 items-center gap-1.5 text-xs md:flex">
          <span className="text-muted-foreground">{t.nav.label}</span>
          <ChevronRight className="size-3 text-muted-foreground/60" aria-hidden="true" />
          <span className="max-w-40 truncate font-medium text-foreground">
            {activeName ?? '—'}
          </span>
        </div>

        <div className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />

        <nav
          aria-label={t.projects.label}
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto"
        >
          {projects.map((project) => {
            const active = project.id === activeId
            return (
              <div key={project.id} className="group relative shrink-0">
                <button
                  type="button"
                  onClick={() => onSelect(project.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'border-border bg-muted text-foreground'
                      : 'border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      active ? 'bg-seal' : 'bg-border',
                    )}
                    aria-hidden="true"
                  />
                  {project.name}
                  {active && (
                    <ChevronDown className="size-3 opacity-60" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => remove(project.id)}
                  disabled={deleting}
                  aria-label={format(t.projects.deleteAria, { name: project.name })}
                  className="absolute -top-1 -right-1 hidden rounded-full border border-border bg-card p-1 text-muted-foreground transition-colors group-hover:block hover:border-destructive hover:text-destructive"
                >
                  <Trash2 className="size-3" aria-hidden="true" />
                </button>
              </div>
            )
          })}

          <button
            type="button"
            onClick={() => setIntakeOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {t.projects.newProject}
          </button>
        </nav>

        <div className="relative hidden shrink-0 lg:block">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <label htmlFor="workspace-search" className="sr-only">
            {t.tabs.searchPlaceholder}
          </label>
          <input
            id="workspace-search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t.tabs.searchPlaceholder}
            className="h-8 w-44 rounded-full border border-border bg-background pr-3 pl-8 text-xs text-foreground transition-colors outline-none placeholder:text-muted-foreground/70 focus:border-seal/50"
          />
        </div>
      </div>

      {intakeOpen && (
        <ProjectIntake
          onClose={() => setIntakeOpen(false)}
          onCreated={onCreated}
        />
      )}
    </>
  )
}

function GateBell({
  activeId,
  onOpenDecisions,
}: {
  activeId: string | null
  onOpenDecisions: () => void
}) {
  const { t } = useLocale()
  const relative = useRelativeTime()
  const [open, setOpen] = useState(false)

  const { data: gates } = useSWR(
    activeId ? ['gates', activeId] : null,
    () => listProjectGates(activeId!),
    { revalidateOnFocus: false },
  )
  const pending = (gates ?? []).filter((gate) => gate.status === 'pending')

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t.tabs.decisions.awaiting}
        className="relative flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-4" aria-hidden="true" />
        {pending.length > 0 && (
          <span className="absolute top-1 right-1 flex size-3.5 items-center justify-center rounded-full bg-status-review text-[9px] font-semibold text-status-review-soft">
            {pending.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-lifted">
            <p className="border-b border-border px-3 py-2 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {t.tabs.decisions.awaiting}
            </p>
            {pending.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                {t.tabs.decisions.awaitingEmpty}
              </p>
            ) : (
              <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                {pending.slice(0, 6).map((gate) => (
                  <li key={gate.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        onOpenDecisions()
                      }}
                      className="w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                    >
                      <p className="truncate text-sm font-medium text-foreground">
                        {gate.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {gate.requestedByTitle} · {relative(gate.createdAt)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function AccountMenu({
  userName,
  onOpenSettings,
  onOpenResearch,
}: {
  userName: string | null
  onOpenSettings: () => void
  onOpenResearch: () => void
}) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t.workspace.settings}
        className="flex size-8 items-center justify-center rounded-full transition-opacity hover:opacity-80"
      >
        <AvatarCircle name={userName || 'K'} className="size-8 bg-primary text-primary-foreground" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-lifted">
            <div className="border-b border-border px-3 py-2.5">
              <p className="truncate text-sm font-medium text-foreground">
                {userName ?? t.workspace.orientationComplete}
              </p>
              <div className="mt-1.5">
                <LanguageSelector />
              </div>
            </div>
            <div className="p-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onOpenResearch()
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted"
              >
                <Microscope className="size-4 text-muted-foreground" aria-hidden="true" />
                {t.research.openButton}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onOpenSettings()
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted"
              >
                <Settings className="size-4 text-muted-foreground" aria-hidden="true" />
                {t.workspace.settings}
              </button>
              {userName && (
                <div className="mt-1 border-t border-border pt-1">
                  <div className="px-2.5 py-2">
                    <SignOutButton />
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
