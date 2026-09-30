'use client'

import { useLocale } from '@/components/i18n/locale-provider'
import { Button } from '@/components/ui/button'
import type { ProjectIntakeResult } from '@/lib/orchestrator'
import { cn } from '@/lib/utils'
import { ExternalLink, Loader2, X } from 'lucide-react'

export function IntakeHeader({
  onClose,
  disabled,
}: {
  onClose: () => void
  disabled: boolean
}) {
  const { t } = useLocale()

  return (
    <header className="surface-translucent sticky top-0 z-40 border-b border-border">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 sm:px-10">
        <p className="font-serif text-2xl leading-none tracking-tight text-foreground">
          古事記
        </p>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={disabled}
          className="rounded-full text-muted-foreground"
        >
          <X className="size-4" aria-hidden="true" />
          {t.common.close}
          <span className="sr-only">{t.projectIntake.closeSr}</span>
        </Button>
      </div>
    </header>
  )
}

export function BriefBody({
  result,
  roster,
}: {
  result: ProjectIntakeResult
  roster: { displayName: string; mandate: string; isPrimary: boolean }[]
}) {
  const { t } = useLocale()
  const tp = t.projectIntake

  const sections = [
    { heading: tp.briefMarket, body: result.brief.marketScan },
    { heading: tp.briefCompetition, body: result.brief.competitiveLandscape },
    {
      heading: tp.briefRegulation,
      body: result.brief.regulatoryConsiderations,
    },
  ]

  return (
    <div className="mt-10 space-y-8">
      <div className="space-y-7">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-seal">
              {section.heading}
            </h2>
            <p className="mt-2.5 text-pretty text-base leading-relaxed text-foreground/85">
              {section.body}
            </p>
          </section>
        ))}

        {result.brief.keyRisks.length > 0 && (
          <section>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-seal">
              {tp.briefRisks}
            </h2>
            <ul className="mt-3 space-y-2">
              {result.brief.keyRisks.map((risk) => (
                <li
                  key={risk}
                  className="flex gap-3 text-pretty text-base leading-relaxed text-foreground/85"
                >
                  <span
                    className="mt-2.5 size-1.5 shrink-0 rounded-full bg-seal"
                    aria-hidden="true"
                  />
                  {risk}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <section className="rounded-2xl bg-muted px-5 py-5">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-seal">
          {tp.briefSpecialists}
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
          {result.rosterRationale}
        </p>

        <ul className="mt-4 flex flex-wrap gap-2">
          {roster.map((bot) => (
            <li
              key={bot.displayName}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium',
                bot.isPrimary
                  ? 'bg-seal text-seal-foreground'
                  : 'bg-card text-foreground shadow-soft',
              )}
            >
              {bot.displayName}
            </li>
          ))}
        </ul>
      </section>

      {result.brief.sources.length > 0 && (
        <section>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {tp.briefSources}
          </h2>
          <ul className="mt-3 space-y-1.5">
            {result.brief.sources.slice(0, 8).map((source) => (
              <li key={source}>
                <a
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 text-sm text-sumi underline decoration-border underline-offset-4 transition-colors hover:text-seal"
                >
                  <span className="truncate">{source}</span>
                  <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.researchMethod === 'model-reasoning' && (
        <p className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
          <Loader2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {tp.briefModelNote}
        </p>
      )}
    </div>
  )
}
