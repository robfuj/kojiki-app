'use client'

import { completeOrientation } from '@/app/actions/orientation'
import { ProviderConnect } from '@/components/providers/provider-connect'
import { SignOutButton } from '@/components/sign-out-button'
import { Button } from '@/components/ui/button'
import {
  ORIENTATION_QUESTIONS,
  type OrientationAnswers,
} from '@/lib/ontology/orientation'
import { cn } from '@/lib/utils'
import { ArrowRight, Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Answers = Record<string, string>

const EMPTY: Answers = {
  userName: '',
  goal: '',
  industry: '',
  jurisdiction: '',
  geography: '',
  businessModel: '',
}

export function OrientationFlow({ userName }: { userName: string | null }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // The provider step sits after the questions. It is infrastructure rather than
  // orientation content, so it is not part of ORIENTATION_QUESTIONS — but it has to
  // be settled before the agents can do paid work, which is why it is here rather
  // than buried in settings where a first-run user would never find it.
  const providerStep = ORIENTATION_QUESTIONS.length
  const totalSteps = providerStep + 1
  const onProviderStep = step === providerStep
  const onLastQuestion = step === ORIENTATION_QUESTIONS.length - 1
  const question = onProviderStep ? null : ORIENTATION_QUESTIONS[step]

  const currentQuestionComplete =
    question === null ||
    question.fields.every((field) => {
      if (!field.required) return true
      return answers[field.name]?.trim().length > 0
    })

  // Orientation cannot complete with a hole in it: the orchestrator's research and
  // specialist selection are driven by these answers, so an empty goal would
  // produce an empty organisation. The provider step is reachable only by walking
  // through the questions, and finishing validates every required field rather
  // than just the one on screen.
  const allQuestionsComplete = ORIENTATION_QUESTIONS.every((item) =>
    item.fields.every(
      (field) => !field.required || answers[field.name]?.trim().length > 0,
    ),
  )

  function setField(name: string, value: string) {
    setAnswers((prev) => ({ ...prev, [name]: value }))
    setError(null)
  }

  function advance() {
    if (!currentQuestionComplete) {
      setError('Answer the required field before continuing.')
      return
    }
    setError(null)
    if (!onProviderStep) setStep((s) => s + 1)
  }

  async function finish() {
    if (!allQuestionsComplete) {
      setError('Answer every required question before completing orientation.')
      setStep(
        ORIENTATION_QUESTIONS.findIndex((item) =>
          item.fields.some(
            (field) => field.required && !answers[field.name]?.trim(),
          ),
        ),
      )
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const payload: OrientationAnswers = {
        userName: answers.userName.trim(),
        goal: answers.goal.trim(),
        industry: answers.industry.trim(),
        jurisdiction: answers.jurisdiction.trim() || null,
        geography: answers.geography.trim() || null,
        businessModel: answers.businessModel.trim() || null,
      }

      await completeOrientation(payload)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save orientation')
      setSubmitting(false)
    }
  }

  return (
    <main className="kojiki-grid min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-0 px-6 py-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-12 lg:py-16">
        <aside className="border-border/70 lg:border-r lg:pr-10">
          <p className="font-serif text-4xl leading-none tracking-tight text-foreground">
            古事記
          </p>
          <h1 className="mt-3 font-serif text-2xl text-foreground">
            Orientation Protocol
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The department agents work for you, so orientation is about you: who
            you are, what you are trying to accomplish, and what industry you are
            in. The orchestrator then researches your goal and decides which
            specialists it needs.
          </p>

          <ol className="mt-8 space-y-1">
            {ORIENTATION_QUESTIONS.map((item, index) => {
              const state =
                index < step ? 'done' : index === step ? 'active' : 'pending'
              const done = item.fields.every(
                (field) => !field.required || answers[field.name]?.trim(),
              )

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => index <= step && setStep(index)}
                    disabled={index > step || submitting}
                    aria-current={state === 'active' ? 'step' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors',
                      state === 'active' && 'bg-sumi-soft text-foreground',
                      state === 'done' &&
                        'text-muted-foreground hover:bg-muted hover:text-foreground',
                      state === 'pending' &&
                        'cursor-default text-muted-foreground/50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]',
                        state === 'active' &&
                          'border-sumi bg-sumi text-primary-foreground',
                        state === 'done' &&
                          done &&
                          'border-seal bg-seal text-accent-foreground',
                        state === 'done' &&
                          !done &&
                          'border-border text-muted-foreground',
                        state === 'pending' &&
                          'border-border/60 text-muted-foreground/50',
                      )}
                    >
                      {state === 'done' && done ? (
                        <Check className="size-3" aria-hidden="true" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="font-mono text-xs uppercase tracking-wide">
                      {item.label}
                    </span>
                  </button>
                </li>
              )
            })}

            <li>
              <button
                type="button"
                onClick={() => setStep(providerStep)}
                disabled={step < providerStep || submitting}
                aria-current={onProviderStep ? 'step' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors',
                  onProviderStep
                    ? 'bg-sumi-soft text-foreground'
                    : 'cursor-default text-muted-foreground/50',
                )}
              >
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]',
                    onProviderStep
                      ? 'border-sumi bg-sumi text-primary-foreground'
                      : 'border-border/60 text-muted-foreground/50',
                  )}
                >
                  {providerStep + 1}
                </span>
                <span className="font-mono text-xs uppercase tracking-wide">
                  Providers
                </span>
              </button>
            </li>
          </ol>

          {userName && (
            <p className="mt-8 flex items-center gap-2 border-t border-border/70 pt-4 text-xs text-muted-foreground">
              Signed in as <span className="text-foreground">{userName}</span>
              <span aria-hidden="true">·</span>
              <SignOutButton />
            </p>
          )}
        </aside>

        <section className="flex flex-col justify-center py-10 lg:py-0">
          <div className="max-w-xl">
            {question ? (
              <>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-seal">
                  {question.label}
                </p>
                <h2 className="mt-4 text-balance font-serif text-3xl leading-snug text-foreground">
                  {question.prompt}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {question.why}
                </p>

                <div className="mt-8 space-y-5">
                  {question.fields.map((field) => {
                    const id = `orientation-${field.name}`
                    const value = answers[field.name] ?? ''

                    return (
                      <div key={field.name}>
                        <label
                          htmlFor={id}
                          className="flex items-baseline gap-2 text-sm font-medium text-foreground"
                        >
                          {field.label}
                          {field.required ? (
                            <span className="font-mono text-[10px] uppercase tracking-wide text-seal">
                              required
                            </span>
                          ) : (
                            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/60">
                              optional
                            </span>
                          )}
                        </label>

                        {field.kind === 'textarea' ? (
                          <textarea
                            id={id}
                            value={value}
                            rows={4}
                            placeholder={field.placeholder}
                            onChange={(event) =>
                              setField(field.name, event.target.value)
                            }
                            className="mt-2 w-full resize-y rounded-md border border-input bg-card px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-ring focus:ring-2 focus:ring-ring/25"
                          />
                        ) : (
                          <input
                            id={id}
                            type="text"
                            value={value}
                            placeholder={field.placeholder}
                            onChange={(event) =>
                              setField(field.name, event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (
                                event.key === 'Enter' &&
                                !event.nativeEvent.isComposing
                              ) {
                                event.preventDefault()
                                advance()
                              }
                            }}
                            className="mt-2 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-ring focus:ring-2 focus:ring-ring/25"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>

                {onLastQuestion && (
                  <div className="mt-8 rounded-md border border-border bg-card px-4 py-3.5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-seal">
                      what happens next
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      The orchestrator researches your goal and industry on the
                      live web — market, competition, regulation, risk — then
                      selects which of the eight canonical specialists your goal
                      actually needs. Only those are instantiated, and every one
                      of them sees the same research.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-seal">
                  Providers
                </p>
                <h2 className="mt-4 text-balance font-serif text-3xl leading-snug text-foreground">
                  Which provider runs the work?
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Each department head proposes a model per task and you approve it
                  before anything runs, so nothing spends money you did not agree
                  to. Connecting a provider is what makes that choice real — you
                  can skip it and everything runs on the free tier instead.
                </p>

                <div className="mt-8">
                  <ProviderConnect title="Connect a provider" />
                </div>
              </>
            )}

            {error && (
              <p role="alert" className="mt-5 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="mt-8 flex items-center gap-3">
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep((s) => s - 1)}
                  disabled={submitting}
                >
                  Back
                </Button>
              )}

              {onProviderStep ? (
                <Button type="button" onClick={finish} disabled={submitting}>
                  {submitting ? 'Orchestrating…' : 'Complete orientation'}
                </Button>
              ) : (
                <Button type="button" onClick={advance}>
                  Continue
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              )}

              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {step + 1} / {totalSteps}
              </span>
            </div>

            {submitting && (
              <p
                role="status"
                className="mt-6 rounded-md border border-border bg-sumi-soft px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"
              >
                Researching{' '}
                <span className="text-foreground">
                  {answers.industry || 'your industry'}
                </span>{' '}
                and selecting the specialists your goal needs. This takes a
                moment.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
