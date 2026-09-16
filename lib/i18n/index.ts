import { en, type Dictionary } from './dictionaries/en'
import { ja } from './dictionaries/ja'
import { DEFAULT_LOCALE, type Locale } from './locales'

export const DICTIONARIES: Record<Locale, Dictionary> = { en, ja }

/**
 * The catalogue for a locale.
 *
 * Dictionaries are static modules, so a client component can call this directly
 * with the locale it was given. That keeps the strings out of the server payload
 * entirely — only the locale tag crosses the boundary.
 */
export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE]
}

/**
 * Substitutes `{name}` placeholders.
 *
 * An unknown placeholder is left as written rather than blanked, so a typo shows
 * up on screen instead of silently deleting part of a sentence.
 */
export function format(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}

export type { Dictionary }
export * from './locales'
