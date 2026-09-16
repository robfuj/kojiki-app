'use client'

import { getSubGoalDetail, assignSubAgents, type TaskRow } from '@/app/actions/tasks'
import type { BotRow } from '@/app/actions/projects'
import { GateCard } from '@/components/workspace/gate-card'
import { MyceliumFeed } from '@/components/workspace/mycelium-feed'
import { TaskCard } from '@/components/workspace/task-card'
import { cn } from '@/lib/utils'
import { ArrowLeft, Loader2, Users } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'

/**
 * The execution surface for one sub-goal.
 *
 * This is where the flow the user asked for actually runs: the owning department
 * head dispatches its sub-agents, they report, Kaizen checks the result against
 * criteria fixed before the work began, Neuraxis escalates a failure, and the head
 * reabsorbs what survived back into the OKR tree. The Mycelium feed underneath
 * shows the agent-to-agent traffic that produced all of it.
 */
interface SubGoalPanelProps {
  objectiveId: string
  bots: BotRow[]
  onBack: () => void
  onTalkToSubAgent: (input: {
    botId: string
    parentSpecialistKey: string
    subAgentKey: string
    subAgentTitle: string
    objectiveId: string
  }) => void
}

export function SubGoalPanel({
  objectiveId,
  bots,
  onBack,
  onTalkToSubAgent,
}: SubGoalPanelProps) {
  const { data, isLoading, mutate } = useSWR(
    ['sub-goal', objectiveId],
    () => getSubGoalDetail(objectiveId),
    { revalidateOnFocus: false },
  )

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function dispatch() {
    if (!data) return
    setBusy(true)
    setError(null)
    try {
      await assignSubAgents({
        projectId: data.objective.projectId,
        objectiveId: data.objective.id,
      })
      await mutate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The department head could not dispatch')
    } finally {
      setBusy(false)
    }
  }

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center gap-2 p-10">
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="font-mono text-xs text-muted-foreground">Loading sub-goal…</p>
      </div>
    )
  }

  const { objective, tasks, signals, gates } = data
  const ownerBot = bots.find((bot) => bot.id === objective.ownerBotId) ?? null
  const pendingGates = gates.filter((gate) => gate.status === 'pending')
  const reabsorbed = tasks.filter((task) => task.reabsorbedAt).length

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3" aria-hidden="true" />
        Back to OKR tree
      </button>

      <header className="mt-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          Sub-goal · execution
        </p>
        <h2 className="mt-1 font-serif text-2xl text-balance text-foreground">
          {objective.title}
        </h2>

        {objective.description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {objective.description}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide',
              objective.status === 'complete'
                ? 'bg-seal-soft text-seal'
                : objective.status === 'in_progress'
                  ? 'bg-sumi-soft text-sumi'
                  : 'bg-muted text-muted-foreground',
            )}
          >
            {objective.status.replace('_', ' ')}
          </span>

          {ownerBot && (
            <span className="rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              owned by {ownerBot.displayName}
            </span>
          )}

          <span className="rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {objective.progress}%
          </span>

          {tasks.length > 0 && (
            <span className="rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {tasks.length} task{tasks.length === 1 ? '' : 's'} · {reabsorbed} reabsorbed
            </span>
          )}
        </div>
      </header>

      {/* Governance gates first: while one is open, the tasks below are held. */}
      {pendingGates.length > 0 && (
        <section className="mt-7" aria-labelledby="gates-heading">
          <h3
            id="gates-heading"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-seal"
          >
            Governance gates · {pendingGates.length} awaiting your decision
          </h3>
          <div className="mt-3 space-y-3">
            {pendingGates.map((gate) => (
              <GateCard key={gate.id} gate={gate} onDecided={() => mutate()} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-7" aria-labelledby="tasks-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3
            id="tasks-heading"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70"
          >
            Sub-agent tasks · Kaizen cycle
          </h3>

          <button
            type="button"
            onClick={dispatch}
            disabled={busy || !ownerBot}
            title={
              ownerBot
                ? undefined
                : 'This sub-goal has no owning department, so no head can dispatch work'
            }
            className="inline-flex items-center gap-1.5 rounded-sm bg-sumi px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Users className="size-3" aria-hidden="true" />
            {busy
              ? 'Head is choosing…'
              : tasks.length > 0
                ? 'Dispatch more sub-agents'
                : 'Head dispatches sub-agents'}
          </button>
        </div>

        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          {ownerBot
            ? `${ownerBot.displayName} reads this sub-goal, picks whichever of its sub-agents the work needs, and commits to success criteria before dispatching. Because the criteria exist before the result does, reabsorption is a comparison rather than a judgement call.`
            : 'Assign an owning department to this sub-goal before work can be dispatched.'}
        </p>

        {error && (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4 space-y-3">
          {tasks.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No sub-agents dispatched yet.
            </p>
          ) : (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onChanged={() => mutate()}
                onTalkToSubAgent={(selected: TaskRow) =>
                  ownerBot &&
                  onTalkToSubAgent({
                    botId: ownerBot.id,
                    parentSpecialistKey: selected.parentSpecialistKey,
                    subAgentKey: selected.subAgentKey,
                    subAgentTitle: selected.subAgentTitle,
                    objectiveId: objective.id,
                  })
                }
              />
            ))
          )}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="mycelium-heading">
        <h3
          id="mycelium-heading"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70"
        >
          Mycelium · agent to agent traffic
        </h3>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Agents never address each other directly. Every dispatch, report and
          reabsorption is a signal through this substrate, sealed into SENTINEL as
          it goes.
        </p>
        <div className="mt-4">
          <MyceliumFeed signals={signals} />
        </div>
      </section>

      {gates.some((gate) => gate.status !== 'pending') && (
        <section className="mt-8" aria-labelledby="decided-gates-heading">
          <h3
            id="decided-gates-heading"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70"
          >
            Decided gates
          </h3>
          <div className="mt-3 space-y-3">
            {gates
              .filter((gate) => gate.status !== 'pending')
              .map((gate) => (
                <GateCard key={gate.id} gate={gate} onDecided={() => mutate()} />
              ))}
          </div>
        </section>
      )}
    </div>
  )
}
