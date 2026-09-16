'use client'

import { setLocale } from '@/app/actions/settings'
import { useLocale } from '@/components/i18n/locale-provider'
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n/locales'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * Switches the language the workspace is written in.
 *
 * Rendered as a pair of toggle buttons rather than a dropdown: with two languages
 * a menu hides the option that is not currently chosen, and the whole point of the
 * control is that a reader who cannot understand the interface can still find
 * their own language. Each option is therefore written in its own language.
 *
 * The choice is applied optimistically so the control responds immediately, then
 * reconciled once the server has persisted it and re-rendered the tree.
 */
export function LanguageSelector({ className }: { className?: string }) {
  const { locale, t } = useLocale()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [chosen, setChosen] = useState<Locale | null>(null)

  const current = chosen ?? locale

  function choose(next: Locale) {
    if (next === locale || pending) return
    setChosen(next)
    startTransition(async () => {
      try {
        await setLocale(next)
        router.refresh()
      } finally {
        setChosen(null)
      }
    })
  }

  return (
    <div
      role="group"
      aria-label={t.common.language}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5',
        pending && 'opacity-60',
        className,
      )}
    >
      {LOCALES.map((option) => {
        const active = current === option

        return (
          <button
            key={option}
            type="button"
            onClick={() => choose(option)}
            disabled={pending}
            aria-pressed={active}
            title={LOCALE_META[option].label}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-sumi text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {LOCALE_META[option].native}
          </button>
        )
      })}
    </div>
  )
}
