'use client'

import type { BotRow } from '@/app/actions/projects'
import {
  ChatModule,
  type ChatFocus,
  type ChatSeed,
} from '@/components/workspace/chat-module'
import { useLocale } from '@/components/i18n/locale-provider'
import { MarbledFluidOrb } from '@/components/workspace/ui/marbled-fluid-orb'
import { ArrowUpRight } from 'lucide-react'

interface ChatDockProps {
  projectId: string
  projectName: string
  bots: BotRow[]
  focus: ChatFocus | null
  onFocusChange: (focus: ChatFocus) => void
  seed: ChatSeed | null
  onPopOut: () => void
}

/**
 * The conversation docked in the right rail. It is the rail's default occupant;
 * popping it out lifts it into a floating card and hands the rail to the gate
 * queue.
 */
export function ChatDock({
  projectId,
  projectName,
  bots,
  focus,
  onFocusChange,
  seed,
  onPopOut,
}: ChatDockProps) {
  const { t } = useLocale()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <MarbledFluidOrb size={24} speed={0.7} />
        <span className="shrink-0 text-sm font-medium text-foreground">
          {t.tabs.orchestrator.ask}
        </span>
        <span className="min-w-0 flex-1" aria-hidden="true" />
        <button
          type="button"
          onClick={onPopOut}
          aria-label={t.tabs.orchestrator.popOut}
          title={t.tabs.orchestrator.popOut}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChatModule
          projectId={projectId}
          projectName={projectName}
          bots={bots}
          focus={focus}
          onFocusChange={onFocusChange}
          seed={seed}
        />
      </div>
    </div>
  )
}
