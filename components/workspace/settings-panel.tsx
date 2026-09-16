'use client'

import { deleteDocument, uploadDocument } from '@/app/actions/documents'
import { LanguageSelector } from '@/components/i18n/language-selector'
import { useLocale } from '@/components/i18n/locale-provider'
import { ProviderConnect } from '@/components/providers/provider-connect'
import { AccentPicker } from '@/components/settings/accent-picker'
import { DocumentLibrary } from '@/components/workspace/document-attach'
import { SUPPORTED_MIME_LABEL } from '@/lib/documents'
import { format } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { FileUp, Loader2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

/**
 * Workspace settings, as an overlay rather than a route.
 *
 * Settings interrupt the work rather than being a destination, so the panel sits on
 * top of the workspace and closing it returns you to exactly where you were.
 *
 * Three sections, in the order they matter: providers decide what the agents are
 * allowed to spend, appearance decides how the workspace reads, and files decide
 * what the agents know. Each is a decision the user makes rarely and wants to find
 * again without hunting.
 */
export function SettingsPanel({
  accentKey,
  projectId,
  onClose,
}: {
  accentKey: string
  projectId: string | null
  onClose: () => void
}) {
  const { t } = useLocale()

  // Escape closes it, which is what an overlay owes the user.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-sumi/40 p-4 backdrop-blur-sm sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-background shadow-floating"
      >
        <header className="surface-translucent sticky top-0 z-10 flex items-center gap-3 border-b border-border px-6 py-4">
          <h2 id="settings-title" className="text-xl font-semibold text-foreground">
            {t.settings.title}
          </h2>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {t.settings.summary}
          </p>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.settings.closeAria}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-sumi hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden="true" />
            {t.common.close}
          </button>
        </header>

        <div className="divide-y divide-border">
          <SettingsSection
            id="providers"
            title={t.settings.providersTitle}
            description={t.settings.providersDescription}
          >
            <ProviderConnect title={t.settings.connectedProviders} />
          </SettingsSection>

          <SettingsSection
            id="appearance"
            title={t.settings.appearanceTitle}
            description={t.settings.appearanceDescription}
          >
            <AccentPicker currentKey={accentKey} />
          </SettingsSection>

          <SettingsSection
            id="language"
            title={t.settings.languageTitle}
            description={t.settings.languageDescription}
          >
            <LanguageSelector />
          </SettingsSection>

          <SettingsSection
            id="files"
            title={t.settings.filesTitle}
            description={t.settings.filesDescription}
          >
            <FilesSection projectId={projectId} />
          </SettingsSection>
        </div>
      </div>
    </div>
  )
}

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="px-6 py-6">
      <h3
        id={`${id}-title`}
        className="text-lg font-semibold text-foreground"
      >
        {title}
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>

      <div className="mt-5">{children}</div>
    </section>
  )
}

/**
 * Upload and library together, so an upload can refresh the list.
 *
 * They are one component rather than two because the list has to refetch when the
 * upload succeeds, and the only honest way to do that is to own both.
 */
function FilesSection({ projectId }: { projectId: string | null }) {
  const [version, setVersion] = useState(0)

  return (
    <div className="space-y-4">
      <FileUpload projectId={projectId} onUploaded={() => setVersion((v) => v + 1)} />
      <DocumentLibrary
        projectId={projectId}
        onDelete={deleteDocument}
        refreshKey={version}
      />
    </div>
  )
}

/**
 * Upload from settings.
 *
 * The composer also uploads, but scoped to the conversation's project. Here the
 * scope is explicit and the user can see which one they chose, because a document
 * added from settings outlives any single conversation.
 */
function FileUpload({
  projectId,
  onUploaded,
}: {
  projectId: string | null
  onUploaded: () => void
}) {
  const { t } = useLocale()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(true)
    setError(null)
    setNotice(null)

    try {
      const saved = await uploadDocument({ file, projectId })
      setNotice(
        format(
          saved.projectId
            ? t.settings.uploadedProject
            : t.settings.uploadedAll,
          { name: saved.name },
        ),
      )
      onUploaded()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.settings.readError)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          onChange={onFile}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'inline-flex items-center gap-2 rounded-full bg-sumi px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-40',
          )}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileUp className="size-4" aria-hidden="true" />
          )}
          {uploading ? t.settings.readingFile : t.settings.addFile}
        </button>

        <p className="font-mono text-[11px] text-muted-foreground">
          {SUPPORTED_MIME_LABEL}
          <span aria-hidden="true"> · </span>
          {projectId ? t.settings.scopedProject : t.settings.scopedAll}
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-seal">
          {notice}
        </p>
      )}
    </div>
  )
}
