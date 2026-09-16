import { db } from '@/lib/db'
import { modelCatalog, providerConnections } from '@/lib/db/schema'
import {
  PROVIDERS,
  PROVIDER_IDS,
  type ConnectionView,
  type ProviderId,
} from '@/lib/provider-meta'
import { decryptSecret, encryptSecret, maskSecret } from '@/lib/secrets'
import { and, asc, eq } from 'drizzle-orm'

// Re-exported so server-side consumers keep one import path. Client components
// import `@/lib/provider-meta` directly: this module pulls in the database client
// and the secret cipher, neither of which can be bundled for the browser.
export {
  PROVIDERS,
  PROVIDER_IDS,
  type ConnectionView,
  type ProviderConfig,
  type ProviderId,
} from '@/lib/provider-meta'

/**
 * Provider connections and the model catalog.
 *
 * Two ideas drive this module.
 *
 * First, a key is spendable money, so it is encrypted at rest, decrypted only at
 * the moment a model call is built, and never returned to the client except as a
 * last-four mask.
 *
 * Second, the catalog is a cache, not a source of truth. Model IDs and prices
 * drift constantly, so the provider's own API is authoritative and this table
 * records when it was last refreshed. OpenRouter's catalog endpoint is public and
 * keyless and already carries per-token prices for Anthropic and OpenAI models
 * too, which makes it the single pricing reference for all three providers
 * rather than maintaining three price tables that would each go stale.
 */

export interface CatalogEntry {
  id: string
  provider: ProviderId
  modelId: string
  label: string
  contextLength: number | null
  inputPricePer1m: number
  outputPricePer1m: number
  modality: string | null
  isFree: boolean
}

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'

/** How long a cached catalog is trusted before it is refetched. */
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000

function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

export async function saveProviderConnection(input: {
  userId: string
  provider: string
  apiKey: string
  makeDefault?: boolean
}): Promise<ConnectionView> {
  if (!isProviderId(input.provider)) {
    throw new Error(`Unknown provider: ${input.provider}`)
  }

  const key = input.apiKey.trim()
  if (key.length < 8) {
    throw new Error('That does not look like a complete API key')
  }

  const expected = PROVIDERS[input.provider].keyPrefix
  if (expected && !key.startsWith(expected)) {
    throw new Error(
      `A ${PROVIDERS[input.provider].label} key normally starts with "${expected}". Check you pasted the right one.`,
    )
  }

  const encrypted = encryptSecret(key)
  const now = new Date()

  // One row per provider per user: reconnecting replaces the key rather than
  // leaving two candidates for the resolver to choose between.
  const [row] = await db
    .insert(providerConnections)
    .values({
      id: crypto.randomUUID(),
      userId: input.userId,
      provider: input.provider,
      encryptedKey: encrypted,
      isDefault: input.makeDefault ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [providerConnections.userId, providerConnections.provider],
      set: { encryptedKey: encrypted, isDefault: input.makeDefault ?? false, lastError: null, updatedAt: now },
    })
    .returning()

  if (row.isDefault) {
    await clearOtherDefaults(input.userId, input.provider)
  } else if (!(await hasDefault(input.userId))) {
    // The first connection always becomes the default, so routing has somewhere
    // to go without the user having to make a second choice.
    await db
      .update(providerConnections)
      .set({ isDefault: true })
      .where(
        and(
          eq(providerConnections.userId, input.userId),
          eq(providerConnections.provider, input.provider),
        ),
      )
    row.isDefault = true
  }

  return toView(row)
}

export async function setDefaultProvider(input: {
  userId: string
  provider: string
}): Promise<void> {
  if (!isProviderId(input.provider)) {
    throw new Error(`Unknown provider: ${input.provider}`)
  }

  await db
    .update(providerConnections)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(
      and(
        eq(providerConnections.userId, input.userId),
        eq(providerConnections.provider, input.provider),
      ),
    )

  await clearOtherDefaults(input.userId, input.provider)
}

async function clearOtherDefaults(userId: string, keepProvider: string) {
  const all = await db
    .select({ provider: providerConnections.provider })
    .from(providerConnections)
    .where(eq(providerConnections.userId, userId))

  for (const row of all) {
    if (row.provider === keepProvider) continue
    await db
      .update(providerConnections)
      .set({ isDefault: false })
      .where(
        and(
          eq(providerConnections.userId, userId),
          eq(providerConnections.provider, row.provider),
        ),
      )
  }
}

async function hasDefault(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: providerConnections.id })
    .from(providerConnections)
    .where(and(eq(providerConnections.userId, userId), eq(providerConnections.isDefault, true)))
    .limit(1)
  return rows.length > 0
}

