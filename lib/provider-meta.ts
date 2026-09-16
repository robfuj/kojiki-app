/**
 * Provider metadata, kept separate from the provider layer itself.
 *
 * `lib/providers.ts` talks to the database and to the secret cipher, so a client
 * component cannot import it without dragging both into the browser bundle.
 * Everything the UI needs to *describe* a provider lives here instead: labels, key
 * shapes, docs links. The connection panel imports this module and never the one
 * beside it.
 *
 * The Vercel AI Gateway is deliberately absent. It is not a provider the user
 * connects — it needs no key and is always available — so it is the fallback the
 * resolver drops to when nothing here is connected, not a fourth option in a list.
 */

export type ProviderId = 'openrouter' | 'anthropic' | 'openai'

export const PROVIDER_IDS: readonly ProviderId[] = ['openrouter', 'anthropic', 'openai']

export interface ProviderConfig {
  label: string
  /** What the key looks like, so a pasted value can be sanity-checked. */
  keyPrefix: string
  keyDocsUrl: string
  blurb: string
}

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openrouter: {
    label: 'OpenRouter',
    keyPrefix: 'sk-or-',
    keyDocsUrl: 'https://openrouter.ai/settings/keys',
    blurb:
      'One key reaches hundreds of models across providers, including a free tier. The cheapest way to experiment.',
  },
  anthropic: {
    label: 'Anthropic',
    keyPrefix: 'sk-ant-',
    keyDocsUrl: 'https://console.anthropic.com/settings/keys',
    blurb: 'Direct to Claude. Use this when you already hold Anthropic credits.',
  },
  openai: {
    label: 'OpenAI',
    keyPrefix: 'sk-',
    keyDocsUrl: 'https://platform.openai.com/api-keys',
    blurb: 'Direct to GPT. Use this when you already hold OpenAI credits.',
  },
}

/**
 * The connection as the client may see it: no key, only a mask.
 *
 * There is no key field of any kind, so "the client cannot see the key" is a
 * property of the type rather than a convention someone has to remember to follow.
 */
export interface ConnectionView {
  provider: ProviderId
  label: string
  maskedKey: string
  isDefault: boolean
  lastVerifiedAt: Date | null
  lastError: string | null
}
