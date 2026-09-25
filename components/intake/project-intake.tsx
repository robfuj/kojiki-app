'use client'

import {
  clarifyProjectGoal,
  createProjectFromIntake,
  reResearchProjectGoal,
  researchProjectGoal,
  type IntakeAnswer,
} from '@/app/actions/intake'
import type { ProjectRow } from '@/app/actions/projects'
import {
  IntakeProgress,
  IntakeScreen,
  type IntakeDirection,
} from '@/components/intake/intake-screen'
import { useLocale } from '@/components/i18n/locale-provider'
import { Button } from '@/components/ui/button'
import { format } from '@/lib/i18n'
import { deriveRoster } from '@/lib/ontology/orientation'
import type {
  ClarifyQuestion,
  ProjectIntakeResult,
  ReResearchResult,
} from '@/lib/orchestrator'
import { cn } from '@/lib/utils'
import { ExternalLink, Loader2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

/**
 * New project, orchestrator first — the orientation protocol end to end.
 *
 * Clarify: the orchestrator asks only what the goal leaves open. Research: it
 * reads the field. Questions: what the research left open. Re-research and
 * refine: the answers fold back into the research and the goal is restated
 * around them. Sign: the refined goal becomes the root objective the moment the
 * project is created, with its roster and sub-goals already in place.
 */

type Phase =
  | 'goal'
  | 'clarifying'
  | 'clarify'
  | 'researching'
  | 'brief'
  | 'questions'
  | 'reresearching'
  | 'naming'
  | 'creating'

export function ProjectIntake({
  onClose,
  onCreated,
}: {
  onClose: () => void
  /** Hands the new project to the rail so it is selected the moment it exists. */
  onCreated: (project: ProjectRow) => void
}) {
  const { t } = useLocale()
  const tp = t.projectIntake
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('goal')
  const [direction, setDirection] = useState<IntakeDirection>('forward')
  const [goal, setGoal] = useState('')
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarifyQuestion[]>([])
  const [clarifyStep, setClarifyStep] = useState(0)
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<ProjectIntakeResult | null>(null)
  const [questionStep, setQuestionStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [refined, setRefined] = useState<ReResearchResult | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Escape closes the intake, which is what a full-screen surface should do.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const questions = result?.questions ?? []
  const roster = useMemo(
    () => (result ? deriveRoster(result.rosterKeys) : []),
    [result],
  )

  // Progress counts the screens the user actually walks: goal, each clarifying
  // question, brief, each research question, then naming. Busy phases inherit
  // the screen they belong to.
  const totalScreens = 1 + clarifyQuestions.length + 1 + questions.length + 1
  const currentScreen =
    phase === 'goal' || phase === 'clarifying'
      ? 0
      : phase === 'clarify'
        ? 1 + clarifyStep
        : phase === 'researching'
          ? 1 + clarifyQuestions.length
          : phase === 'brief'
            ? 1 + clarifyQuestions.length
            : phase === 'questions'
              ? 2 + clarifyQuestions.length + questionStep
              : phase === 'reresearching'
                ? 2 + clarifyQuestions.length + questions.length
                : totalScreens - 1

  function goTo(next: Phase, dir: IntakeDirection = 'forward') {
    setDirection(dir)
    setPhase(next)
    setError(null)
  }

  function clarifyPayload(): IntakeAnswer[] {
    return clarifyQuestions.map((question) => ({
      prompt: question.prompt,
      answer: clarifyAnswers[question.id] ?? '',
    }))
  }

  function answersPayload(): IntakeAnswer[] {
    return questions.map((question) => ({
      prompt: question.prompt,
      answer: answers[question.id] ?? '',
    }))
  }

  async function submitGoal() {
    if (goal.trim().length < 8) {
      setError(tp.goalTooShort)
      return
    }
    if (goal.trim().length > 2000) {
      setError(tp.goalTooLong)
      return
    }

    setPhase('clarifying')
    setError(null)

    // Clarification is best-effort: if the orchestrator cannot read the goal
    // for questions, the protocol continues straight to research rather than
    // stranding the user on a broken step.
    try {
      const clarify = await clarifyProjectGoal({ goal: goal.trim() })
      if (clarify.length > 0) {
        setClarifyQuestions(clarify)
        setClarifyStep(0)
        goTo('clarify')
        return
      }
    } catch {
      // fall through to research
    }
    await runResearch()
  }

  async function runResearch() {
    setPhase('researching')
    setError(null)

    try {
      const intake = await researchProjectGoal({
        goal: goal.trim(),
        clarifyAnswers: clarifyPayload(),
      })
      setResult(intake)
      setQuestionStep(0)
      // A goal with no open questions goes straight to naming.
      goTo(intake.questions.length > 0 ? 'brief' : 'naming')
    } catch {
      // The server repeats its own length checks; whatever it rejects, the
      // reader gets the localised message rather than a server string.
      setError(tp.researchError)
      setPhase('goal')
    }
  }

  function advanceClarify() {
    setError(null)
    if (clarifyStep + 1 < clarifyQuestions.length) {
      setClarifyStep((s) => s + 1)
      setDirection('forward')
    } else {
      void runResearch()
    }
  }

  function advanceQuestion() {
    const question = questions[questionStep]
    if (question?.required && !answers[question.id]?.trim().length) {
      setError(tp.questionRequired)
      return
    }
    setError(null)
    if (questionStep + 1 < questions.length) {
      setQuestionStep((s) => s + 1)
      setDirection('forward')
    } else {
      void reResearch()
    }
  }

  async function reResearch() {
    if (!result) return
    setPhase('reresearching')
    setError(null)

    try {
      const next = await reResearchProjectGoal({
        goal: goal.trim(),
        clarifyAnswers: clarifyPayload(),
        answers: answersPayload(),
        brief: result.brief,
      })
      setResult((current) =>
        current
          ? {
              ...current,
              brief: next.brief,
              researchMethod: next.researchMethod,
            }
          : current,
      )
      setRefined(next)
      goTo('naming')
    } catch {
      setError(tp.researchError)
      setPhase('questions')
    }
  }

  async function create() {
    if (!result) return
    if (!name.trim()) {
      setError(tp.nameRequired)
      return
    }

    setPhase('creating')
    setError(null)

    try {
      const project = await createProjectFromIntake({
        name: name.trim(),
        goal: goal.trim(),
        rosterKeys: result.rosterKeys,
        rosterRationale: result.rosterRationale,
        brief: result.brief,
        researchMethod: result.researchMethod,
        answers: answersPayload(),
        refinedGoal: refined?.refinedGoal,
        refinementNote: refined?.refinementNote,
      })

      router.refresh()
      onCreated(project)
      onClose()
    } catch {
      setError(tp.createError)
      setPhase('naming')
    }
  }

  const busy =
    phase === 'clarifying' ||
    phase === 'researching' ||
    phase === 'reresearching' ||
    phase === 'creating'

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <IntakeProgress
        value={(currentScreen + 1) / totalScreens}
        label={tp.progressLabel}
      />

      <IntakeHeader onClose={onClose} disabled={busy} />

      {phase === 'goal' || phase === 'clarifying' ? (
        <IntakeScreen
          screenKey="goal"
          direction="forward"
          eyebrow={tp.goalEyebrow}
          prompt={tp.goalPrompt}
          why={tp.goalWhy}
          field={{
            name: 'goal',
            label: tp.goalLabel,
            kind: 'textarea',
            placeholder: tp.goalPlaceholder,
            required: true,
          }}
          value={goal}
          onChange={(value) => {
            setGoal(value)
            setError(null)
          }}
          onNext={() => void submitGoal()}
          nextLabel={tp.goalSubmit}
          error={error}
          busy={phase === 'clarifying'}
          busyNote={tp.clarifyingNote}
        />
      ) : null}

      {phase === 'clarify' ? (
        <IntakeScreen
          screenKey={clarifyQuestions[clarifyStep]?.id ?? 'clarify'}
          direction={direction}
          eyebrow={format(tp.clarifyEyebrow, {
            current: clarifyStep + 1,
            total: clarifyQuestions.length,
          })}
          prompt={clarifyQuestions[clarifyStep]?.prompt ?? ''}
          why={clarifyQuestions[clarifyStep]?.why}
          field={{
            name: clarifyQuestions[clarifyStep]?.id ?? 'clarify',
            label: tp.answerLabel,
            kind: clarifyQuestions[clarifyStep]?.kind ?? 'text',
            required: clarifyQuestions[clarifyStep]?.required ?? false,
          }}
          value={clarifyAnswers[clarifyQuestions[clarifyStep]?.id ?? ''] ?? ''}
          onChange={(value) => {
            const question = clarifyQuestions[clarifyStep]
            if (!question) return
            setClarifyAnswers((prev) => ({ ...prev, [question.id]: value }))
            setError(null)
          }}
          onNext={advanceClarify}
          onBack={() => {
            if (clarifyStep > 0) {
              setDirection('back')
              setClarifyStep((s) => s - 1)
            } else {
              goTo('goal', 'back')
            }
          }}
          nextLabel={
            clarifyStep + 1 < clarifyQuestions.length
              ? tp.nextQuestion
              : tp.clarifySubmit
          }
          error={error}
        />
      ) : null}

      {phase === 'researching' ? (
        <IntakeScreen
          screenKey="researching"
          direction="forward"
          eyebrow={tp.goalEyebrow}
          prompt={tp.goalPrompt}
          why={tp.goalWhy}
          field={{
            name: 'goal-busy',
            label: tp.goalLabel,
            kind: 'textarea',
            required: true,
          }}
          value={goal}
          onChange={() => undefined}
          onNext={() => undefined}
          nextLabel={tp.goalSubmit}
          busy
          busyNote={
            <>
              {tp.researchingLead}
              <span className="font-medium text-foreground">
                {tp.researchingMid}
              </span>
              {tp.researchingTail}
            </>
          }
        />
      ) : null}

      {phase === 'brief' && result ? (
        <IntakeScreen
          screenKey="brief"
          direction={direction}
          eyebrow={
            result.researchMethod === 'web-search'
              ? tp.briefEyebrowWeb
              : tp.briefEyebrowModel
          }
          prompt={tp.briefPrompt}
          why={tp.briefWhy}
          onNext={() => goTo('questions')}
          onBack={() => goTo('goal', 'back')}
          nextLabel={tp.briefSubmit}
          error={error}
        >
          <BriefBody result={result} roster={roster} />
        </IntakeScreen>
      ) : null}

      {(phase === 'questions' || phase === 'reresearching') && result ? (
        <IntakeScreen
          screenKey={questions[questionStep]?.id ?? 'questions'}
          direction={direction}
          eyebrow={format(tp.questionEyebrow, {
            current: questionStep + 1,
            total: questions.length,
          })}
          prompt={questions[questionStep]?.prompt ?? ''}
          why={questions[questionStep]?.why}
          field={{
            name: questions[questionStep]?.id ?? 'answer',
            label: tp.answerLabel,
            kind: questions[questionStep]?.kind ?? 'text',
            required: questions[questionStep]?.required ?? false,
          }}
          value={answers[questions[questionStep]?.id ?? ''] ?? ''}
          onChange={(value) => {
            setAnswers((prev) => ({
              ...prev,
              [questions[questionStep].id]: value,
            }))
            setError(null)
          }}
          onNext={advanceQuestion}
          onBack={() => {
            if (questionStep > 0) {
              setDirection('back')
              setQuestionStep((s) => s - 1)
            } else {
              goTo('brief', 'back')
            }
          }}
          nextLabel={
            questionStep + 1 < questions.length
              ? tp.nextQuestion
              : tp.buildProject
            }
          error={error}
          busy={phase === 'reresearching'}
          busyNote={tp.refiningNote}
        />
      ) : null}

      {phase === 'naming' || phase === 'creating' ? (
        <IntakeScreen
          screenKey="naming"
          direction={direction}
          eyebrow={tp.namingEyebrow}
          prompt={tp.namingPrompt}
          why={tp.namingWhy}
          field={{
            name: 'name',
            label: tp.nameLabel,
            kind: 'text',
            placeholder: tp.namePlaceholder,
            required: true,
          }}
          value={name}
          onChange={(value) => {
            setName(value)
            setError(null)
          }}
          onNext={() => void create()}
          onBack={
            questions.length > 0
              ? () => {
                  setDirection('back')
                  setPhase('questions')
                  setQuestionStep(questions.length - 1)
                }
              : result
                ? () => goTo('brief', 'back')
                : undefined
          }
          nextLabel={tp.namingSubmit}
          isFinal
          error={error}
          busy={phase === 'creating'}
          busyNote={tp.creatingNote}
          footnote={
            result ? (
              <div className="mt-10 max-w-xl space-y-4">
                {refined && (
                  <div className="rounded-2xl border border-seal/30 bg-seal/5 px-5 py-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-seal">
                      {tp.refinedEyebrow}
                    </p>
                    <p className="mt-2 text-pretty text-base font-medium leading-relaxed text-foreground">
                      {refined.refinedGoal}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {tp.refinedNoteLabel} — {refined.refinementNote}
                    </p>
                  </div>
                )}

                <div className="rounded-2xl bg-muted px-5 py-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-seal">
                    {tp.builtEyebrow}
                  </p>
                  <ul className="mt-2.5 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
                    <li>{tp.builtRoot}</li>
                    <li>
                      {format(tp.builtSpecialistsLead, { count: roster.length })}
                      <span className="text-foreground">
                        {roster.map((bot) => bot.displayName).join(', ')}
                      </span>
                      {tp.builtSpecialistsTail}
                    </li>
                    <li>{tp.builtSubGoals}</li>
                  </ul>
                </div>
              </div>
            ) : undefined
          }
        />
      ) : null}
    </div>
  )
}

function IntakeHeader({
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

function BriefBody({
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
