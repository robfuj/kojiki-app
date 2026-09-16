'use client'

import { setAccentKey } from '@/app/actions/settings'
import { ACCENTS } from '@/lib/accents'
import { cn } from '@/lib/utils'
import { Check, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * The accent picker.
 *
 * The accent is the seal: it marks decisions, completion and the primary action.
 * It is the only user-changeable colour, because a workspace where every surface
 * can be recoloured stops having a readable hierarchy — structure stays sumi
 * indigo and neutral grey whatever is chosen here.
 */
export function AccentPicker({ currentKey }: { currentKey: string }) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function choose(key: string) {
    if (key === currentKey) return

    setPending(key)
    setError(null)

    try {
      await setAccentKey(key)
      // The shell applies the accent from a server read, so the tree must be
      // re-rendered for the choice to reach the rest of the workspace.
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that accent')
    } finally {
      setPending(null)
    }
  }

  return (
    <div>
      <div
        className="flex flex-wrap gap-2.5"
        role="radiogroup"
        aria-label="Accent colour"
      >
        {ACCENTS.map((accent) => {
          const selected = accent.key === currentKey
          const busy = pending === accent.key

          return (
            <button
              key={accent.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => void choose(accent.key)}
              disabled={pending !== null}
              className={cn(
                'group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors disabled:cursor-wait',
                selected
                  ? 'border-sumi bg-card shadow-soft'
                  : 'border-border bg-card/50 hover:border-sumi/40 hover:bg-card',
              )}
            >
              <span
                className="relative size-6 shrink-0 rounded-full"
                style={{ backgroundColor: accent.swatch }}
                aria-hidden="true"
              >
                {selected && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    {busy ? (
                      <Loader2
                        className="size-3.5 animate-spin text-white mix-blend-difference"
                        aria-hidden="true"
                      />
                    ) : (
                      <Check
                        className="size-3.5 text-white mix-blend-difference"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                )}
              </span>

              <span className="text-left">
                <span className="block text-sm font-medium text-foreground">
                  {accent.label}
                </span>
                <span className="sr-only">
                  {selected ? ' — currently selected' : ''}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        The accent marks decisions, completed work and the primary action.
        Everything else — structure, hierarchy and text — stays fixed, so the
        workspace reads the same whichever you choose.
      </p>
    </div>
  )
}
