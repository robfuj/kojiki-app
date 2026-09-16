'use client'

import { deleteProject } from '@/app/actions/projects'
import type { ProjectRow } from '@/app/actions/projects'
import { ProjectIntake } from '@/components/intake/project-intake'
import { cn } from '@/lib/utils'
import { Plus, Trash2 } from 'lucide-react'
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
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [busy, setBusy] = useState(false)

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
        aria-label="Projects"
        className="shrink-0 border-b border-border bg-sidebar/60"
      >
        <div className="flex items-stretch gap-2 overflow-x-auto px-5 py-3">
          <div className="flex shrink-0 flex-col justify-center pr-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Projects
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
                  <span
                    className={cn(
                      'truncate text-sm font-medium',
                      active ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {project.name}
                  </span>
                  <span className="mt-1 truncate text-xs text-muted-foreground">
                    {project.objective ?? 'no objective set'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => remove(project.id)}
                  disabled={busy}
                  aria-label={`Delete ${project.name}`}
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
            New project
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
