'use client'

import {
  getDocument,
  listDocuments,
  uploadDocument,
  type DocumentSummary,
} from '@/app/actions/documents'
import { useLocale } from '@/components/i18n/locale-provider'
import {
  Card,
  StatusPill,
  useRelativeTime,
} from '@/components/workspace/ui/primitives'
import { cn } from '@/lib/utils'
import { ExternalLink, Search, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import useSWR, { mutate } from 'swr'

interface EvidenceTabProps {
  projectId: string
  query: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * The evidence library: every document the project holds, with a reading panel
 * for the extracted text the agents actually ground on.
 */
export function EvidenceTab({ projectId, query }: EvidenceTabProps) {
  const { t } = useLocale()
  const labels = t.tabs.evidence
  const relative = useRelativeTime()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: documents } = useSWR(['documents', projectId], () =>
    listDocuments(projectId),
  )
  const { data: detail } = useSWR(
    selectedId ? ['document', selectedId] : null,
    () => getDocument(selectedId!),
  )

  const needle = `${query} ${search}`.trim().toLowerCase()
  const rows = (documents ?? []).filter(
    (doc) => !needle || doc.name.toLowerCase().includes(needle),
  )
  const selected: DocumentSummary | null =
    rows.find((doc) => doc.id === selectedId) ??
    (documents ?? []).find((doc) => doc.id === selectedId) ??
    null

  async function onFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const created = await uploadDocument({ file, projectId })
      await mutate(['documents', projectId])
      setSelectedId(created.id)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {t.nav.evidence}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            aria-label={labels.upload}
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Upload className="size-3.5" aria-hidden="true" />
            {uploading ? '…' : labels.upload}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <Card className="self-start">
          <div className="border-b border-border px-3 py-2.5">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <label htmlFor="evidence-search" className="sr-only">
                {labels.search}
              </label>
              <input
                id="evidence-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={labels.search}
                className="h-8 w-full rounded-full border border-border bg-background pr-3 pl-8 text-xs text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-seal/50"
              />
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              {labels.none}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(doc.id)}
                    aria-current={selectedId === doc.id ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      selectedId === doc.id ? 'bg-muted/70' : 'hover:bg-muted/50',
                    )}
                  >
                    <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">
                      {doc.id.slice(0, 6)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {doc.name}
                    </span>
                    <span className="hidden w-24 shrink-0 truncate text-xs text-muted-foreground sm:block">
                      {doc.source}
                    </span>
                    <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {formatBytes(doc.sizeBytes)}
                    </span>
                    <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground">
                      {relative(doc.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="self-start p-4">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="font-mono text-[11px] text-muted-foreground">
                  {selected.id.slice(0, 8)}
                </p>
                <StatusPill tone="idle">{selected.mimeType}</StatusPill>
              </div>
              <h2 className="mt-2 text-base font-semibold text-balance text-foreground">
                {selected.name}
              </h2>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{labels.source}</dt>
                  <dd className="font-medium text-foreground">{selected.source}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{labels.size}</dt>
                  <dd className="font-medium tabular-nums text-foreground">
                    {formatBytes(selected.sizeBytes)} · {selected.charCount} chars
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{labels.updated}</dt>
                  <dd className="font-medium text-foreground">
                    {relative(selected.createdAt)}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 border-t border-border pt-3">
                <h3 className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  {labels.extracted}
                </h3>
                <pre className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                  {detail?.content ?? '…'}
                </pre>
              </div>

              {detail?.sourceRef && (
                <a
                  href={detail.sourceRef}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-seal transition-opacity hover:opacity-80"
                >
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  {labels.viewSource}
                </a>
              )}
            </>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {labels.empty}
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
