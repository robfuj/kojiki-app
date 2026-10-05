'use client'

import {
  connectProvider,
  disconnectProvider,
  getConnections,
  makeProviderDefault,
} from '@/app/actions/providers'
import { FreeFirstToggle } from '@/components/settings/free-first-toggle'
import { useLocale } from '@/components/i18n/locale-provider'
import { format } from '@/lib/i18n'
import {
  INTEGRATIONS,
  INTEGRATION_CATEGORIES,
  type IntegrationCategory,
  type IntegrationDef,
} from '@/lib/integrations'
import { PROVIDERS, type ConnectionView, type ProviderId } from '@/lib/provider-meta'
import { cn } from '@/lib/utils'
import { Check, ExternalLink, KeyRound, Loader2, Search } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'

/**
 * The integrations catalog: a filter rail, a search field, and a card grid
 * grouped by category, with connection state per card.
 *
 * Connection state is per user, read from the same store the provider panel
 * uses, so what this catalog shows as "Connected" is exactly what model
 * resolution will use. A card expands in place to connect or manage; nothing
 * navigates away, because settings interrupt the work rather than replacing it.
 */

type Filter = 'all' | 'connected' | IntegrationCategory

export function IntegrationsCatalog({ freeFirst }: { freeFirst: boolean }) {
  const { t } = useLocale()
  const ti = t.integrations
  const { data, mutate } = useSWR('provider-connections', getConnections, {
    revalidateOnFocus: false,
  })
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const connections: ConnectionView[] = data ?? []
  const connectedProviders = new Set(connections.map((entry) => entry.provider))

  function isConnected(def: IntegrationDef): boolean {
    if (def.kind === 'builtin') return true
    if (def.kind === 'provider' && def.providerId) {
      return connectedProviders.has(def.providerId)
    }
    return false
  }

  const visible = INTEGRATIONS.filter((def) => {
    if (filter === 'connected' && !isConnected(def)) return false
    if (filter !== 'all' && filter !== 'connected' && def.category !== filter) {
      return false
    }
    if (query.trim()) {
      const name = ti.items[def.id as keyof typeof ti.items].name.toLowerCase()
      if (!name.includes(query.trim().toLowerCase())) return false
    }
    return true
  })

  // Recommended first, then categories; an item appears once, in the recommended
  // group when it is recommended and in its category otherwise.
  const groups = [
    { key: 'recommended', label: ti.recommended, items: visible.filter((def) => def.recommended) },
    ...INTEGRATION_CATEGORIES.map((category) => ({
      key: category,
      label: ti.categories[category],
      items: visible.filter((def) => def.category === category && !def.recommended),
    })),
  ].filter((group) => group.items.length > 0)

  const connectedCount = INTEGRATIONS.filter(isConnected).length

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
      <nav aria-label={ti.title} className="flex shrink-0 gap-1.5 overflow-x-auto sm:w-44 sm:flex-col sm:overflow-visible">
        <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
          {ti.filterAll}
        </FilterButton>
        <FilterButton active={filter === 'connected'} onClick={() => setFilter('connected')}>
          {ti.filterConnected}
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {connectedCount}
          </span>
        </FilterButton>

        <span aria-hidden="true" className="mx-1 my-1 hidden border-t border-border sm:block" />

        {INTEGRATION_CATEGORIES.map((category) => (
          <FilterButton
            key={category}
            active={filter === category}
            onClick={() => setFilter(category)}
          >
            {ti.categories[category]}
          </FilterButton>
        ))}
      </nav>

      <div className="@container min-w-0 flex-1">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={ti.searchPlaceholder}
            aria-label={ti.searchAria}
            className="w-full rounded-full border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-2 focus:ring-ring/25"
          />
        </div>

        <div className="mt-5 space-y-6">
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground">{ti.empty}</p>
          )}

          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h4 className="text-xs font-semibold text-muted-foreground">
                {group.label}
              </h4>

              <div className="mt-2.5 grid gap-2.5 @xl:grid-cols-2">
                {group.items.map((def) => (
                  <IntegrationCard
                    key={def.id}
                    def={def}
                    connected={isConnected(def)}
                    connection={
                      def.providerId
                        ? (connections.find((entry) => entry.provider === def.providerId) ?? null)
                        : null
                    }
                    expanded={expanded === def.id}
                    onExpand={() => setExpanded(expanded === def.id ? null : def.id)}
                    makeDefault={connections.length === 0}
                    onMutate={() => mutate()}
                    freeFirst={freeFirst}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors sm:w-full sm:rounded-lg',
        active
          ? 'bg-sumi font-medium text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function IntegrationCard({
  def,
  connected,
  connection,
  expanded,
  onExpand,
  makeDefault,
  onMutate,
  freeFirst,
}: {
  def: IntegrationDef
  connected: boolean
  connection: ConnectionView | null
  expanded: boolean
  onExpand: () => void
  makeDefault: boolean
  onMutate: () => void
  freeFirst: boolean
}) {
  const { t } = useLocale()
  const ti = t.integrations
  const item = ti.items[def.id as keyof typeof ti.items]

  return (
    <article
      className={cn(
        'rounded-xl border bg-card p-4 transition-colors',
        expanded ? 'border-sumi/40 shadow-soft' : 'border-border',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background p-1.5">
          <img src={def.logoUrl} alt="" className="size-full object-contain" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-foreground">
            {item.name}
            {connected && def.kind !== 'seam' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-seal-soft px-2 py-0.5 text-[11px] font-medium text-seal">
                <Check className="size-3" aria-hidden="true" />
                {ti.connected}
              </span>
            )}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.blurb}</p>
        </div>

        {def.kind === 'provider' && (
          <button
            type="button"
            onClick={onExpand}
            aria-expanded={expanded}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              connected
                ? 'border border-border bg-background text-muted-foreground hover:border-sumi hover:text-foreground'
                : 'bg-sumi text-primary-foreground hover:opacity-90',
            )}
          >
            {expanded ? ti.close : connected ? ti.manage : ti.connect}
          </button>
        )}

        {def.kind === 'builtin' && (
          <span className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {ti.categories['built-in']}
          </span>
        )}

        {def.kind === 'seam' && (
          <span className="shrink-0 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground">
            {ti.seamNote}
          </span>
        )}
      </div>

      {def.kind === 'builtin' && (
        <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          {ti.builtInNote}
        </p>
      )}

      {expanded && def.kind === 'provider' && def.providerId && (
        <div className="mt-4 border-t border-border pt-4">
          {connected && connection ? (
            <ConnectedDetails
              providerId={def.providerId}
              connection={connection}
              onMutate={onMutate}
              freeFirst={freeFirst}
            />
          ) : (
            <ConnectForm
              providerId={def.providerId}
              makeDefault={makeDefault}
              onConnected={onMutate}
            />
          )}
        </div>
      )}
    </article>
  )
}

