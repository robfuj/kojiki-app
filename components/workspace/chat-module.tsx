'use client'

import {
  getOrCreateSession,
  getSessionMessages,
} from '@/app/actions/chat'
import type { BotRow } from '@/app/actions/projects'
import { cn } from '@/lib/utils'
import { SYNAPSIS_STAGES } from '@/lib/ontology/synapsis'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { ArrowUp, ChevronDown, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'

interface ChatModuleProps {
  projectId: string
  projectName: string
  bots: BotRow[]
}

export function ChatModule({ projectId, projectName, bots }: ChatModuleProps) {
  const [activeBotId, setActiveBotId] = useState<string | null>(bots[0]?.id ?? null)
  const [showDetails, setShowDetails] = useState(false)

  const activeBot = bots.find((bot) => bot.id === activeBotId) ?? bots[0] ?? null

  if (bots.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">
          This project has no department agents.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
            Department agents
          </p>
          <p className="truncate font-mono text-[10px] text-muted-foreground/60">
            {projectName}
          </p>
        </div>

        <div
          className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1"
          role="tablist"
          aria-label="Department agents"
        >
          {bots.map((bot, index) => {
            const active = bot.id === activeBot?.id
            return (
              <button
                key={bot.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveBotId(bot.id)}
                title={bot.mandate ?? undefined}
                className={cn(
                  'shrink-0 rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors',
                  active
                    ? 'border-sumi bg-sumi text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-sumi/40 hover:text-foreground',
                )}
              >
                {bot.displayName}
                {index === 0 && (
                  <span className="ml-1 text-seal" aria-label="primary agent">
                    ●
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {activeBot && (
          <>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {activeBot.mandate}
            </p>

            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
              className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              <ChevronDown
                className={cn('size-3 transition-transform', showDetails && 'rotate-180')}
                aria-hidden="true"
              />
              Decision rights &amp; handoffs
            </button>

            {showDetails && <BotDetails bot={activeBot} />}
          </>
        )}
      </div>

      {activeBot && (
        <BotChat
          key={`${projectId}:${activeBot.id}`}
          projectId={projectId}
          botId={activeBot.id}
          botName={activeBot.displayName}
        />
      )}
    </div>
  )
}

function BotDetails({ bot }: { bot: BotRow }) {
  const rights = bot.decisionRights as Record<string, string[]>
  const handoffs = bot.handoffTargets as { target: string; trigger: string }[]
  const verbs = ['own', 'recommend', 'consult', 'approve', 'execute', 'escalate', 'automate']

  return (
    <div className="mt-2.5 space-y-2.5 rounded-md border border-border bg-card p-3">
      <dl className="space-y-1.5">
        {verbs.map((verb) => {
          const items = rights[verb]
          if (!items || items.length === 0) return null
          return (
            <div key={verb} className="flex gap-2 font-mono text-[10px]">
              <dt className="w-20 shrink-0 uppercase tracking-wide text-seal">{verb}</dt>
              <dd className="min-w-0 flex-1 text-muted-foreground">
                {items.map((item) => item.replace(/_/g, ' ')).join(' · ')}
              </dd>
            </div>
          )
        })}
      </dl>

      {handoffs.length > 0 && (
        <div className="border-t border-border pt-2">
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Hands off to
          </p>
          <ul className="mt-1.5 space-y-1">
            {handoffs.map((handoff) => (
              <li key={handoff.target} className="font-mono text-[10px] text-muted-foreground">
                <span className="text-foreground">{handoff.target}</span>
                <span className="text-muted-foreground/60"> — {handoff.trigger}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-border pt-2">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
          SYNAPSIS cycle
        </p>
        <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {SYNAPSIS_STAGES.map((stage) => stage.key).join(' → ')}
        </p>
      </div>
    </div>
  )
}

interface BotChatProps {
  projectId: string
  botId: string
  botName: string
}

function BotChat({ projectId, botId, botName }: BotChatProps) {
  const { data: session, isLoading: loadingSession } = useSWR(
    ['session', projectId, botId],
    () => getOrCreateSession(projectId, botId),
    { revalidateOnFocus: false },
  )

  const { data: stored, isLoading: loadingMessages } = useSWR(
    session ? ['messages', session.id] : null,
    () => getSessionMessages(session!.id),
    { revalidateOnFocus: false },
  )

  if (loadingSession || (session && loadingMessages)) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Loading conversation</span>
      </div>
    )
  }

  if (!session) return null

  const initialMessages: UIMessage[] = (stored ?? []).map((row) => ({
    id: row.id,
    role: row.role as UIMessage['role'],
    parts: row.parts as UIMessage['parts'],
  }))

  return (
    <Conversation
      key={session.id}
      sessionId={session.id}
      botName={botName}
      initialMessages={initialMessages}
    />
  )
}

interface ConversationProps {
  sessionId: string
  botName: string
  initialMessages: UIMessage[]
}

function Conversation({ sessionId, botName, initialMessages }: ConversationProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: { sessionId },
      }),
    [sessionId],
  )

  const { messages, sendMessage, status, error } = useChat({
    transport,
    messages: initialMessages,
  })

  const busy = status === 'streaming' || status === 'submitted'

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages])

  function submit() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    sendMessage({ text })
  }

  return (
    <>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
        role="log"
        aria-label={`Conversation with ${botName}`}
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-4 text-xs leading-relaxed text-muted-foreground">
            {botName} is oriented on this project and ready. Ask it to work a
            decision through the SYNAPSIS cycle, or to take a goal from the OKR
            tree.
          </p>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} botName={botName} />
        ))}

        {status === 'submitted' && (
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            {botName} is working
          </p>
        )}

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error.message || 'The agent could not respond.'}
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-card p-3">
        <div className="flex items-end gap-2 rounded-md border border-input bg-background p-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
          <label htmlFor="chat-composer" className="sr-only">
            Message {botName}
          </label>
          <textarea
            id="chat-composer"
            rows={2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault()
                submit()
              }
            }}
            placeholder={`Message ${botName}…`}
            className="max-h-32 min-w-0 flex-1 resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || !input.trim()}
            aria-label="Send message"
            className="shrink-0 rounded-sm bg-sumi p-1.5 text-primary-foreground transition-opacity disabled:opacity-40"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1.5 font-mono text-[10px] text-muted-foreground/60">
          Enter to send · Shift + Enter for a new line
        </p>
      </div>
    </>
  )
}

function MessageBubble({
  message,
  botName,
}: {
  message: UIMessage
  botName: string
}) {
  const isUser = message.role === 'user'
  const text = message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('')

  if (!text) return null

  return (
    <div className={cn('flex flex-col gap-1', isUser && 'items-end')}>
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
        {isUser ? 'you' : botName}
      </p>
      <div
        className={cn(
          'max-w-[92%] rounded-md border px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'border-sumi/30 bg-sumi-soft text-foreground'
            : 'border-border bg-card text-foreground',
        )}
      >
        {text}
      </div>
    </div>
  )
}
