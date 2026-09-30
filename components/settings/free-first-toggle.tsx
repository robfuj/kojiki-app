'use client'

import { setFreeFirst } from '@/app/actions/settings'
import { useLocale } from '@/components/i18n/locale-provider'
import { cn } from '@/lib/utils'
import { useState, useTransition } from 'react'

/**
 * The free-first preference, as a switch rather than a checkbox.
 *
 * Optimistic: the switch moves immediately and rolls back if the write fails,
 * because a preference toggle that waits for a round trip feels broken. The
 * initial value comes from the server so the switch shows the stored truth, not
 * a guess.
 */
export function FreeFirstToggle({ initial }: { initial: boolean }) {
  const { t } = useLocale()
  const [on, setOn] = useState(initial)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !on
    setOn(next)
    startTransition(async () => {
      try {
        await setFreeFirst(next)
      } catch {
        setOn(!next)
      }
    })
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{t.settings.freeFirstTitle}</p>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          {t.settings.freeFirstDescription}
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={t.settings.freeFirstTitle}
        disabled={pending}
        onClick={toggle}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
          on ? 'border-sumi bg-sumi' : 'border-border bg-muted',
          pending && 'cursor-wait opacity-50',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block size-4 transform rounded-full bg-background shadow-sm transition-transform',
            on ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  )
}
