/**
 * The languages the workspace can be read in.
 *
 * Kept as a closed union rather than an open string so a dictionary that is
 * missing a locale fails to compile instead of silently rendering keys. Adding a
 * language means adding it here and shipping a matching dictionary.
 */
export const LOCALES = ['en', 'ja'] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/**
 * Carries the language for visitors who are not signed in yet.
 *
 * The sign-in and sign-up screens are the first thing a new person sees, and there
 * is no user row to store a preference against at that point, so the cookie is what
 * makes the language choice work before authentication.
 *
 * This lives here rather than in the settings actions because a `'use server'`
 * module may only export async functions — a constant export there is a build
 * error, not a warning.
 */
export const LOCALE_COOKIE = 'kojiki_locale'

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export interface LocaleMeta {
  /** Name in English, for a list a reader may not yet understand. */
  label: string
  /** Name in its own language, which is what the selector shows. */
  native: string
  /** Value for the `lang` attribute, including the script where it matters. */
  htmlLang: string
  /**
   * Appended to agent prompts so generated prose follows the reader's language.
   * Null for English, which the prompts are already written in.
   */
  directive: string | null
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { label: 'English', native: 'English', htmlLang: 'en', directive: null },
  ja: {
    label: 'Japanese',
    native: '日本語',
    htmlLang: 'ja',
    directive:
      'Write every sentence the user reads in Japanese (日本語). Keep specialist keys, model identifiers, URLs and code tokens verbatim. Product terms the interface transliterates — オーケストレーター、OKR、SYNAPSIS、プロバイダー — stay exactly as the interface writes them.',
  },
}

/** The prompt instruction that makes generated prose follow the reader's language. */
export function languageDirective(locale: Locale): string | null {
  return LOCALE_META[locale].directive
}

/** Narrows an untrusted string — a cookie or a database column — to a Locale. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}
