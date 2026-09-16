'use client'

import {
  connectProvider,
  disconnectProvider,
  getConnections,
  makeProviderDefault,
} from '@/app/actions/providers'
import { useLocale } from '@/components/i18n/locale-provider'
import { format } from '@/lib/i18n'
import {
  PROVIDERS,
  PROVIDER_IDS,
  type ConnectionView,
  type ProviderId,
} from '@/lib/provider-meta'
import { cn } from '@/lib/utils'
import { AlertTriangle, Check, ExternalLink, KeyRound, Trash2 } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'

/**
 * Provider connection panel.
 *
 * The same component serves orientation and settings, because the decision is the
 * same in both places: which provider runs the agents, and what it costs to run
 * them. Keys are write-only here — the panel accepts one and thereafter shows only
 * a mask, so there is no UI path that reads a stored key back out.
 */
export function ProviderConnect({
  title = 'Model providers',
  onConnected,
}: {
  title?: string
  onConnected?: () => void
}) {
  const { t } = useLocale()
  const tp = t.providerPanel
  const { data, mutate } = useSWR('provider-connections', getConnections, {
    revalidateOnFocus: false,
  })
  const [selected, setSelected] = useState<ProviderId>('openrouter')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const connections: ConnectionView[] = data ?? []
  const meta = PROVIDERS[selected]
  const alreadyConnected = connections.some((entry) => entry.provider === selected)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      const view = await connectProvider({
        provider: selected,
        apiKey: apiKey.trim(),
        // The first connection becomes the default; after that the user chooses.
        makeDefault: connections.length === 0,
      })
      setApiKey('')
      setNotice(
        format(tp.connectedNotice, {
          label: view.label,
          maskedKey: view.maskedKey,
        }),
      )
      await mutate()
      onConnected?.()
    } catch {
      setError(tp.saveError)
    } finally {
      setBusy(false)
    }
  }

  async function setDefault(provider: string) {
    setError(null)
    setNotice(null)
    try {
      await makeProviderDefault(provider)
      await mutate()
    } catch {
      setError(tp.defaultError)
    }
  }

  async function disconnect(provider: string, label: string) {
    setError(null)
    setNotice(null)
    try {
      await disconnectProvider(provider)
      setNotice(format(tp.disconnectedNotice, { label }))
      await mutate()
      onConnected?.()
    } catch {
      setError(tp.disconnectError)
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="border-b border-border px-4 py-3.5 sm:px-5">
        <h3 className="flex items-center gap-2 text-base font-medium text-foreground">
          <KeyRound className="size-4 text-seal" aria-hidden="true" />
          {title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {tp.intro}
        </p>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        {connections.length > 0 && (
          <ul className="space-y-2">
            {connections.map((connection) => (
              <li
                key={connection.provider}
                className={cn(
                  'rounded-xl border px-3.5 py-2.5',
                  connection.isDefault
                    ? 'border-seal/40 bg-seal-soft'
                    : 'border-border bg-background',
                )}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-sm text-foreground">{connection.label}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {connection.maskedKey}
                  </span>
                  {connection.isDefault && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-seal px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground">
                      <Check className="size-3" aria-hidden="true" />
                      {tp.defaultBadge}
                    </span>
                  )}

                  <span className="ml-auto flex items-center gap-1.5">
                    {!connection.isDefault && (
                      <button
                        type="button"
                        onClick={() => setDefault(connection.provider)}
                        className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-sumi hover:text-foreground"
                      >
                        {tp.makeDefault}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => disconnect(connection.provider, connection.label)}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      {tp.disconnect}
                    </button>
                  </span>
                </div>

                {connection.lastError && (
                  <p className="mt-2 flex items-start gap-1.5 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {tp.lastErrorLead}
                    {connection.lastError}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={submit}
          className={cn('space-y-3', connections.length > 0 && 'border-t border-border pt-4')}
        >
          <fieldset>
            <legend className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {connections.length > 0 ? tp.legendAnother : tp.legendFirst}
            </legend>

            <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
              {PROVIDER_IDS.map((id) => {
                const option = PROVIDERS[id]
                const connected = connections.some((entry) => entry.provider === id)

                return (
                  <label
                    key={id}
                    className={cn(
                      'flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors',
                      selected === id
                        ? 'border-seal/50 bg-seal-soft'
                        : 'border-border bg-background hover:border-sumi/40',
                    )}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value={id}
                      checked={selected === id}
                      onChange={() => {
                        setSelected(id)
                        setError(null)
                      }}
                      className="mt-0.5 size-3.5 accent-[var(--seal)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5 text-sm text-foreground">
                        {option.label}
                        {connected && (
                          <span className="text-[11px] font-medium text-seal">
                            {tp.connectedTag}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {tp.blurbs[id]}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="provider-api-key"
              className="flex flex-wrap items-baseline gap-2 text-xs font-medium text-muted-foreground"
            >
              {tp.apiKeyLabel}
              {meta.keyPrefix && (
                <span className="font-normal text-muted-foreground">
                  {tp.keyPrefixLead}
                  {meta.keyPrefix}
                </span>
              )}
            </label>
            <input
              id="provider-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value)
                setError(null)
              }}
              placeholder={`${meta.keyPrefix}…`}
              className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              {tp.storedNote}
              <a
                href={meta.keyDocsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-seal underline-offset-2 hover:underline"
              >
                {format(tp.getKeyLink, { label: meta.label })}
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </p>
          </div>

          {alreadyConnected && (
            <p className="text-xs text-muted-foreground">
              {format(tp.alreadyConnected, { label: meta.label })}
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-seal">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || apiKey.trim().length === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-sumi px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <KeyRound className="size-3.5" aria-hidden="true" />
            {busy ? tp.saving : alreadyConnected ? tp.replaceKey : tp.connect}
          </button>
        </form>
      </div>
    </section>
  )
}
