'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import {
  deleteProviderConnection,
  getCatalog,
  listProviderConnections,
  saveProviderConnection,
  setDefaultProvider,
  type CatalogEntry,
} from '@/lib/providers'
import type { ConnectionView, ProviderId } from '@/lib/provider-meta'

/**
 * Provider connection actions.
 *
 * The rule this module never breaks: a key goes in, a mask comes out. Every
 * function here returns ConnectionView, which carries `maskedKey` and nothing
 * else, so there is no path by which a plaintext key reaches the client.
 */

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function getConnections(): Promise<ConnectionView[]> {
  const userId = await getUserId()
  return listProviderConnections(userId)
}

export async function connectProvider(input: {
  provider: string
  apiKey: string
  makeDefault?: boolean
}): Promise<ConnectionView> {
  const userId = await getUserId()
  const view = await saveProviderConnection({
    userId,
    provider: input.provider,
    apiKey: input.apiKey,
    makeDefault: input.makeDefault,
  })

  revalidatePath('/')
  return view
}

export async function makeProviderDefault(provider: string): Promise<void> {
  const userId = await getUserId()
  await setDefaultProvider({ userId, provider })
  revalidatePath('/')
}

export async function disconnectProvider(provider: string): Promise<void> {
  const userId = await getUserId()
  await deleteProviderConnection({ userId, provider })
  revalidatePath('/')
}

/**
 * The catalog the model picker renders.
 *
 * Trimmed to what a picker needs and sorted cheapest first, because the question
 * the user is answering is "what does this cost". The full catalog runs to
 * hundreds of rows, so the payload is reduced rather than shipping the whole
 * table, and models with a context window too small to carry a brief are dropped.
 */
export interface CatalogOption {
  modelId: string
  label: string
  provider: ProviderId
  inputPricePer1m: number
  outputPricePer1m: number
  contextLength: number | null
  isFree: boolean
}

export async function getCatalogOptions(): Promise<CatalogOption[]> {
  const catalog: CatalogEntry[] = await getCatalog()

  return catalog
    .filter((entry) => (entry.contextLength ?? 0) >= 32_000)
    .sort(
      (a, b) =>
        a.inputPricePer1m + a.outputPricePer1m - (b.inputPricePer1m + b.outputPricePer1m),
    )
    .slice(0, 120)
    .map((entry) => ({
      modelId: entry.modelId,
      label: entry.label,
      provider: entry.provider,
      inputPricePer1m: entry.inputPricePer1m,
      outputPricePer1m: entry.outputPricePer1m,
      contextLength: entry.contextLength,
      isFree: entry.isFree,
    }))
}
