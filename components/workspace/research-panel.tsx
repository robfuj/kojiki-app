'use client'

import { useLocale } from '@/components/i18n/locale-provider'
import type { OrientationRecord } from '@/app/actions/orientation'
import type { ProjectRow } from '@/app/actions/projects'
import type { ResearchBrief } from '@/lib/orchestrator'
import { cn } from '@/lib/utils'
import { ExternalLink, Globe2, Sparkles, X } from 'lucide-react'
import { useEffect } from 'react'

/**
 * What the orchestrator found before the work was decomposed.
 *
 * The intake shows this once, while the project is being created, and then it is
 * gone — but it is the evidence every agent plans against, so the user needs to
 * be able to reopen it: to check a figure, to see which sources were used, or to
 * catch a hallucinated market size before it drives a decision.
 *
 * Two layers are stored and both are shown. The project brief is what the
 * orchestrator researched against this goal; the company brief is the wider
 * orientation research the agents also receive.
 */

/** The shape `createProjectFromIntake` writes into `projects.intakeContext`. */
interface IntakeContext {
  goal: string
  brief: ResearchBrief
  answers: { prompt: string; answer: string }[]
  rosterRationale: string
  researchMethod: 'web-search' | 'model-reasoning'
  companyGoal: string
  industry: string
}

/** jsonb comes back as unknown, so every field is checked before it is rendered. */
function readIntakeContext(value: unknown): IntakeContext | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<IntakeContext>
  if (!raw.brief || typeof raw.brief !== 'object') return null

  const brief = raw.brief as Partial<ResearchBrief>
  return {
    goal: typeof raw.goal === 'string' ? raw.goal : '',
    brief: {
      marketScan: typeof brief.marketScan === 'string' ? brief.marketScan : '',
      competitiveLandscape:
        typeof brief.competitiveLandscape === 'string' ? brief.competitiveLandscape : '',
      regulatoryConsiderations:
        typeof brief.regulatoryConsiderations === 'string'
          ? brief.regulatoryConsiderations
          : '',
      keyRisks: Array.isArray(brief.keyRisks)
        ? brief.keyRisks.filter((risk): risk is string => typeof risk === 'string')
        : [],
      sources: Array.isArray(brief.sources)
        ? brief.sources.filter((source): source is string => typeof source === 'string')
        : [],
    },
    answers: Array.isArray(raw.answers)
      ? raw.answers.filter(
          (item): item is { prompt: string; answer: string } =>
            !!item && typeof item.prompt === 'string' && typeof item.answer === 'string',
        )
      : [],
    rosterRationale: typeof raw.rosterRationale === 'string' ? raw.rosterRationale : '',
    researchMethod: raw.researchMethod === 'web-search' ? 'web-search' : 'model-reasoning',
    companyGoal: typeof raw.companyGoal === 'string' ? raw.companyGoal : '',
    industry: typeof raw.industry === 'string' ? raw.industry : '',
  }
}

function readBrief(value: unknown): ResearchBrief | null {
  if (!value || typeof value !== 'object') return null
  const brief = value as Partial<ResearchBrief>
  const hasContent =
    typeof brief.marketScan === 'string' ||
    typeof brief.competitiveLandscape === 'string' ||
    (Array.isArray(brief.keyRisks) && brief.keyRisks.length > 0)
  if (!hasContent) return null

  return {
    marketScan: typeof brief.marketScan === 'string' ? brief.marketScan : '',
    competitiveLandscape:
      typeof brief.competitiveLandscape === 'string' ? brief.competitiveLandscape : '',
    regulatoryConsiderations:
      typeof brief.regulatoryConsiderations === 'string'
        ? brief.regulatoryConsiderations
        : '',
    keyRisks: Array.isArray(brief.keyRisks)
      ? brief.keyRisks.filter((risk): risk is string => typeof risk === 'string')
      : [],
    sources: Array.isArray(brief.sources)
      ? brief.sources.filter((source): source is string => typeof source === 'string')
      : [],
  }
}

