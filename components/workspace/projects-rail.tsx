'use client'

import { createProject, deleteProject } from '@/app/actions/projects'
import type { ProjectRow } from '@/app/actions/projects'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Plus, Trash2, X } from 'lucide-react'
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
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [objective, setObjective] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!name.trim()) {
      setError('A project name is required.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      const project = await createProject({ name, objective })
      setName('')
      setObjective('')
      setCreating(false)
      onCreated(project)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create project')
    } finally {
      setBusy(false)
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
    <section
      aria-label="Projects"
      className="shrink-0 border-b border-border bg-sidebar/60"
    >
      <div className="flex items-stretch gap-2 overflow-x-auto px-5 py-3">
        <div className="flex shrink-0 flex-col justify-center pr-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
            Projects
          </p>
          <p className="font-mono text-[10px] text-muted-foreground/50">
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
                  'flex h-full w-56 flex-col justify-center rounded-md border px-3 py-2 text-left transition-colors',
                  active
                    ? 'border-sumi bg-card shadow-[inset_2px_0_0_0_var(--seal)]'
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
                <span className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">
                  {project.objective ?? 'no objective set'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => remove(project.id)}
                disabled={busy}
                aria-label={`Delete ${project.name}`}
                className="absolute -top-1.5 -right-1.5 hidden rounded-full border border-border bg-card p-1 text-muted-foreground transition-colors hover:border-destructive hover:text-destructive group-hover:block"
              >
                <Trash2 className="size-3" aria-hidden="true" />
              </button>
            </div>
          )
        })}

        {creating ? (
          <div className="flex w-80 shrink-0 flex-col gap-2 rounded-md border border-sumi bg-card p-3">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-seal">
                New project
              </p>
              <button
                type="button"
                onClick={() => {
                  setCreating(false)
                  setError(null)
                }}
                aria-label="Cancel"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>

            <label className="block">
              <span className="sr-only">Project name</span>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Project name"
                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
              />
            </label>

            <label className="block">
              <span className="sr-only">Overall goal</span>
              <input
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    submit()
                  }
                }}
                placeholder="Overall goal (roots the OKR tree)"
                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
              />
            </label>

            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}

            <Button size="sm" onClick={submit} disabled={busy}>
              {busy ? 'Instantiating…' : 'Create project'}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex shrink-0 items-center gap-2 rounded-md border border-dashed border-border px-4 text-sm text-muted-foreground transition-colors hover:border-sumi hover:text-foreground"
          >
            <Plus className="size-4" aria-hidden="true" />
            New project
          </button>
        )}
      </div>
    </section>
  )
}
