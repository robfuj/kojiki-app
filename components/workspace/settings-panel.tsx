'use client'

import { ProviderConnect } from '@/components/providers/provider-connect'
import { X } from 'lucide-react'
import { useEffect } from 'react'

/**
 * Workspace settings, as an overlay rather than a route.
 *
 * Settings are a interruption of the work, not a destination, so the panel sits on
 * top of the workspace and closing it returns you to exactly where you were. The
 * only thing in it today is provider connection, which is the one decision that
 * changes what the agents are allowed to spend.
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  // Escape closes it, which is what an overlay owes the user.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-sumi/40 p-4 sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full max-w-2xl rounded-md border border-border bg-background shadow-lg"
      >
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <h2
            id="settings-title"
            className="font-serif text-lg text-foreground"
          >
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="ml-auto inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:border-sumi hover:text-foreground"
          >
            <X className="size-3" aria-hidden="true" />
            Close
          </button>
        </header>

        <div className="space-y-4 p-4">
          <ProviderConnect />
        </div>
      </div>
    </div>
  )
}
