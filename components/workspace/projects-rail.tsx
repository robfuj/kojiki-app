'use client'

import { deleteProject, renameProject } from '@/app/actions/projects'
import type { ProjectRow } from '@/app/actions/projects'
import { useLocale } from '@/components/i18n/locale-provider'
import { ProjectIntake } from '@/components/intake/project-intake'
import { format } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

interface ProjectsRailProps {
  projects: ProjectRow[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreated: (project: ProjectRow) => void
}

export function ProjectsRail({
  projects,
  selectedId,
  onSelect,
  onCreated,
}: ProjectsRailProps) {
  const { t } = useLocale()
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})

  async function commitRename(project: ProjectRow, value: string) {
    setEditingId(null)
    const next = value.trim()
    const current = names[project.id] ?? project.name
    if (!next || next === current) return
    setNames((prev) => ({ ...prev, [project.id]: next }))
    try {
      await renameProject(project.id, next)
    } catch {
      setNames((prev) => ({ ...prev, [project.id]: current }))
    }
  }

  async function remove(projectId: string) {
    setBusy(true)
    try {
      await deleteProject(projectId)
      window.location.reload()
    } catch {
      setBusy(false)
    }
  }

  return (
    <>
      <section
        aria-label={t.projects.label}
        className="shrink-0 border-b border-border bg-sidebar/60"
      >
        <div className="flex items-stretch gap-2 overflow-x-auto px-5 py-3">
          <div className="flex shrink-0 flex-col justify-center pr-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {t.projects.label}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {projects.length}
            </p>
          </div>

          <div className="w-px shrink-0 bg-border" aria-hidden="true" />

          {projects.map((project) => {
            const active = project.id === selectedId

            return (
              <div key={project.id} className="group relative shrink-0">
                <button
                  type="button"
                  onClick={() => onSelect(project.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex h-full w-56 flex-col justify-center rounded-xl border px-3.5 py-2.5 text-left transition-colors',
                    active
                      ? 'border-sumi bg-card shadow-soft'
                      : 'border-border bg-card/50 hover:border-sumi/40 hover:bg-card',
                  )}
                >
                  {editingId === project.id ? (
                    <input
                      autoFocus
                      defaultValue={project.name}
                      aria-label={format(t.projects.renameAria, {
                        name: project.name,
                      })}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => commitRename(project, e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (e.nativeEvent.isComposing || e.keyCode === 229) return
                          e.currentTarget.blur()
                        } else if (e.key === 'Escape') {
                          setEditingId(null)
                        }
                      }}
                      className="w-full rounded-md border border-border bg-background px-1.5 py-0.5 text-sm font-medium text-foreground outline-none focus:border-sumi"
                    />
                  ) : (
                    <span
                      className={cn(
                        'truncate pr-6 text-sm font-medium',
                        active ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {names[project.id] ?? project.name}
                    </span>
                  )}
                </button>

                {editingId !== project.id && (
                  <button
                    type="button"
                    onClick={() => setEditingId(project.id)}
                    aria-label={format(t.projects.renameAria, {
                      name: names[project.id] ?? project.name,
                    })}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => remove(project.id)}
                  disabled={busy}
                  aria-label={format(t.projects.deleteAria, {
                    name: project.name,
                  })}
                  className="absolute -top-1.5 -right-1.5 hidden rounded-full border border-border bg-card p-1.5 text-muted-foreground transition-colors hover:border-destructive hover:text-destructive group-hover:block"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            )
          })}

          {/* New project opens the orchestrator rather than a name field: the
              orchestrator researches the goal and asks its questions first, and
              the project is created from what it learned. */}
          <button
            type="button"
            onClick={() => setIntakeOpen(true)}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-dashed border-border px-4 text-sm text-muted-foreground transition-colors hover:border-sumi hover:text-foreground"
          >
            <Plus className="size-4" aria-hidden="true" />
            {t.projects.newProject}
          </button>
        </div>
      </section>

      {intakeOpen && (
        <ProjectIntake
          onClose={() => setIntakeOpen(false)}
          onCreated={onCreated}
        />
      )}
    </>
  )
}
