'use client'

import { cn } from '@/lib/utils'
import { useState } from 'react'

export const TEXT_SIZE_STORAGE_KEY = 'kojiki-text-size'

const OPTIONS = [
  { value: 'standard', label: 'Standard', sample: 'text-base' },
  { value: 'large', label: 'Large', sample: 'text-lg' },
  { value: 'xl', label: 'Extra large', sample: 'text-xl' },
] as const

type TextSize = (typeof OPTIONS)[number]['value']

function readTextSize(): TextSize {
  if (typeof document === 'undefined') return 'standard'
  const current = document.documentElement.dataset.textSize
  return current === 'large' || current === 'xl' ? current : 'standard'
}

/** Scales the whole interface by changing the root font size; saved on this device. */
export function TextSizePicker() {
  const [size, setSize] = useState<TextSize>(readTextSize)

  function choose(next: TextSize) {
    setSize(next)
    const root = document.documentElement
    if (next === 'standard') delete root.dataset.textSize
    else root.dataset.textSize = next
    try {
      localStorage.setItem(TEXT_SIZE_STORAGE_KEY, next)
    } catch {
      // Private browsing can block storage; the choice still applies for this visit.
    }
  }

  return (
    <div role="radiogroup" aria-label="Text size" className="flex flex-wrap gap-3">
      {OPTIONS.map((option) => {
        const active = option.value === size
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(option.value)}
            className={cn(
              'flex min-h-14 min-w-36 flex-col items-start justify-center rounded-xl border-2 px-4 py-2 text-left transition-colors',
              active
                ? 'border-seal bg-seal-soft text-foreground'
                : 'border-border bg-card text-foreground hover:bg-muted',
            )}
          >
            <span className={cn('font-semibold leading-tight', option.sample)}>Aa</span>
            <span className="text-sm text-muted-foreground">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
