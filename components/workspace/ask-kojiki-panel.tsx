'use client'

import type { BotRow } from '@/app/actions/projects'
import {
  ChatModule,
  type ChatFocus,
  type ChatSeed,
} from '@/components/workspace/chat-module'
import { useLocale } from '@/components/i18n/locale-provider'
import { MarbledFluidOrb } from '@/components/workspace/ui/marbled-fluid-orb'
import { Minus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const PANEL_WIDTH = 416
const PANEL_HEIGHT = 524

interface AskKojikiPanelProps {
  projectId: string
  projectName: string
  bots: BotRow[]
  focus: ChatFocus | null
  onFocusChange: (focus: ChatFocus) => void
  seed: ChatSeed | null
  onClose: () => void
}

/**
 * The floating conversation: a draggable card that lives above the workspace,
 * moved by its header and parked anywhere on screen.
 */
export function AskKojikiPanel({
  projectId,
  projectName,
  bots,
  focus,
  onFocusChange,
  seed,
  onClose,
}: AskKojikiPanelProps) {
  const { t } = useLocale()
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [minimized, setMinimized] = useState(false)
  const drag = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null)

  useEffect(() => {
    setPosition((current) => {
      if (current) return current
      const x = Math.max(8, window.innerWidth - PANEL_WIDTH - 24)
      const y = Math.max(56, window.innerHeight - PANEL_HEIGHT - 24)
      return { x, y }
    })
  }, [])

  function clamp(next: { x: number; y: number }) {
    const maxX = window.innerWidth - PANEL_WIDTH - 8
    const maxY = window.innerHeight - 48 - 8
    return {
      x: Math.min(Math.max(8, next.x), Math.max(8, maxX)),
      y: Math.min(Math.max(56, next.y), Math.max(56, maxY)),
    }
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button')) return
    if (!position) return
    drag.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: position.x,
      y: position.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const start = drag.current
    setPosition(
      clamp({
        x: start.x + (event.clientX - start.pointerX),
        y: start.y + (event.clientY - start.pointerY),
      }),
    )
  }

  function onPointerUp() {
    drag.current = null
  }

  const focusLabel =
    focus?.kind === 'bot'
      ? (bots.find((bot) => bot.id === focus.botId)?.displayName ?? t.nav.departments)
      : focus?.kind === 'sub_agent'
        ? t.nav.work
        : t.tabs.orchestrator.brand

  if (!position) return null

  return (
    <div
      className="fixed z-40 overflow-hidden rounded-2xl border border-border bg-card shadow-lifted"
      style={{ left: position.x, top: position.y, width: PANEL_WIDTH }}
      role="dialog"
      aria-label={t.tabs.orchestrator.ask}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex h-11 cursor-grab touch-none items-center gap-2 border-b border-border bg-card/90 px-3 select-none active:cursor-grabbing"
      >
        <MarbledFluidOrb size={24} speed={0.7} />
        <span className="shrink-0 text-sm font-medium text-foreground">
          {t.tabs.orchestrator.ask}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {focusLabel}
        </span>
        <button
          type="button"
          onClick={() => setMinimized((v) => !v)}
          aria-label={minimized ? 'Expand' : 'Minimize'}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Minus className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {!minimized && (
        <div style={{ height: PANEL_HEIGHT - 44 }}>
          <ChatModule
            projectId={projectId}
            projectName={projectName}
            bots={bots}
            focus={focus}
            onFocusChange={onFocusChange}
            seed={seed}
          />
        </div>
      )}
    </div>
  )
}
