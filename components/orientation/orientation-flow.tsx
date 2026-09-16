'use client'

import { completeOrientation } from '@/app/actions/orientation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  FUNCTION_LINES,
  ORIENTATION_QUESTIONS,
  type OrientationAnswers,
} from '@/lib/ontology/orientation'
import { ArrowRight, Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Answers = Record<string, string>

const EMPTY: Answers = {
  agentName: '',
  functionLine: '',
  industry: '',
  sector: '',
  country: '',
  region: '',
  regulatoryRegime: '',
  geography: '',
  businessModel: '',
  groupId: '',
}

const functionLineLabel = (value: string) =>
  FUNCTION_LINES.find((line) => line.value === value)?.label ?? value

export function OrientationFlow({ userName }: { userName: string | null }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const question = ORIENTATION_QUESTIONS[step]
  const isLast = step === ORIENTATION_QUESTIONS.length - 1

  const currentQuestionComplete = question.fields.every((field) => {
    if (!field.required) return true
    return answers[field.name]?.trim().length > 0
  })

  function setField(name: string, value: string) {
    setAnswers((prev) => ({ ...prev, [name]: value }))
    setError(null)
  }

  function advance() {
    if (!currentQuestionComplete) {
      setError('Answer the required fields before continuing.')
      return
    }
    setError(null)
    if (!isLast) setStep((s) => s + 1)
  }

  async function finish() {
    if (!currentQuestionComplete) {
      setError('Answer the required fields before continuing.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const payload: OrientationAnswers = {
        agentName: answers.agentName.trim(),
        functionLine: answers.functionLine,
        industry: answers.industry.trim() || null,
        sector: answers.sector.trim() || null,
        country: answers.country.trim() || null,
        region: answers.region.trim() || null,
        regulatoryRegime: answers.regulatoryRegime.trim() || null,
        geography: answers.geography.trim() || null,
        businessModel: answers.businessModel.trim() || null,
        groupId: answers.groupId.trim() || null,
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
            Before any decision work, the agent must orient: establish identity,
            learn the operating context, and discover sibling agents so the
            organization&apos;s functions can coordinate.
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
                    disabled={index > step}
                    aria-current={state === 'active' ? 'step' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors',
                      state === 'active' && 'bg-sumi-soft text-foreground',
                      state === 'done' &&
                        'text-muted-foreground hover:bg-muted hover:text-foreground',
                      state === 'pending' && 'cursor-default text-muted-foreground/50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-mono',
                        state === 'active' && 'border-sumi bg-sumi text-primary-foreground',
                        state === 'done' && done && 'border-seal bg-seal text-accent-foreground',
                        state === 'done' && !done && 'border-border text-muted-foreground',
                        state === 'pending' && 'border-border/60 text-muted-foreground/50',
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
          </ol>

          {userName && (
            <p className="mt-8 border-t border-border/70 pt-4 text-xs text-muted-foreground">
              Signed in as <span className="text-foreground">{userName}</span>
            </p>
          )}
        </aside>

        <section className="flex flex-col justify-center py-10 lg:py-0">
          <div className="max-w-xl">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-seal">
              {question.label}
            </p>
            <h2 className="mt-4 text-balance font-serif text-3xl leading-snug text-foreground">
              {question.prompt}
            </h2>

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

                    {field.kind === 'select' ? (
                      <select
                        id={id}
                        value={value}
                        onChange={(event) => setField(field.name, event.target.value)}
                        className="mt-2 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/25"
                      >
                        <option value="">Select a function line</option>
                        {FUNCTION_LINES.map((line) => (
                          <option key={line.value} value={line.value}>
                            {line.label} — {line.description}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={id}
                        type="text"
                        value={value}
                        placeholder={field.placeholder}
                        onChange={(event) => setField(field.name, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                            event.preventDefault()
                            isLast ? finish() : advance()
                          }
                        }}
                        className="mt-2 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-ring focus:ring-2 focus:ring-ring/25"
                      />
                    )}
                  </div>
                )
              })}
            </div>

            <dl className="mt-8 space-y-2 border-t border-border/70 pt-5 font-mono text-xs text-muted-foreground">
              <div className="flex gap-2">
                <dt className="shrink-0 uppercase tracking-wide text-muted-foreground/70">
                  captures
                </dt>
                <dd className="text-foreground">{question.captures.join(', ')}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 uppercase tracking-wide text-muted-foreground/70">
                  flows to
                </dt>
                <dd className="text-foreground">{question.flowsTo}</dd>
              </div>
            </dl>

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

              {isLast ? (
                <Button type="button" onClick={finish} disabled={submitting}>
                  {submitting ? 'Orienting…' : 'Complete orientation'}
                </Button>
              ) : (
                <Button type="button" onClick={advance}>
                  Continue
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              )}

              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {step + 1} / {ORIENTATION_QUESTIONS.length}
              </span>
            </div>

            {answers.functionLine && (
              <p className="mt-6 rounded-md border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
                Registering as{' '}
                <span className="font-medium text-foreground">
                  {answers.agentName || 'unnamed agent'}
                </span>{' '}
                on the{' '}
                <span className="font-medium text-foreground">
                  {functionLineLabel(answers.functionLine)}
                </span>{' '}
                line. Projects will instantiate this department first, then its
                handoff targets.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
