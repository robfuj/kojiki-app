/**
 * The accent colours a user may choose.
 *
 * The accent is the seal: it marks decisions, completion and the primary action.
 * It is deliberately the only user-changeable colour, because a workspace where
 * every surface can be recoloured stops having a readable hierarchy. Structure
 * stays sumi indigo and neutral grey regardless of the accent chosen.
 *
 * Values are oklch so light and dark variants can be derived by adjusting
 * lightness alone, which keeps chroma — and therefore the perceived intensity of
 * the accent — consistent between themes.
 */

export interface Accent {
  key: string
  label: string
  /** Light theme. */
  seal: string
  sealSoft: string
  /** Text colour that stays legible on top of `seal`. */
  sealForeground: string
  /** Dark theme. */
  darkSeal: string
  darkSealSoft: string
  /** Swatch shown in the picker, in a format CSS can use directly. */
  swatch: string
}

export const ACCENTS: readonly Accent[] = [
  {
    key: 'seal',
    label: 'Seal vermilion',
    seal: 'oklch(0.58 0.19 28)',
    sealSoft: 'oklch(0.955 0.022 30)',
    sealForeground: 'oklch(0.99 0.003 285)',
    darkSeal: 'oklch(0.68 0.17 30)',
    darkSealSoft: 'oklch(0.3 0.06 30)',
    swatch: '#C0392B',
  },
  {
    key: 'blue',
    label: 'Pacific blue',
    seal: 'oklch(0.55 0.19 255)',
    sealSoft: 'oklch(0.955 0.02 255)',
    sealForeground: 'oklch(0.99 0.003 285)',
    darkSeal: 'oklch(0.68 0.16 255)',
    darkSealSoft: 'oklch(0.3 0.06 255)',
    swatch: '#0071E3',
  },
  {
    key: 'indigo',
    label: 'Sumi indigo',
    seal: 'oklch(0.45 0.13 285)',
    sealSoft: 'oklch(0.955 0.018 285)',
    sealForeground: 'oklch(0.99 0.003 285)',
    darkSeal: 'oklch(0.7 0.11 285)',
    darkSealSoft: 'oklch(0.3 0.05 285)',
    swatch: '#4B47C9',
  },
  {
    key: 'green',
    label: 'Pine green',
    seal: 'oklch(0.52 0.11 160)',
    sealSoft: 'oklch(0.96 0.03 160)',
    sealForeground: 'oklch(0.99 0 0)',
    darkSeal: 'oklch(0.68 0.11 160)',
    darkSealSoft: 'oklch(0.3 0.05 160)',
    swatch: '#1E7F5C',
  },
  {
    key: 'amber',
    label: 'Kitsune amber',
    seal: 'oklch(0.62 0.15 65)',
    sealSoft: 'oklch(0.958 0.028 70)',
    // Amber is light enough that white text fails contrast; ink is used instead.
    sealForeground: 'oklch(0.21 0.006 285)',
    darkSeal: 'oklch(0.74 0.14 68)',
    darkSealSoft: 'oklch(0.32 0.06 68)',
    swatch: '#C77C1E',
  },
  {
    key: 'plum',
    label: 'Ume plum',
    seal: 'oklch(0.52 0.17 330)',
    sealSoft: 'oklch(0.955 0.022 330)',
    sealForeground: 'oklch(0.99 0.003 285)',
    darkSeal: 'oklch(0.68 0.15 330)',
    darkSealSoft: 'oklch(0.3 0.06 330)',
    swatch: '#A03A78',
  },
]

export const DEFAULT_ACCENT_KEY = 'green'

export function accentByKey(key: string | null | undefined): Accent {
  return ACCENTS.find((accent) => accent.key === key) ?? ACCENTS[0]
}

/**
 * The CSS custom properties that apply an accent.
 *
 * Applied as an inline style on a wrapper so the choice is per-user without a
 * stylesheet per user. Both themes are set at once: the dark values are scoped
 * under `.dark` by the caller's stylesheet, so only the light pair is emitted
 * here and the dark pair is handled by the theme block.
 */
export function accentStyle(accent: Accent): Record<string, string> {
  return {
    '--seal': accent.seal,
    '--seal-soft': accent.sealSoft,
    '--seal-foreground': accent.sealForeground,
    '--ring': `color-mix(in oklab, ${accent.seal} 45%, transparent)`,
  }
}
