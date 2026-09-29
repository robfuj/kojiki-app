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
 * OpenRouter namespaces IDs as `vendor/model`, and for a provider we connect
 * directly that vendor segment is exactly the model ID its own API expects. So a
 * model the head proposes through OpenRouter can also be routed direct when the
 * user holds that provider's key; the resolver strips the prefix when it does.
 *
 * Derived from the provider list rather than a set of literal prefixes, so
 * supporting a fourth direct provider needs no edit here. OpenRouter is excluded
 * because it is the router, not a vendor a model ID can name.
 */
export function vendorOfModelId(modelId: string): ProviderId | null {
  const [vendor] = modelId.split('/')
  return PROVIDER_IDS.find((id) => id === vendor && id !== 'openrouter') ?? null
}

// ---------------------------------------------------------------------------
// Capability filtering
// ---------------------------------------------------------------------------

/**
 * Which models can actually carry this system's work.
 *
 * Derived from the live catalog rather than a named list, so the answer tracks the
 * market instead of a snapshot of it taken when the code was written. Four
 * constraints, none of which names a vendor:
 *   - output must be text; a handful of catalog entries generate images instead
 *   - context must hold these prompts, which carry ontology text and history
 *   - the ID must be a real model, not a router pseudo-model that delegates the
 *     choice and publishes a sentinel price rather than a real one
 *   - the ID must denote a fixed model, not a rolling alias
 */
const MIN_CONTEXT_LENGTH = 32_000

function isCapable(entry: CatalogEntry): boolean {
  const modality = entry.modality ?? 'text->text'
  if (!modality.endsWith('->text')) return false
  if ((entry.contextLength ?? 0) < MIN_CONTEXT_LENGTH) return false
  if (entry.modelId.startsWith('openrouter/') || entry.modelId.endsWith('/auto')) return false
  // OpenRouter marks rolling aliases with a leading `~`: the ID resolves to
  // whichever model the vendor currently ships as "latest". That breaks the
  // invariant this system is built on — the user approves a specific model and
  // that model runs. An alias approved today can be a different model next month
  // with nobody re-approving it, so it is not a candidate however well priced.
  if (entry.modelId.startsWith('~')) return false
  return true
}

function totalPrice(entry: CatalogEntry): number {
  return entry.inputPricePer1m + entry.outputPricePer1m
}

function byTotalPrice(a: CatalogEntry, b: CatalogEntry): number {
  return totalPrice(a) - totalPrice(b)
}

/** The vendor segment of a catalog ID, which is what a direct provider serves. */
function vendorOf(entry: CatalogEntry): string {
  const [vendor] = entry.modelId.split('/')
  return vendor || entry.modelId
}

/**
 * The cheapest model a given provider can serve, derived from the catalog.
 *
 * This replaces a hardcoded default model per provider. OpenRouter's catalog is
 * the whole market, so every capable entry is a candidate for it; a direct
 * provider can only serve its own vendor's models, so candidates are filtered to
 * that vendor segment.
 *
 * Returns null when the catalog lists nothing for that provider, which tells the
 * resolver to fall back to the Gateway rather than guess a model name that would
 * fail at call time.
 */
export async function cheapestCapableModelForProvider(
  provider: ProviderId,
): Promise<string | null> {
  const capable = (await getCatalog()).filter(isCapable)
  const candidates =
    provider === 'openrouter'
      ? capable
      : capable.filter((entry) => vendorOf(entry) === provider)

  if (candidates.length === 0) return null
  return [...candidates].sort(byTotalPrice)[0].modelId
}

/**
 * The shortlist a department head chooses from.
 *
 * The full catalog is hundreds of models: too many to put in a prompt and too many
 * to reason over. This picks a spread across price tiers so the head's choice is a
 * real trade-off between cost and capability rather than a pick from an
 * undifferentiated list.
 *
 * Nothing here names a model or a vendor. The list is a function of what the
 * catalog contains today, so a model that leaves the catalog drops out of the
 * shortlist on its own instead of leaving a dead ID in a prompt.
 */
const SHORTLIST_SIZE = 6

/**
 * At most this many models from one vendor.
 *
 * Without a cap, a price spread can land entirely inside one vendor's lineup —
 * which would pin the system to that vendor by accident, the very thing deriving
 * the list was meant to prevent. No vendor is named here; the cap applies to
 * whichever vendors the catalog happens to contain.
 */
const MAX_PER_VENDOR = 2

/**
 * The shortlist's price ceiling, as a percentile of the capable market.
 *
 * The market's price tail is extreme: a handful of specialty models cost orders of
 * magnitude more than everything else. Spreading across the full range puts the
 * top rung on the single dearest model in existence, which no user will approve
 * and which therefore wastes a slot better spent on a frontier model someone
 * might actually authorise.
 *
 * Expressed as a percentile rather than a dollar figure so the ceiling stays
 * derived: it moves when the market moves, and names neither a vendor nor a price.
 */
const PRICE_CEILING_PERCENTILE = 0.95

export async function shortlistModels(): Promise<CatalogEntry[]> {
  const capable = (await getCatalog()).filter(isCapable).sort(byTotalPrice)
  if (capable.length === 0) return []
  if (capable.length <= SHORTLIST_SIZE) return capable

  const ceilingIndex = Math.min(
    capable.length - 1,
    Math.floor(capable.length * PRICE_CEILING_PERCENTILE),
  )
  const ceiling = totalPrice(capable[ceilingIndex])
  const usable = capable.filter((entry) => totalPrice(entry) <= ceiling)

  // Evenly spaced indices across the usable range: the cheapest, the dearest that
  // is still plausible, and a ladder between them. Spacing by index rather than by
  // price follows the market's own density, so rungs land where models actually
  // cluster instead of in empty price bands.
  const step = (usable.length - 1) / (SHORTLIST_SIZE - 1)
  const picked: CatalogEntry[] = []
  const perVendor = new Map<string, number>()

  for (let i = 0; i < SHORTLIST_SIZE; i++) {
    const entry = usable[Math.round(i * step)]
    if (picked.some((chosen) => chosen.id === entry.id)) continue
    const vendor = vendorOf(entry)
    if ((perVendor.get(vendor) ?? 0) >= MAX_PER_VENDOR) continue
    picked.push(entry)
    perVendor.set(vendor, (perVendor.get(vendor) ?? 0) + 1)
  }

  // The vendor cap can leave gaps. Fill from the cheapest not yet chosen,
  // relaxing the cap rather than handing the head a short list.
  for (const entry of usable) {
    if (picked.length >= SHORTLIST_SIZE) break
    if (picked.some((chosen) => chosen.id === entry.id)) continue
    picked.push(entry)
  }

  return picked.sort(byTotalPrice)
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
