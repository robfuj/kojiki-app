import type { ProviderId } from '@/lib/provider-meta'

/**
 * The integrations catalog: what the agents can reach.
 *
 * Three kinds, deliberately distinct in the UI:
 *   - provider: needs the user's own key, stored encrypted per user
 *   - builtin:  always available, zero configuration (the Vercel AI Gateway)
 *   - seam:     reserved for a connector that does not exist yet. Shown as
 *               unavailable rather than hidden, so the shape of the product is
 *               visible without pretending the wire is live.
 *
 * Names and blurbs live in the dictionaries; this file is only identity, kind,
 * and the brand mark. Marks come from theSVG.org — review each brand's trademark
 * policy before commercial use.
 */

export const INTEGRATION_CATEGORIES = [
  'model-providers',
  'built-in',
  'file-sources',
] as const

export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number]

export interface IntegrationDef {
  id: string
  category: IntegrationCategory
  kind: 'provider' | 'builtin' | 'seam'
  /** Set for kind='provider'; the connection state keys off it. */
  providerId?: ProviderId
  logoUrl: string
  docsUrl?: string
  /** Surfaces in the Recommended group ahead of its category. */
  recommended?: boolean
}

const LOGO_BASE = 'https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons'

export const INTEGRATIONS: IntegrationDef[] = [
  {
    id: 'openrouter',
    category: 'model-providers',
    kind: 'provider',
    providerId: 'openrouter',
    logoUrl: `${LOGO_BASE}/openrouter/dark.svg`,
    docsUrl: 'https://openrouter.ai/settings/keys',
    recommended: true,
  },
  {
    id: 'ai-gateway',
    category: 'built-in',
    kind: 'builtin',
    logoUrl: `${LOGO_BASE}/vercel/dark.svg`,
    recommended: true,
  },
  {
    id: 'anthropic',
    category: 'model-providers',
    kind: 'provider',
    providerId: 'anthropic',
    logoUrl: `${LOGO_BASE}/anthropic/dark.svg`,
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    category: 'model-providers',
    kind: 'provider',
    providerId: 'openai',
    logoUrl: `${LOGO_BASE}/openai/dark.svg`,
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'google-drive',
    category: 'file-sources',
    kind: 'seam',
    logoUrl: `${LOGO_BASE}/google-drive/default.svg`,
  },
]
