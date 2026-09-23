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
  PanelLeft,
  Plus,
  Search,
  Settings,
  Trash2,
} from 'lucide-react'
import Image from 'next/image'
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
  onOpenDecisions: () => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

/**
 * Two-tier chrome. The Kojiki bar carries the mark, the lettering and search —
 * the place a human looks something up. The bar beneath is the project bar:
 * full-height cards, exactly the size the switcher has always been. Switching
 * only — everything that belongs to one project lives in the left rail beside
 * its name.
 */
export function TopBar({
  projects,
  activeId,
  onSelect,
  onCreated,
  query,
  onQueryChange,
  userName,
  onOpenSettings,
  onOpenDecisions,
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
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-xl">
        <div className="flex shrink-0 items-center gap-2.5">
          <Image
            src="/images/kojiki-mark.png"
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            className="size-8 dark:invert"
          />
          <Image
            src="/images/kojiki-lettering.png"
            alt={t.tabs.orchestrator.brand}
            width={160}
            height={40}
            className="h-9 w-auto dark:invert"
          />
        </div>

        <div className="flex-1" aria-hidden="true" />

        <div className="relative hidden shrink-0 sm:block">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
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
            className="h-9 w-56 rounded-full border border-border bg-background pr-3 pl-9 text-xs text-foreground transition-colors outline-none placeholder:text-muted-foreground/70 focus:border-seal/50"
          />
        </div>

        <GateBell activeId={activeId} onOpenDecisions={onOpenDecisions} />
        <AccountMenu userName={userName} onOpenSettings={onOpenSettings} />
      </header>

      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-3 py-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-expanded={!sidebarCollapsed}
          aria-label={t.nav.label}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelLeft className="size-4" aria-hidden="true" />
        </button>

        <div className="shrink-0 pl-1">
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            {t.projects.label}
          </p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {projects.length}
          </p>
        </div>

        <nav
          aria-label={t.projects.label}
          className="flex min-w-0 flex-1 items-stretch gap-2.5 overflow-x-auto py-0.5"
        >
          {projects.map((project) => {
            const active = project.id === activeId
            return (
              <div
                key={project.id}
                className={cn(
                  'group relative shrink-0 rounded-2xl border transition-colors',
                  active
                    ? 'border-foreground/50 bg-card shadow-soft'
                    : 'border-border bg-card/60 hover:border-foreground/25',
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(project.id)}
                  aria-current={active ? 'true' : undefined}
                  className="block w-full px-4 py-2.5 text-left"
                >
                  <span className="flex items-center gap-2">
                    <AvatarCircle
                      name={project.name}
                      className="size-6 shrink-0 bg-muted text-[10px] text-foreground"
                    />
                    <span className="truncate text-sm font-semibold text-foreground">
                      {project.name}
                    </span>
                    {active && (
                      <ChevronDown
                        className="size-3 shrink-0 text-muted-foreground/60"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  {!active && (
                    <span className="mt-1 block max-w-52 truncate text-xs text-muted-foreground">
                      {project.objective}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => remove(project.id)}
                  disabled={deleting}
                  aria-label={format(t.projects.deleteAria, { name: project.name })}
                  className="absolute -top-1.5 -right-1.5 hidden rounded-full border border-border bg-card p-1 text-muted-foreground transition-colors group-hover:block hover:border-destructive hover:text-destructive"
                >
                  <Trash2 className="size-3" aria-hidden="true" />
                </button>
              </div>
            )
          })}

          <button
            type="button"
            onClick={() => setIntakeOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <Plus className="size-4" aria-hidden="true" />
            {t.projects.newProject}
          </button>
        </nav>
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
}: {
  userName: string | null
  onOpenSettings: () => void
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
