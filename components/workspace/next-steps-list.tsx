import type { TaskRow } from '@/app/actions/tasks'

/**
 * What is in flight on one objective, in the order the user can act on it: a
 * proposed task waits for the user's model approval, a dispatched task is
 * running, a reported task waits for Check.
 */

const IN_FLIGHT: Record<string, string> = {
  proposed: 'Awaiting your model approval',
  dispatched: 'Sub-agent is running',
  reported: 'Reported — awaiting Check',
}

export function NextStepsList({ tasks }: { tasks: TaskRow[] }) {
  const steps = tasks.filter((task) => task.status in IN_FLIGHT)

  if (steps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing in flight — every dispatched task has been checked and reabsorbed.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {steps.map((task) => (
        <li key={task.id} className="flex items-start gap-2.5 text-sm">
          <span
            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-seal"
            aria-hidden="true"
          />
          <span className="min-w-0 text-pretty">
            <span className="font-medium text-foreground">{task.title}</span>
            <span className="text-muted-foreground">
              {' '}— {IN_FLIGHT[task.status]} · {task.subAgentTitle}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
