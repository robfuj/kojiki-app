'use client'

import { listProjectLearnings, type LearningRow } from '@/app/actions/workspace'
import { useLocale } from '@/components/i18n/locale-provider'
import { Card } from '@/components/workspace/ui/primitives'
import { format } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ArrowRight, Lightbulb } from 'lucide-react'
import { useMemo, useState } from 'react'
import useSWR from 'swr'

type Section = 'insights' | 'patterns' | 'retrospectives'

interface LearningTabProps {
  projectId: string
}

/**
 * What the organisation learned: reusable insights Kaizen sealed, the error
 * patterns behind them, and the full retrospective record.
 */
export function LearningTab({ projectId }: LearningTabProps) {
  const { t } = useLocale()
  const labels = t.tabs.learning
  const [section, setSection] = useState<Section>('insights')

  const { data: learnings } = useSWR(['learnings', projectId], () =>
    listProjectLearnings(projectId),
  )

  const all = learnings ?? []
  const reusable = all.filter((learning) => learning.reusable)

  const patterns = useMemo(() => {
    const groups = new Map<
      string,
      { errorClass: string; count: number; agents: Set<string> }
    >()
    for (const learning of all) {
      const group = groups.get(learning.errorClass) ?? {
        errorClass: learning.errorClass,
        count: 0,
        agents: new Set<string>(),
      }
      group.count += 1
      group.agents.add(learning.agentTitle)
      groups.set(learning.errorClass, group)
    }
    return Array.from(groups.values()).sort((a, b) => b.count - a.count)
  }, [all])

  const dateOf = (date: Date) =>
    new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date)

  const sections: { key: Section; label: string }[] = [
    { key: 'insights', label: labels.insights },
    { key: 'patterns', label: labels.patterns },
    { key: 'retrospectives', label: labels.retrospectives },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-6 py-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t.nav.learning}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
      </div>

      <div className="flex gap-1">
        {sections.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setSection(item.key)}
            aria-pressed={section === item.key}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
              section === item.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card className="self-start">
          {section === 'insights' && (
            <ul className="divide-y divide-border">
              {reusable.length === 0 ? (
                <li className="px-4 py-8 text-sm text-muted-foreground">
                  {labels.empty}
                </li>
              ) : (
                reusable.map((learning) => (
                  <InsightRow
                    key={learning.id}
                    learning={learning}
                    sub={format(labels.basedOn, {
                      agent: learning.agentTitle,
                      errorClass: learning.errorClass,
                    })}
                    date={dateOf(learning.recordedAt)}
                  />
                ))
              )}
            </ul>
          )}

          {section === 'patterns' && (
            <ul className="divide-y divide-border">
              {patterns.length === 0 ? (
                <li className="px-4 py-8 text-sm text-muted-foreground">
                  {labels.empty}
                </li>
              ) : (
                patterns.map((pattern) => (
                  <li
                    key={pattern.errorClass}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {pattern.errorClass}
                    </p>
                    <p className="shrink-0 truncate text-xs text-muted-foreground">
                      {Array.from(pattern.agents).join(', ')}
                    </p>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground">
                      {pattern.count}
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}

          {section === 'retrospectives' && (
            <ul className="divide-y divide-border">
              {all.length === 0 ? (
                <li className="px-4 py-8 text-sm text-muted-foreground">
                  {labels.empty}
                </li>
              ) : (
                all.map((learning) => (
                  <li key={learning.id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {learning.hypothesis}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {dateOf(learning.recordedAt)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {learning.observed}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {learning.agentTitle} · {learning.errorClass}
                    </p>
                  </li>
                ))
              )}
            </ul>
          )}
        </Card>

        <Card className="self-start p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ArrowRight className="size-4 text-seal" aria-hidden="true" />
            {labels.takeaways}
          </h2>
          <ul className="mt-3 space-y-3">
            {reusable.slice(0, 4).map((learning) => (
              <li key={learning.id} className="flex items-start gap-2.5">
                <ArrowRight
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-sm leading-relaxed text-pretty text-foreground">
                  {learning.insight ?? learning.observed}
                </p>
              </li>
            ))}
            {reusable.length === 0 && (
              <li className="text-sm text-muted-foreground">{labels.empty}</li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  )
}

function InsightRow({
  learning,
  sub,
  date,
}: {
  learning: LearningRow
  sub: string
  date: string
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background">
        <Lightbulb className="size-4 text-foreground" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-balance text-foreground">
          {learning.insight ?? learning.observed}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      </div>
      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        {learning.agentTitle}
      </span>
      <span className="w-20 shrink-0 text-right text-[11px] text-muted-foreground">
        {date}
      </span>
    </li>
  )
}
