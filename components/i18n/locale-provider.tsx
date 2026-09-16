'use client'

import { getDictionary, type Dictionary, type Locale } from '@/lib/i18n'
import { createContext, useContext, useMemo } from 'react'

interface LocaleContextValue {
  locale: Locale
  t: Dictionary
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

/**
 * Makes the resolved language available to every client component.
 *
 * The locale is decided on the server — from the cookie, or the signed-in user's
 * stored preference — and passed down once. The dictionary itself is looked up on
 * the client from the static catalogue, so no string content is serialised into
 * the server payload.
 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale
  children: React.ReactNode
}) {
  const value = useMemo<LocaleContextValue>(
    () => ({ locale, t: getDictionary(locale) }),
    [locale],
  )

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  )
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error('useLocale must be used inside a LocaleProvider')
  }
  return context
}
