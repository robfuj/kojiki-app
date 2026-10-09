import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import { readFreeFirst } from '@/lib/preferences'
import {
  cheapestCapableModelForProvider,
  getDefaultProvider,
  getProviderKey,
  PROVIDERS,
  type ProviderId,
} from '@/lib/providers'

/**
 * Model resolution for Kojiki agents.
 *
 * There is no single global model, and no model is named in this file. Which model
 * runs is decided per task: the department head proposes one from the live
 * catalog, the user authorises it, and this module builds the client for exactly
 * that choice. A department can therefore run its drafting on a cheap model and
 * its evaluation on a strong one, and switch as the work changes.
 *
 * Every candidate set is derived rather than pinned. A hardcoded model ID rots
 * silently: providers retire models without notice, and a pinned default then
 * fails every call while still looking correct in the source. Deriving from the
 * catalog means a retired model drops out on its own.
 *
 * Resolution order for a task:
 *   1. the model the user approved for that task, on the provider it names
 *   2. the user's default provider, when the approved provider has no key
 *   3. the Vercel AI Gateway, when nothing is connected
 *
 * Every fallback is reported rather than silent, because a user who approved a
 * specific model is entitled to know something else ran.
 */

const GATEWAY_MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models'
const GATEWAY_CATALOG_TTL_MS = 60 * 60 * 1000

/**
 * Used only when discovery fails and no override is set.
 *
 * A constant of last resort, not a preference. The Gateway's free lineup changes
 * without notice, so this is deliberately the only model ID in the file and it is
 * reached only when the live catalog could not be read at all.
 */
const GATEWAY_LAST_RESORT_MODEL = 'poolside/laguna-s-2.1-free'

let gatewayCatalogCache: { at: number; ids: string[] } | null = null

/**
 * The Gateway's current model IDs.
 *
 * Cached in-module and upstream, because this is consulted on every call that
 * falls back to the Gateway and the lineup changes at most daily. A failure is not
 * fatal: a stale list beats no list, and an empty list falls through to the
 * last-resort constant.
 */
async function gatewayModelIds(): Promise<string[]> {
  const cached = gatewayCatalogCache
  if (cached && Date.now() - cached.at < GATEWAY_CATALOG_TTL_MS) return cached.ids

  try {
    const response = await fetch(GATEWAY_MODELS_URL, { next: { revalidate: 3600 } })
    if (!response.ok) return cached?.ids ?? []

    const payload = (await response.json()) as { data?: { id?: string; type?: string }[] }
    // The catalog also lists embedding, image and "decision" models; calling one of
    // those through generateText fails, so only language models are candidates.
    const ids = (payload.data ?? [])
      .filter((model) => model.type === undefined || model.type === 'language')
      .map((model) => model.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)

    gatewayCatalogCache = { at: Date.now(), ids }
    return ids
  } catch {
    return cached?.ids ?? []
  }
}

/**
 * Which Gateway model to use, discovered rather than pinned.
 *
 * The free tier only serves `-free` suffixed models, so those are what a
 * zero-configuration run must use. A paid account can override via
 * AI_GATEWAY_MODEL — and the override wins even when the free catalog does not
 * list it, since a paid model legitimately is not in the free set.
 *
 * The one case where the override loses is when discovery succeeded and the
 * override is absent from the catalog entirely. That means the ID has rotted, and
 * honouring it would fail every call; a model that exists runs instead, with the
 * substitution reported.
 */
async function chooseGatewayModel(): Promise<{ modelId: string; reason?: string }> {
  const override = process.env.AI_GATEWAY_MODEL?.trim()
  const ids = await gatewayModelIds()

  if (override && (ids.length === 0 || ids.includes(override))) {
    return { modelId: override }
  }

  const free = ids.filter((id) => id.endsWith('-free'))
  if (free.length > 0) {
    return {
      modelId: free[0],
      reason: override
        ? `AI_GATEWAY_MODEL (${override}) is not in the Gateway catalog, so ${free[0]} ran instead.`
        : undefined,
    }
  }

  if (override) return { modelId: override }
  return { modelId: GATEWAY_LAST_RESORT_MODEL }
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
 *
 * This switch is provider plumbing, not model selection: adding a provider is a
 * code change either way, because each needs its own client factory. What must
 * stay derived is which *model* runs, and that is never named here.
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

async function gatewayRoute(reason?: string): Promise<ResolvedRoute> {
  const choice = await chooseGatewayModel()
  const combined = [reason, choice.reason].filter(Boolean).join(' ')

  return {
    // A plain Gateway model ID string is a valid LanguageModel in AI SDK 7.
    model: choice.modelId as unknown as LanguageModel,
    provider: 'ai-gateway',
    modelId: choice.modelId,
    label: `AI Gateway · ${choice.modelId}`,
    fallbackReason: combined || undefined,
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
 * decomposition, and chat.
 *
 * The default is the cheapest model the catalog says the user's default provider
 * can serve — not a model named in source. When the catalog lists nothing for that
 * provider, the Gateway runs the work rather than a guessed ID failing at call
 * time.
 */
export async function resolveModelForUser(
  userId: string,
  preferredModelId?: string | null,
): Promise<ResolvedRoute> {
  const provider = await getDefaultProvider(userId)
  if (!provider) return gatewayRoute()

  const key = await getProviderKey(userId, provider)
  if (!key) return gatewayRoute()

  // The user's free-first preference decides the default model. An explicitly
  // preferred model still wins: a caller that names a model has already made the
  // choice this preference exists to make on their behalf.
  const freeFirst = await readFreeFirst(userId)
  const modelId =
    preferredModelId ??
    (await cheapestCapableModelForProvider(provider, { freeFirst }))
  if (!modelId) {
    return gatewayRoute(
      `The catalog lists no model ${PROVIDERS[provider].label} can serve, so the free tier ran it.`,
    )
  }

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