export async function listProviderConnections(userId: string): Promise<ConnectionView[]> {
  const rows = await db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.userId, userId))
    .orderBy(asc(providerConnections.createdAt))

  return rows.map((row) => ({
    provider: row.provider as ProviderId,
    label: PROVIDERS[row.provider as ProviderId]?.label ?? row.provider,
    // The plaintext key is decrypted only to mask it; the full value never leaves.
    maskedKey: maskSecret(safeDecrypt(row.encryptedKey)),
    isDefault: row.isDefault,
    lastVerifiedAt: row.lastVerifiedAt,
    lastError: row.lastError,
  }))
}

function safeDecrypt(payload: string): string {
  try {
    return decryptSecret(payload)
  } catch {
    // A key sealed under a previous BETTER_AUTH_SECRET cannot be opened. Treat it
    // as absent rather than crashing the settings screen.
    return 'unreadable'
  }
}

export async function deleteProviderConnection(input: {
  userId: string
  provider: string
}): Promise<void> {
  await db
    .delete(providerConnections)
    .where(
      and(
        eq(providerConnections.userId, input.userId),
        eq(providerConnections.provider, input.provider),
      ),
    )

  // Promote a survivor so routing is never left without a default.
  if (!(await hasDefault(input.userId))) {
    const [next] = await db
      .select({ provider: providerConnections.provider })
      .from(providerConnections)
      .where(eq(providerConnections.userId, input.userId))
      .limit(1)
    if (next) {
      await db
        .update(providerConnections)
        .set({ isDefault: true })
        .where(
          and(
            eq(providerConnections.userId, input.userId),
            eq(providerConnections.provider, next.provider),
          ),
        )
    }
  }
}

/**
 * The decrypted key for a provider, or null when not connected.
 *
 * Server-only. Callers must never serialise the result.
 */
export async function getProviderKey(
  userId: string,
  provider: ProviderId,
): Promise<string | null> {
  const [row] = await db
    .select({ encryptedKey: providerConnections.encryptedKey })
    .from(providerConnections)
    .where(
      and(
        eq(providerConnections.userId, userId),
        eq(providerConnections.provider, provider),
      ),
    )
    .limit(1)

  if (!row) return null

  try {
    return decryptSecret(row.encryptedKey)
  } catch {
    return null
  }
}

/** The user's default provider, or null when nothing is connected. */
export async function getDefaultProvider(userId: string): Promise<ProviderId | null> {
  const [row] = await db
    .select({ provider: providerConnections.provider })
    .from(providerConnections)
    .where(and(eq(providerConnections.userId, userId), eq(providerConnections.isDefault, true)))
    .limit(1)

  if (row && isProviderId(row.provider)) return row.provider

  const [any] = await db
    .select({ provider: providerConnections.provider })
    .from(providerConnections)
    .where(eq(providerConnections.userId, userId))
    .limit(1)

  return any && isProviderId(any.provider) ? any.provider : null
}

export async function recordProviderResult(input: {
  userId: string
  provider: ProviderId
  error?: string | null
}): Promise<void> {
  await db
    .update(providerConnections)
    .set({
      lastVerifiedAt: input.error ? undefined : new Date(),
      lastError: input.error ?? null,
    })
    .where(
      and(
        eq(providerConnections.userId, input.userId),
        eq(providerConnections.provider, input.provider),
      ),
    )
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

interface OpenRouterModel {
  id: string
  name?: string
  context_length?: number
  pricing?: { prompt?: string; completion?: string }
  architecture?: { modality?: string }
}

/**
 * Refreshes the catalog from OpenRouter's public endpoint.
 *
 * Keyless, so it works before the user connects anything and gives the UI real
 * prices to show. Router pseudo-models such as `openrouter/auto` publish a
 * sentinel price of -1e6 rather than a real one, so anything with a negative
 * price is dropped: including it would make estimates meaningless.
 */
export async function refreshCatalog(): Promise<number> {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    // The catalog changes daily at most; an hour of upstream caching is safe and
    // keeps repeated page loads from hammering the endpoint.
    next: { revalidate: 3600 },
  })

  if (!response.ok) {
    throw new Error(`Model catalog fetch failed: ${response.status}`)
  }

  const payload = (await response.json()) as { data?: OpenRouterModel[] }
  const models = payload.data ?? []

  const fetchedAt = new Date()
  let written = 0

  for (const model of models) {
    const inputPrice = Number(model.pricing?.prompt ?? 0) * 1_000_000
    const outputPrice = Number(model.pricing?.completion ?? 0) * 1_000_000

    if (!Number.isFinite(inputPrice) || !Number.isFinite(outputPrice)) continue
    if (inputPrice < 0 || outputPrice < 0) continue

    const entry = {
      id: `openrouter:${model.id}`,
      provider: 'openrouter' as const,
      modelId: model.id,
      label: model.name ?? model.id,
      contextLength: model.context_length ?? null,
      inputPricePer1m: inputPrice,
      outputPricePer1m: outputPrice,
      modality: model.architecture?.modality ?? null,
      isFree: inputPrice === 0 && outputPrice === 0,
      fetchedAt,
    }

    await db
      .insert(modelCatalog)
      .values(entry)
      .onConflictDoUpdate({ target: modelCatalog.id, set: entry })

    written += 1
  }

  return written
}

