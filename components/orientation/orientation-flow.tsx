'use client'

import { completeOrientation } from '@/app/actions/orientation'
import { LanguageSelector } from '@/components/i18n/language-selector'
import { useLocale } from '@/components/i18n/locale-provider'
import {
  IntakeProgress,
  IntakeScreen,
  type IntakeDirection,
} from '@/components/intake/intake-screen'
import { ProviderConnect } from '@/components/providers/provider-connect'
import { SignOutButton } from '@/components/sign-out-button'
import {
  ORIENTATION_QUESTIONS,
  type OrientationAnswers,
  type OrientationField,
} from '@/lib/ontology/orientation'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

type Answers = Record<string, string>

const EMPTY: Answers = {
  userName: '',
  goal: '',
  industry: '',
  jurisdiction: '',
  geography: '',
  businessModel: '',
}

interface Screen {
  key: string
  eyebrow: string
  prompt: string
  why: string
  field: OrientationField
}

/** The category name, taken from a label shaped like "Q1 — Identity". */
function categoryOf(label: string): string {
  const parts = label.split('—')
  return (parts[1] ?? label).trim()
}

/**
 * One field per screen.
 *
 * The protocol is defined as four questions, but the fourth carries three
 * optional fields. Showing them together would put three inputs on one screen and
 * break the single-question rhythm, so each field becomes its own screen and
 * carries its own prompt. The ontology stays the source of truth for field names,
 * placeholders and requiredness.
 */
const SCREENS: Screen[] = ORIENTATION_QUESTIONS.flatMap((question) =>
  question.fields.map((field) => ({
    key: field.name,
    eyebrow: categoryOf(question.label),
    prompt: field.screenPrompt ?? question.prompt,
    why: field.screenWhy ?? question.why,
    field,
  })),
)

const PROVIDER_KEY = 'providers'
const TOTAL = SCREENS.length + 1

export function OrientationFlow({ userName }: { userName: string | null }) {
  const { t } = useLocale()
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<IntakeDirection>('forward')
  const [answers, setAnswers] = useState<Answers>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onProviderStep = step === SCREENS.length
  const screen = onProviderStep ? null : SCREENS[step]

  // The ontology owns field names and requiredness; the sentences a reader sees
  // come from the dictionary so they follow the chosen language.
  const screenCopy = screen
    ? t.orientationScreens[screen.key as keyof typeof t.orientationScreens]
    : null

  // Orientation cannot complete with a hole in it: the orchestrator's research and
  // specialist selection are driven by these answers, so an empty goal would
  // produce an empty organisation. Finishing therefore validates every required
  // field and returns to the first one that is missing, rather than trusting the
  // screen the user happens to be on.
  const missingIndex = useMemo(
    () =>
      SCREENS.findIndex(
        (item) =>
          item.field.required && !answers[item.field.name]?.trim().length,
      ),
    [answers],
  )

  function setField(name: string, value: string) {
    setAnswers((prev) => ({ ...prev, [name]: value }))
    setError(null)
  }

  function goTo(next: number) {
    setDirection(next > step ? 'forward' : 'back')
    setStep(next)
    setError(null)
  }

  function advance() {
    if (onProviderStep) {
      void finish()
      return
    }
    if (!screen) return
    if (screen.field.required && !answers[screen.field.name]?.trim().length) {
      setError(t.orientation.requiredError)
      return
    }
    goTo(step + 1)
  }

  async function finish() {
    if (missingIndex >= 0) {
      setError(t.orientation.incompleteError)
      goTo(missingIndex)
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
      setError(err instanceof Error ? err.message : t.orientation.saveError)
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <IntakeProgress
        value={(step + 1) / TOTAL}
        label={t.orientation.progressLabel}
      />

      <IntakeScreen
        screenKey={onProviderStep ? PROVIDER_KEY : screen!.key}
        direction={direction}
        eyebrow={onProviderStep ? t.orientation.providersEyebrow : screenCopy!.eyebrow}
        prompt={
          onProviderStep ? t.orientation.providersPrompt : screenCopy!.prompt
        }
        why={onProviderStep ? t.orientation.providersWhy : screenCopy!.why}
        field={
          onProviderStep
            ? undefined
            : {
                ...screen!.field,
                label: screenCopy!.label,
                placeholder: screenCopy!.placeholder,
              }
        }
        value={onProviderStep ? '' : (answers[screen!.field.name] ?? '')}
        onChange={
          onProviderStep
            ? undefined
            : (value) => setField(screen!.field.name, value)
        }
        onNext={advance}
        onBack={step > 0 ? () => goTo(step - 1) : undefined}
        nextLabel={
          onProviderStep ? t.orientation.completeSubmit : t.common.continue
        }
        isFinal={onProviderStep}
        error={error}
        busy={submitting}
        busyNote={
          <>
            {t.orientation.researchingLead}
            <span className="font-medium text-foreground">
              {answers.industry || t.orientation.industryFallback}
            </span>
            {t.orientation.researchingTail}
          </>
        }
        header={<OrientationHeader userName={userName} />}
        footnote={
          onProviderStep ? (
            <div className="mt-10 max-w-xl rounded-2xl bg-muted px-5 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-seal">
                {t.orientation.nextEyebrow}
              </p>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                {t.orientation.nextBody}
              </p>
            </div>
          ) : undefined
        }
      >
        <div className="mt-10">
          <ProviderConnect title={t.orientation.connectTitle} />
        </div>
      </IntakeScreen>
    </main>
  )
}

function OrientationHeader({ userName }: { userName: string | null }) {
  const { t } = useLocale()

  return (
    <header className="surface-translucent sticky top-0 z-40 border-b border-border">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 sm:px-10">
        <p className="font-serif text-2xl leading-none tracking-tight text-foreground">
          古事記
        </p>

        <div className="flex items-center gap-4">
          <p className="hidden font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground sm:block">
            {t.orientation.protocol}
          </p>
          <LanguageSelector />
          {userName && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="max-w-32 truncate text-foreground">
                {userName}
              </span>
              <SignOutButton />
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
