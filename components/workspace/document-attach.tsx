'use client'

import {
  listDocuments,
  uploadDocument,
  type DocumentSummary,
} from '@/app/actions/documents'
import { SUPPORTED_MIME_LABEL } from '@/lib/documents'
import { cn } from '@/lib/utils'
import { FileText, Loader2, Paperclip, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import useSWR from 'swr'

/**
 * File import, in the composer.
 *
 * A document uploaded here becomes context for every agent in the project, not
 * just the one being messaged — a pricing sheet should inform Finance's numbers
 * and Legal's review alike. The chips are shown above the composer rather than
 * attached to a single message, because that is what is actually true of them:
 * they persist and they are shared.
 */
export function DocumentAttach({ projectId }: { projectId: string }) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data, mutate } = useSWR(
    ['documents', projectId],
    () => listDocuments(projectId),
    { revalidateOnFocus: false },
  )

  const documents = data ?? []

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset immediately so picking the same file again still fires onChange.
    event.target.value = ''
    if (!file) return

    setUploading(true)
    setError(null)

    try {
      await uploadDocument({ file, projectId })
      await mutate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          onChange={onFile}
          aria-describedby={`${inputId}-hint`}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors',
            uploading
              ? 'cursor-wait text-muted-foreground'
              : 'text-muted-foreground hover:border-sumi hover:text-foreground',
          )}
        >
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Paperclip className="size-3.5" aria-hidden="true" />
          )}
          {uploading ? 'Reading…' : 'Add file'}
        </button>

        <p
          id={`${inputId}-hint`}
          className="truncate font-mono text-[11px] text-muted-foreground"
        >
          {SUPPORTED_MIME_LABEL}
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {documents.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {documents.map((document) => (
            <DocumentChip key={document.id} document={document} />
          ))}
        </ul>
      )}
    </div>
  )
}

function DocumentChip({ document }: { document: DocumentSummary }) {
  return (
    <li className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted py-1 pr-1.5 pl-2.5">
      <FileText className="size-3.5 shrink-0 text-seal" aria-hidden="true" />
      <span className="truncate text-xs text-foreground">{document.name}</span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
        {Math.max(1, Math.round(document.charCount / 1000))}k
      </span>
    </li>
  )
}

/**
 * The project's documents, for the settings library.
 *
 * Separate from the composer because the library is where a document gets
 * removed, and removing context is not something to do from inside a
 * conversation.
 */
export function DocumentLibrary({
  projectId,
  onDelete,
  refreshKey = 0,
}: {
  projectId?: string | null
  onDelete: (documentId: string) => Promise<void>
  /**
   * Bumped by a sibling upload control to force a refetch. The library does not
   * own the upload in settings, so it cannot mutate its own cache from there.
   */
  refreshKey?: number
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data, mutate } = useSWR(
    ['documents', projectId ?? 'library', refreshKey],
    () => listDocuments(projectId ?? null),
    { revalidateOnFocus: false },
  )

  const documents = data ?? []

  async function remove(documentId: string) {
    setBusyId(documentId)
    setError(null)
    try {
      await onDelete(documentId)
      await mutate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that file')
    } finally {
      setBusyId(null)
    }
  }

  if (documents.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        No files yet. Add one from the chat composer, or with the button above.
      </p>
    )
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {documents.map((document) => (
          <li
            key={document.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <FileText className="size-4 shrink-0 text-seal" aria-hidden="true" />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {document.name}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {Math.max(1, Math.round(document.charCount / 1000))}k characters
                <span aria-hidden="true"> · </span>
                {document.projectId ? 'this project' : 'all projects'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => remove(document.id)}
              disabled={busyId === document.id}
              aria-label={`Remove ${document.name}`}
              className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
            >
              {busyId === document.id ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <X className="size-3.5" aria-hidden="true" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