/**
 * Which direct provider could serve a given OpenRouter model ID.
 *
 * OpenRouter namespaces IDs as `vendor/model`, and for Anthropic and OpenAI that
 * vendor segment is exactly the model ID the direct API expects. So a model the
 * head proposes through OpenRouter can also be routed direct when the user holds
 * that provider's key; the resolver strips the prefix when it does.
 */
export function vendorOfModelId(modelId: string): ProviderId | null {
  if (modelId.startsWith('anthropic/')) return 'anthropic'
  if (modelId.startsWith('openai/')) return 'openai'
  return null
}

/**
 * The shortlist a department head chooses from.
 *
 * The full catalog is hundreds of models: too many to put in a prompt and too many
 * to reason over. This picks a spread across price tiers so the head's choice is a
 * real trade-off between cost and capability rather than a pick from an
 * undifferentiated list. Preferred IDs drift out of the catalog over time, so a
 * price-sorted spread fills any gaps.
 */
const SHORTLIST_PREFERENCES: readonly string[] = [
  'meta-llama/llama-3.3-70b-instruct',
  'deepseek/deepseek-chat-v3.1',
  'google/gemini-2.5-flash',
  'anthropic/claude-3.5-haiku',
  'anthropic/claude-sonnet-4.5',
]

const SHORTLIST_SIZE = 6

export async function shortlistModels(): Promise<CatalogEntry[]> {
  const catalog = await getCatalog()
  if (catalog.length === 0) return []

  const chosen: CatalogEntry[] = []
  for (const modelId of SHORTLIST_PREFERENCES) {
    const entry = catalog.find((candidate) => candidate.modelId === modelId)
    if (entry) chosen.push(entry)
  }

  if (chosen.length >= SHORTLIST_SIZE - 1) return chosen.slice(0, SHORTLIST_SIZE)

  // Fill from the cheapest usable models, skipping anything already chosen. A
  // model with a tiny context window cannot carry these prompts, so it is not a
  // candidate however cheap it is.
  const fillers = catalog
    .filter(
      (candidate) =>
        !chosen.some((entry) => entry.id === candidate.id) &&
        (candidate.contextLength ?? 0) >= 32_000,
    )
    .sort(
      (a, b) =>
        a.inputPricePer1m + a.outputPricePer1m - (b.inputPricePer1m + b.outputPricePer1m),
    )

  return [...chosen, ...fillers].slice(0, SHORTLIST_SIZE)
}

/**
 * The catalog the user can choose from.
 *
 * Refreshes when the cache is stale. A refresh failure is not fatal: a slightly
 * old catalog with real prices beats no catalog, so the cached rows are returned
 * and the error is swallowed.
 */
export async function getCatalog(): Promise<CatalogEntry[]> {
  const [newest] = await db
    .select({ fetchedAt: modelCatalog.fetchedAt })
    .from(modelCatalog)
    .orderBy(asc(modelCatalog.fetchedAt))
    .limit(1)

  const stale =
    !newest || Date.now() - newest.fetchedAt.getTime() > CATALOG_TTL_MS

  if (stale) {
    try {
      await refreshCatalog()
    } catch (error) {
      console.log('[v0] catalog refresh failed, using cache:', (error as Error).message)
    }
  }

  const rows = await db.select().from(modelCatalog)

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider as ProviderId,
    modelId: row.modelId,
    label: row.label,
    contextLength: row.contextLength,
    inputPricePer1m: row.inputPricePer1m,
    outputPricePer1m: row.outputPricePer1m,
    modality: row.modality,
    isFree: row.isFree,
  }))
}

/** Looks up one catalog entry by its OpenRouter model ID. */
export async function findCatalogEntry(
  modelId: string,
): Promise<CatalogEntry | null> {
  const [row] = await db
    .select()
    .from(modelCatalog)
    .where(eq(modelCatalog.id, `openrouter:${modelId}`))
    .limit(1)

  if (!row) return null

  return {
    id: row.id,
    provider: row.provider as ProviderId,
    modelId: row.modelId,
    label: row.label,
    contextLength: row.contextLength,
    inputPricePer1m: row.inputPricePer1m,
    outputPricePer1m: row.outputPricePer1m,
    modality: row.modality,
    isFree: row.isFree,
  }
}

function toView(row: typeof providerConnections.$inferSelect): ConnectionView {
  return {
    provider: row.provider as ProviderId,
    label: PROVIDERS[row.provider as ProviderId]?.label ?? row.provider,
    maskedKey: maskSecret(safeDecrypt(row.encryptedKey)),
    isDefault: row.isDefault,
    lastVerifiedAt: row.lastVerifiedAt,
    lastError: row.lastError,
  }
}
