import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import { getDefaultProvider, getProviderKey, PROVIDERS, type ProviderId } from '@/lib/providers'

/**
 * Model resolution for Kojiki agents.
 *
 * There is no single global model. Which model runs is decided per task: the
 * department head proposes one, the user authorises it, and this module builds the
 * client for exactly that choice. A department can therefore run its drafting on a
 * cheap model and its evaluation on a strong one, and switch as the work changes.
 *
 * Resolution order for a task:
 *   1. the model the user approved for that task, on the provider it names
 *   2. the user's default provider, when the approved provider has no key
 *   3. the Vercel AI Gateway free tier, when nothing is connected
 *
 * Every fallback is reported rather than silent, because a user who approved a
 * specific model is entitled to know something else ran.
 *
 * The Gateway free tier only serves `-free` suffixed models, so the fallback model
 * is pinned to one; a paid Gateway account can override it via AI_GATEWAY_MODEL.
 */

const GATEWAY_MODEL =
  process.env.AI_GATEWAY_MODEL ?? 'inclusionai/ling-3.0-flash-vl-free'

/** Used when a provider is connected but the task names no particular model. */
const DEFAULT_MODEL_BY_PROVIDER: Record<ProviderId, string> = {
  openrouter: 'anthropic/claude-3.5-haiku',
  anthropic: 'claude-3-5-haiku-latest',
  openai: 'gpt-4o-mini',
}

export interface ResolvedRoute {
  model: LanguageModel
  /** Which provider actually served the call. */
  provider: ProviderId | 'ai-gateway'
  modelId: string
  label: string
  /** Set when something other than the requested model ran. */
  fallbackReason?: string
}

/**
 * Builds a client for a provider using the user's stored key.
 *
 * OpenRouter is OpenAI-compatible, so it goes through the compatible factory.
 * Anthropic and OpenAI use their own SDKs, which handle their differing request
 * shapes; the catalog stores their IDs with a vendor prefix, which the direct APIs
 * do not want, so the prefix is stripped here.
 */
function buildClient(provider: ProviderId, apiKey: string) {
  switch (provider) {
    case 'openrouter':
      return createOpenAICompatible({
        name: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey,
      })
    case 'anthropic':
      return createAnthropic({ apiKey })
    case 'openai':
      return createOpenAI({ apiKey })
  }
}

function stripVendorPrefix(provider: ProviderId, modelId: string): string {
  const prefix = `${provider}/`
  return modelId.startsWith(prefix) ? modelId.slice(prefix.length) : modelId
}

function gatewayRoute(reason?: string): ResolvedRoute {
  return {
    // A plain Gateway model ID string is a valid LanguageModel in AI SDK 7.
    model: GATEWAY_MODEL as unknown as LanguageModel,
    provider: 'ai-gateway',
    modelId: GATEWAY_MODEL,
    label: `AI Gateway · ${GATEWAY_MODEL}`,
    fallbackReason: reason,
  }
}

/**
 * Resolves the model for one task.
 *
 * `approvedModelId` is what the user authorised. When it is absent the caller has
 * no authority to spend on a chosen model, and the Gateway free tier is used —
 * which costs the user nothing and needs no key.
 */
export async function resolveModelForTask(input: {
  userId: string
  approvedProvider?: string | null
  approvedModelId?: string | null
}): Promise<ResolvedRoute> {
  const { userId, approvedProvider, approvedModelId } = input

  if (!approvedModelId) {
    return gatewayRoute('No model was approved for this task, so the free tier ran it.')
  }

  const requested = approvedProvider && isProviderId(approvedProvider)
    ? approvedProvider
    : await getDefaultProvider(userId)

  if (!requested) {
    return gatewayRoute(
      'No provider is connected, so the free tier ran it. Connect a provider in Settings to use the approved model.',
    )
  }

  const key = await getProviderKey(userId, requested)
  if (!key) {
    // The approved provider has no key. Try the default rather than failing, but
    // say so: the user approved a specific route and deserves to know it changed.
    const fallback = await getDefaultProvider(userId)
    const fallbackKey = fallback ? await getProviderKey(userId, fallback) : null

    if (!fallback || !fallbackKey) {
      return gatewayRoute(
        `${PROVIDERS[requested].label} is not connected, so the free tier ran it.`,
      )
    }

    return {
      model: buildClient(fallback, fallbackKey)(
        stripVendorPrefix(fallback, approvedModelId),
      ),
      provider: fallback,
      modelId: approvedModelId,
      label: `${PROVIDERS[fallback].label} · ${approvedModelId}`,
      fallbackReason: `${PROVIDERS[requested].label} has no key, so ${PROVIDERS[fallback].label} served this call.`,
    }
  }

  return {
    model: buildClient(requested, key)(stripVendorPrefix(requested, approvedModelId)),
    provider: requested,
    modelId: approvedModelId,
    label: `${PROVIDERS[requested].label} · ${approvedModelId}`,
  }
}

/**
 * Resolves a model for work that has no per-task approval: the orchestrator, goal
 * decomposition, and chat. These use the user's default provider and its default
 * model, falling back to the free tier when nothing is connected.
 */
export async function resolveModelForUser(
  userId: string,
  preferredModelId?: string | null,
): Promise<ResolvedRoute> {
  const provider = await getDefaultProvider(userId)
  if (!provider) return gatewayRoute()

  const key = await getProviderKey(userId, provider)
  if (!key) return gatewayRoute()

  const modelId =
    preferredModelId ?? DEFAULT_MODEL_BY_PROVIDER[provider]

  return {
    model: buildClient(provider, key)(stripVendorPrefix(provider, modelId)),
    provider,
    modelId,
    label: `${PROVIDERS[provider].label} · ${modelId}`,
  }
}

function isProviderId(value: string): value is ProviderId {
  return value === 'openrouter' || value === 'anthropic' || value === 'openai'
}