export function ResearchPanel({
  project,
  orientation,
  onClose,
}: {
  project: ProjectRow | null
  orientation: OrientationRecord
  onClose: () => void
}) {
  const { t } = useLocale()
  const tr = t.research

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const intake = readIntakeContext(project?.intakeContext)
  const companyBrief = readBrief(orientation.researchBrief)
  const hasAnything = intake !== null || companyBrief !== null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-sumi/40 p-4 backdrop-blur-sm sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="research-title"
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-background shadow-floating"
      >
        <header className="surface-translucent sticky top-0 z-10 flex items-center gap-3 border-b border-border px-6 py-4">
          <h2 id="research-title" className="text-xl font-semibold text-foreground">
            {tr.title}
          </h2>
          <p className="hidden text-xs text-muted-foreground sm:block">{tr.summary}</p>

          <button
            type="button"
            onClick={onClose}
            aria-label={tr.closeAria}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-sumi hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden="true" />
            {t.common.close}
          </button>
        </header>

        {!hasAnything ? (
          <p className="px-6 py-10 text-center text-sm leading-relaxed text-muted-foreground">
            {tr.empty}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {intake && (
              <section className="px-6 py-6">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-base font-semibold text-foreground">
                    {project?.name}
                  </h3>
                  <MethodBadge method={intake.researchMethod} />
                </div>

                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  {intake.goal && (
                    <Field label={tr.goalLabel} value={intake.goal} />
                  )}
                  {intake.industry && (
                    <Field label={tr.industryLabel} value={intake.industry} />
                  )}
                </dl>

                <div className="mt-5">
                  <BriefBody brief={intake.brief} />
                </div>

                {intake.answers.length > 0 && (
                  <div className="mt-6">
                    <SectionLabel>{tr.answers}</SectionLabel>
                    <dl className="mt-3 space-y-3">
                      {intake.answers.map((item) => (
                        <div key={item.prompt}>
                          <dt className="text-sm font-medium text-foreground">
                            {item.prompt}
                          </dt>
                          <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {item.answer}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                {intake.rosterRationale && (
                  <div className="mt-6">
                    <SectionLabel>{tr.roster}</SectionLabel>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {intake.rosterRationale}
                    </p>
                  </div>
                )}

                {intake.researchMethod === 'model-reasoning' && (
                  <p className="mt-5 rounded-xl bg-muted px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                    {tr.modelNote}
                  </p>
                )}
              </section>
            )}

            {companyBrief && (
              <section className="px-6 py-6">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-base font-semibold text-foreground">
                    {tr.companySection}
                  </h3>
                  {orientation.researchMethod && (
                    <MethodBadge
                      method={
                        orientation.researchMethod === 'web-search'
                          ? 'web-search'
                          : 'model-reasoning'
                      }
                    />
                  )}
                </div>

                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {tr.companyNote}
                </p>

                <div className="mt-5">
                  <BriefBody brief={companyBrief} />
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MethodBadge({ method }: { method: 'web-search' | 'model-reasoning' }) {
  const { t } = useLocale()
  const web = method === 'web-search'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        web ? 'bg-seal-soft text-seal' : 'bg-muted text-muted-foreground',
      )}
    >
      {web ? (
        <Globe2 className="size-3" aria-hidden="true" />
      ) : (
        <Sparkles className="size-3" aria-hidden="true" />
      )}
      {web ? t.research.methodWeb : t.research.methodModel}
    </span>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="font-mono text-[11px] uppercase tracking-[0.16em] text-seal">
      {children}
    </h4>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-relaxed text-foreground">{value}</dd>
    </div>
  )
}

/** The three prose findings, the risks and the sources — one renderer, both layers. */
function BriefBody({ brief }: { brief: ResearchBrief }) {
  const { t } = useLocale()
  const tr = t.research

  const prose = [
    { label: tr.market, value: brief.marketScan },
    { label: tr.competition, value: brief.competitiveLandscape },
    { label: tr.regulation, value: brief.regulatoryConsiderations },
  ].filter((item) => item.value.trim().length > 0)

  return (
    <div className="space-y-5">
      {prose.map((item) => (
        <div key={item.label}>
          <SectionLabel>{item.label}</SectionLabel>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-foreground/85">
            {item.value}
          </p>
        </div>
      ))}

      {brief.keyRisks.length > 0 && (
        <div>
          <SectionLabel>{tr.risks}</SectionLabel>
          <ul className="mt-3 space-y-2">
            {brief.keyRisks.map((risk) => (
              <li
                key={risk}
                className="flex gap-3 text-pretty text-sm leading-relaxed text-foreground/85"
              >
                <span
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-seal"
                  aria-hidden="true"
                />
                {risk}
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.sources.length > 0 && (
        <div>
          <SectionLabel>{tr.sources}</SectionLabel>
          <ul className="mt-3 space-y-1.5">
            {brief.sources.slice(0, 12).map((source) => (
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
        </div>
      )}

      {prose.length === 0 && brief.keyRisks.length === 0 && (
        <p className="text-sm text-muted-foreground">{tr.noBrief}</p>
      )}
    </div>
  )
}
