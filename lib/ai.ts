import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

/**
 * Model resolution for Kojiki department bots.
 *
 * The ontology's specialist configs declare `provider: "openrouter"`. When
 * OPENROUTER_API_KEY is present we honour that and route through OpenRouter,
 * using the model each specialist declares. Otherwise we fall back to the
 * Vercel AI Gateway, which needs no key in v0 previews or Vercel deployments.
 */

const GATEWAY_MODEL = 'anthropic/claude-sonnet-5'

/** Model the ontology configs declare; overridable via OPENROUTER_MODEL. */
const OPENROUTER_DEFAULT_MODEL = 'anthropic/claude-3.5-haiku'

const openrouter = process.env.OPENROUTER_API_KEY
  ? createOpenAICompatible({
      name: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    })
  : null

export type ResolvedModel = string | ReturnType<NonNullable<typeof openrouter>>

export function isOpenRouterActive(): boolean {
  return openrouter !== null
}

export function resolveModel(): ResolvedModel {
  if (openrouter) {
    return openrouter(process.env.OPENROUTER_MODEL ?? OPENROUTER_DEFAULT_MODEL)
  }
  return GATEWAY_MODEL
}

export function activeProviderLabel(): string {
  return openrouter
    ? `openrouter · ${process.env.OPENROUTER_MODEL ?? OPENROUTER_DEFAULT_MODEL}`
    : `ai-gateway · ${GATEWAY_MODEL}`
}