function ConnectedDetails({
  providerId,
  connection,
  onMutate,
  freeFirst,
}: {
  providerId: ProviderId
  connection: ConnectionView
  onMutate: () => void
  freeFirst: boolean
}) {
  const { t } = useLocale()
  const ti = t.integrations
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>, failure: string, success?: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      if (success) setNotice(success)
      onMutate()
    } catch {
      setError(failure)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-mono text-[11px] text-muted-foreground">{connection.maskedKey}</span>
        {connection.isDefault && (
          <span className="inline-flex items-center gap-1 rounded-full bg-seal px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground">
            <Check className="size-3" aria-hidden="true" />
            {ti.defaultBadge}
          </span>
        )}

        <span className="ml-auto flex items-center gap-1.5">
          {!connection.isDefault && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => makeProviderDefault(providerId), ti.defaultError)}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-sumi hover:text-foreground disabled:opacity-40"
            >
              {ti.makeDefault}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                () => disconnectProvider(providerId),
                ti.disconnectError,
                format(ti.disconnectedNotice, { label: connection.label }),
              )
            }
            className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-40"
          >
            {ti.disconnect}
          </button>
        </span>
      </div>

      {connection.lastError && (
        <p role="alert" className="text-xs text-destructive">
          {connection.lastError}
        </p>
      )}

      {providerId === 'openrouter' && <FreeFirstToggle initial={freeFirst} />}

      <ConnectForm providerId={providerId} makeDefault={false} onConnected={onMutate} replace />

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs text-seal">
          {notice}
        </p>
      )}
    </div>
  )
}

function ConnectForm({
  providerId,
  makeDefault,
  onConnected,
  replace = false,
}: {
  providerId: ProviderId
  makeDefault: boolean
  onConnected: () => void
  replace?: boolean
}) {
  const { t } = useLocale()
  const ti = t.integrations
  const meta = PROVIDERS[providerId]
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      const view = await connectProvider({
        provider: providerId,
        apiKey: apiKey.trim(),
        makeDefault,
      })
      setApiKey('')
      setNotice(format(ti.connectedNotice, { label: view.label, maskedKey: view.maskedKey }))
      onConnected()
    } catch {
      setError(ti.saveError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <label
        htmlFor={`key-${providerId}`}
        className="flex flex-wrap items-baseline gap-2 text-xs font-medium text-muted-foreground"
      >
        {ti.apiKeyLabel}
        {meta.keyPrefix && (
          <span className="font-normal">
            {ti.keyPrefixLead}
            {meta.keyPrefix}
          </span>
        )}
      </label>
      <input
        id={`key-${providerId}`}
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={apiKey}
        onChange={(event) => {
          setApiKey(event.target.value)
          setError(null)
        }}
        placeholder={`${meta.keyPrefix}…`}
        className="w-full rounded-xl border border-input bg-background px-3 py-2 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-ring focus:ring-2 focus:ring-ring/25"
      />
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        {ti.storedNote}
        <a
          href={meta.keyDocsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-seal underline-offset-2 hover:underline"
        >
          {format(ti.getKeyLink, { label: meta.label })}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </p>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs text-seal">
          {notice}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || apiKey.trim().length === 0}
        className="inline-flex items-center gap-1.5 rounded-full bg-sumi px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <KeyRound className="size-3.5" aria-hidden="true" />
        )}
        {busy ? ti.saving : replace ? t.providerPanel.replaceKey : ti.connect}
      </button>
    </form>
  )
}
