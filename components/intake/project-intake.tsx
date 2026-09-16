'use client'

import {
  createProjectFromIntake,
  researchProjectGoal,
  type IntakeAnswer,
} from '@/app/actions/intake'
import type { ProjectRow } from '@/app/actions/projects'
import {
  IntakeProgress,
  IntakeScreen,
  type IntakeDirection,
} from '@/components/intake/intake-screen'
import { Button } from '@/components/ui/button'
import { deriveRoster } from '@/lib/ontology/orientation'
import type { ProjectIntakeResult } from '@/lib/orchestrator'
import { cn } from '@/lib/utils'
import { ExternalLink, Loader2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

/**
 * New project, orchestrator first.
 *
 * Clicking New project used to open a name field. It now opens the orchestrator,
 * because the orchestrator is the thing with something to say: it reads the goal,
 * reports what it found about the field, and asks the questions whose answers
 * change the plan. Only then is a project created — with its root objective, its
 * sub-goals and its roster already in place, so the workspace opens on a tree that
 * can be dispatched rather than an empty one.
 */

type Phase = 'goal' | 'researching' | 'brief' | 'questions' | 'naming' | 'creating'

export function ProjectIntake({
  onClose,
  onCreated,
}: {
  onClose: () => void
  /** Hands the new project to the rail so it is selected the moment it exists. */
  onCreated: (project: ProjectRow) => void
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('goal')
  const [direction, setDirection] = useState<IntakeDirection>('forward')
  const [goal, setGoal] = useState('')
  const [result, setResult] = useState<ProjectIntakeResult | null>(null)
  const [questionStep, setQuestionStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
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

  // Progress counts the screens the user actually walks: goal, brief, each
  // question, then naming. The two busy phases inherit the screen they belong to.
  const totalScreens = 1 + 1 + questions.length + 1
  const currentScreen =
    phase === 'goal' || phase === 'researching'
      ? 0
      : phase === 'brief'
        ? 1
        : phase === 'questions'
          ? 2 + questionStep
        : 2 + questions.length

  function goTo(next: Phase, dir: IntakeDirection = 'forward') {
    setDirection(dir)
    setPhase(next)
    setError(null)
  }

  async function research() {
    if (goal.trim().length < 8) {
      setError('Describe the goal in a little more detail.')
      return
    }

    setPhase('researching')
    setError(null)

    try {
      const intake = await researchProjectGoal({ goal: goal.trim() })
      setResult(intake)
      setQuestionStep(0)
      // A goal with no open questions goes straight to naming.
      goTo(intake.questions.length > 0 ? 'brief' : 'naming')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The orchestrator could not research this goal')
      setPhase('goal')
    }
  }

  function advanceQuestion() {
    const question = questions[questionStep]
    if (question?.required && !answers[question.id]?.trim().length) {
      setError('This answer is required before the plan can be built.')
      return
    }
    setError(null)
    if (questionStep + 1 < questions.length) {
      setQuestionStep((s) => s + 1)
      setDirection('forward')
    } else {
      goTo('naming')
    }
  }

  async function create() {
    if (!result) return
    if (!name.trim()) {
      setError('Give the project a name.')
      return
    }

    setPhase('creating')
    setError(null)

    try {
      const payload: IntakeAnswer[] = questions.map((question) => ({
        prompt: question.prompt,
        answer: answers[question.id] ?? '',
      }))

      const project = await createProjectFromIntake({
        name: name.trim(),
        goal: goal.trim(),
        rosterKeys: result.rosterKeys,
        rosterRationale: result.rosterRationale,
        brief: result.brief,
        researchMethod: result.researchMethod,
        answers: payload,
      })

      router.refresh()
      onCreated(project)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the project')
      setPhase('naming')
    }
  }

  const busy = phase === 'researching' || phase === 'creating'

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <IntakeProgress
        value={(currentScreen + 1) / totalScreens}
        label="New project progress"
      />

      <IntakeHeader onClose={onClose} disabled={busy} />

      {phase === 'goal' || phase === 'researching' ? (
        <IntakeScreen
          screenKey="goal"
          direction="forward"
          eyebrow="New project"
          prompt="What is this project trying to achieve?"
          why="The orchestrator reads this goal, researches the field it sits in, and comes back with what it found and the questions worth asking before anything is planned."
          field={{
            name: 'goal',
            label: 'Project goal',
            kind: 'textarea',
            placeholder: 'e.g. Launch a partner channel that adds 40 qualified deals a quarter',
            required: true,
          }}
          value={goal}
          onChange={(value) => {
            setGoal(value)
            setError(null)
          }}
          onNext={() => void research()}
          nextLabel="Ask the orchestrator"
          error={error}
          busy={phase === 'researching'}
          busyNote={
            <>
              Researching the field around{' '}
              <span className="font-medium text-foreground">this goal</span> —
              market, competition, regulation and risk — then deciding which
              specialists it needs and what to ask you. This takes a moment.
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
              ? 'Orchestrator · live research'
              : 'Orchestrator · model reasoning'
          }
          prompt="Here is what I found."
          why="Read this before answering. Where it is wrong or stale, say so in the questions that follow — the plan is built from both."
          onNext={() => goTo('questions')}
          onBack={() => goTo('goal', 'back')}
          nextLabel="Answer the questions"
          error={error}
        >
          <BriefBody result={result} roster={roster} />
        </IntakeScreen>
      ) : null}

      {phase === 'questions' && result ? (
        <IntakeScreen
          screenKey={questions[questionStep]?.id ?? 'questions'}
          direction={direction}
          eyebrow={`Question ${questionStep + 1} of ${questions.length}`}
          prompt={questions[questionStep]?.prompt ?? ''}
          why={questions[questionStep]?.why}
          field={{
            name: questions[questionStep]?.id ?? 'answer',
            label: 'Your answer',
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
            questionStep + 1 < questions.length ? 'Next question' : 'Build the project'
          }
          error={error}
        />
      ) : null}

      {phase === 'naming' || phase === 'creating' ? (
        <IntakeScreen
          screenKey="naming"
          direction={direction}
          eyebrow="Last step"
          prompt="What should this project be called?"
          why="The goal becomes the root of the OKR tree and the specialists below are already chosen. The name is how you will find it in the rail."
          field={{
            name: 'name',
            label: 'Project name',
            kind: 'text',
            placeholder: 'e.g. Partner channel',
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
          nextLabel="Create project"
          isFinal
          error={error}
          busy={phase === 'creating'}
          busyNote="Creating the project, instantiating its specialists, and decomposing the goal into sub-goals."
          footnote={
            result ? (
              <div className="mt-10 max-w-xl rounded-2xl bg-muted px-5 py-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-seal">
                  what gets built
                </p>
                <ul className="mt-2.5 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
                  <li>
                    The goal becomes the root objective of a new OKR tree.
                  </li>
                  <li>
                    {roster.length} specialists are instantiated:{' '}
                    <span className="text-foreground">
                      {roster.map((bot) => bot.displayName).join(', ')}
                    </span>
                    .
                  </li>
                  <li>
                    The root is decomposed into sub-goals owned by those
                    specialists, ready to dispatch.
                  </li>
                </ul>
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
          Close
          <span className="sr-only">the new project intake</span>
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
  const sections = [
    { heading: 'Market', body: result.brief.marketScan },
    { heading: 'Competition', body: result.brief.competitiveLandscape },
    { heading: 'Regulation', body: result.brief.regulatoryConsiderations },
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
              Key risks
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
          Specialists selected
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
            Sources
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
          Live web research was unavailable, so this brief comes from model
          reasoning rather than current sources. Treat the figures as indicative
          and correct anything you know to be wrong.
        </p>
      )}
    </div>
  )
}
