'use client'

import { useLocale } from '@/components/i18n/locale-provider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react'
import { useEffect, useRef } from 'react'

/**
 * The one-question-per-screen surface shared by the Orientation Protocol and the
 * new-project intake.
 *
 * Typeform's model works because attention is never split: one question fills the
 * viewport, the field is borderless so it reads as writing rather than as form
 * entry, and Enter advances so the hands never leave the keyboard. The Apple
 * layer on top is the type scale and the motion — large balanced display type,
 * and a short decelerating slide rather than a hard cut.
 */

export type IntakeDirection = 'forward' | 'back'

export interface IntakeField {
  name: string
  label: string
  kind: 'text' | 'textarea'
  placeholder?: string
  required?: boolean
}

/** Thin progress bar pinned to the top of the viewport. */
export function IntakeProgress({
  value,
  label,
}: {
  /** 0 to 1. */
  value: number
  label: string
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100)

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 h-1 bg-foreground/8"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-r-full bg-seal transition-[width] duration-500 ease-apple"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

export interface IntakeScreenProps {
  /** Drives the enter animation. Changing it remounts the screen. */
  screenKey: string
  direction: IntakeDirection
  eyebrow: string
  prompt: string
  /** Why the agents need this answer. Omitted when it would only add noise. */
  why?: string
  field?: IntakeField
  value?: string
  onChange?: (value: string) => void
  onNext: () => void
  onBack?: () => void
  nextLabel?: string
  /** True when the next action is the last one. */
  isFinal?: boolean
  error?: string | null
  busy?: boolean
  busyNote?: React.ReactNode
  /** Replaces the field when a screen is not a question, e.g. provider setup. */
  children?: React.ReactNode
  /** Shown under the field, e.g. what happens next. */
  footnote?: React.ReactNode
  header?: React.ReactNode
}

export function IntakeScreen({
  screenKey,
  direction,
  eyebrow,
  prompt,
  why,
  field,
  value = '',
  onChange,
  onNext,
  onBack,
  nextLabel = 'Continue',
  isFinal = false,
  error,
  busy = false,
  busyNote,
  children,
  footnote,
  header,
}: IntakeScreenProps) {
  const { t } = useLocale()
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  // Typeform focuses the field as the screen arrives, so the user can type
  // immediately without reaching for the pointer.
  useEffect(() => {
    const node = inputRef.current
    if (!node) return
    const frame = requestAnimationFrame(() => node.focus())
    return () => cancelAnimationFrame(frame)
  }, [screenKey])

  function handleKeyDown(event: React.KeyboardEvent) {
    // Enter confirms a CJK composition rather than submitting, and Safari
    // Desktop reports the final composition event as keyCode 229.
    if (event.key !== 'Enter') return
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    // Shift+Enter stays a newline in a textarea.
    if (event.shiftKey && field?.kind === 'textarea') return
    event.preventDefault()
    onNext()
  }

  const canAdvance = field
    ? !field.required || value.trim().length > 0
    : true

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {header}

      <div className="flex flex-1 items-center justify-center px-6 py-16 sm:px-10">
        <div
          key={screenKey}
          className={cn(
            'w-full max-w-2xl',
            direction === 'forward' ? 'intake-enter-forward' : 'intake-enter-back',
          )}
        >
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-seal">
            {eyebrow}
          </p>

          <h1 className="mt-5 text-balance text-display text-foreground">
            {prompt}
          </h1>

          {why && (
            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
              {why}
            </p>
          )}

          {field && onChange ? (
            <div className="mt-10">
              <label
                htmlFor={`intake-${field.name}`}
                className="sr-only"
              >
                {field.label}
              </label>

              <div className="field-underline">
                {field.kind === 'textarea' ? (
                  <textarea
                    id={`intake-${field.name}`}
                    ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                    value={value}
                    rows={3}
                    placeholder={field.placeholder}
                    disabled={busy}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full resize-none border-0 bg-transparent p-0 text-2xl leading-snug tracking-[-0.02em] text-foreground outline-none placeholder:text-muted-foreground/40 sm:text-3xl"
                  />
                ) : (
                  <input
                    id={`intake-${field.name}`}
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type="text"
                    value={value}
                    placeholder={field.placeholder}
                    disabled={busy}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full border-0 bg-transparent p-0 text-2xl leading-snug tracking-[-0.02em] text-foreground outline-none placeholder:text-muted-foreground/40 sm:text-3xl"
                  />
                )}
              </div>

              <p className="mt-3 text-sm text-muted-foreground">
                {field.required ? (
                  <>
                    {t.intake.enterLead}
                    <KeyCap>Enter</KeyCap>
                    {t.intake.enterTail}
                  </>
                ) : (
                  <>
                    {t.intake.optionalLead}
                    <KeyCap>Enter</KeyCap>
                    {t.intake.optionalTail}
                  </>
                )}
              </p>
            </div>
          ) : (
            children
          )}

          {footnote}

          {error && (
            <p role="alert" className="mt-6 text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          <div className="mt-10 flex flex-wrap items-center gap-3">
            {onBack && (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={onBack}
                disabled={busy}
                className="text-muted-foreground"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                {t.intake.back}
              </Button>
            )}

            <Button
              type="button"
              size="lg"
              onClick={onNext}
              disabled={busy || !canAdvance}
              className="rounded-full px-6 shadow-soft transition-shadow hover:shadow-lifted"
            >
              {busy ? t.common.working : nextLabel}
              {!busy && (
                <ArrowRight className="size-4" aria-hidden="true" />
              )}
            </Button>

            {!field?.required && field && (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={onNext}
                disabled={busy}
                className="text-muted-foreground"
              >
                {t.intake.skip}
              </Button>
            )}
          </div>

          {busy && busyNote && (
            <p
              role="status"
              className="mt-8 max-w-xl rounded-2xl bg-muted px-5 py-4 text-sm leading-relaxed text-muted-foreground"
            >
              {busyNote}
            </p>
          )}
        </div>
      </div>

      {isFinal && (
        <p className="pb-8 text-center text-xs text-muted-foreground/70">
          {t.intake.lastStep}
        </p>
      )}
    </div>
  )
}

function KeyCap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-xs font-medium text-foreground">
      <ArrowUp className="size-3" aria-hidden="true" />
      {children}
    </kbd>
  )
}
