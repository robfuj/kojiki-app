'use client'

import {
  getOrCreateOrchestratorSession,
  getOrCreateSession,
  getOrCreateSubAgentSession,
  getSessionMessages,
  type SessionRow,
} from '@/app/actions/chat'
import { uploadDocument } from '@/app/actions/documents'
import type { BotRow } from '@/app/actions/projects'
import { DocumentAttach } from '@/components/workspace/document-attach'
import { MarbledFluidOrb } from '@/components/workspace/ui/marbled-fluid-orb'
import { cn } from '@/lib/utils'
import { SYNAPSIS_STAGES } from '@/lib/ontology/synapsis'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { ArrowLeft, ArrowUp, ChevronDown, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'

/**
 * Which agent the sidebar is talking to.
 *
 * Three layers share one sidebar: the orchestrator above the departments, the
 * department heads themselves, and the sub-agents underneath them. A sub-agent
 * conversation can be scoped to one sub-goal, which is how "talk to the SEO
 * Specialist about this task" works from the sub-goal panel.
 */
export type ChatFocus =
  | { kind: 'orchestrator' }
  | { kind: 'bot'; botId: string }
  | {
      kind: 'sub_agent'
      botId: string
      parentSpecialistKey: string
      subAgentKey: string
      subAgentTitle: string
      objectiveId: string | null
    }

/** A prompt pushed into the composer from outside — suggestion chips use it. */
export interface ChatSeed {
  text: string
  nonce: number
}

interface ChatModuleProps {
  projectId: string
  projectName: string
  bots: BotRow[]
  /** Which agent the sidebar is talking to. The parent owns it so the tree and the sidebar agree. */
  focus?: ChatFocus | null
  onFocusChange: (focus: ChatFocus) => void
  seed?: ChatSeed | null
}

export function ChatModule({
  projectId,
  projectName,
  bots,
  focus,
  onFocusChange,
  seed,
}: ChatModuleProps) {
  const [showDetails, setShowDetails] = useState(false)

  // Focus is the single source of truth for which agent is active. Deriving the
  // department from it — instead of from local state that a parent callback can
  // contradict — is what makes a division tab actually open that division.
  const activeBot =
    bots.find((bot) => bot.id === (focus?.kind === 'bot' ? focus.botId : null)) ??
    bots[0] ??
    null

  // A sub-agent focus overrides the tab selection: the user asked to talk to a
  // specific sub-agent about specific work, so that is what they get.
  if (focus?.kind === 'sub_agent') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <button
            type="button"
            onClick={() => onFocusChange({ kind: 'orchestrator' })}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to agents
          </button>

          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-seal">
            Sub-agent
          </p>
          <p className="mt-1.5 text-base font-medium text-foreground">
            {focus.subAgentTitle}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Working under the {focus.parentSpecialistKey.replace(/_/g, ' ')} head
            {focus.objectiveId ? ' on this sub-goal' : ''}. It answers from its own
            ontology entry — its skills, tools and decision rights — not from the
            department&apos;s mandate.
          </p>
        </div>

        <SubAgentChat
          key={`${projectId}:${focus.subAgentKey}:${focus.objectiveId ?? 'project'}`}
          projectId={projectId}
          focus={focus}
          seed={seed}
        />
      </div>
    )
  }

  const orchestratorActive = focus?.kind === 'orchestrator'

  if (bots.length === 0 && !orchestratorActive) {
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
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Agents
          </p>
          <p className="truncate text-xs text-muted-foreground">{projectName}</p>
        </div>

        <div
          className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1"
          role="tablist"
          aria-label="Agents"
        >
          <button
            type="button"
            role="tab"
            aria-selected={orchestratorActive}
            onClick={() => onFocusChange({ kind: 'orchestrator' })}
            title="Coordinates the departments and reports the OKR tree back to you"
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              orchestratorActive
                ? 'border-seal bg-seal text-primary-foreground'
                : 'border-seal/40 bg-seal-soft text-seal hover:bg-seal hover:text-primary-foreground',
            )}
          >
            Orchestrator
          </button>

          {bots.map((bot, index) => {
            const active = !orchestratorActive && bot.id === activeBot?.id
            return (
              <button
                key={bot.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onFocusChange({ kind: 'bot', botId: bot.id })}
                title={bot.mandate ?? undefined}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
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

        {orchestratorActive ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Sits above the departments. It reads the OKR tree, the tasks in flight
            and any governance gate waiting on you, and reports what is actually
            happening. It does not do departmental work itself.
          </p>
        ) : (
          activeBot && (
            <>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {activeBot.mandate}
              </p>

              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                aria-expanded={showDetails}
                className="mt-2.5 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown
                  className={cn(
                    'size-3.5 transition-transform',
                    showDetails && 'rotate-180',
                  )}
                  aria-hidden="true"
                />
                Decision rights &amp; handoffs
              </button>

              {showDetails && <BotDetails bot={activeBot} />}
            </>
          )
        )}
      </div>

      {orchestratorActive ? (
        <OrchestratorChat
          key={`orchestrator:${projectId}`}
          projectId={projectId}
          seed={seed}
        />
      ) : (
        activeBot && (
          <BotChat
            key={`${projectId}:${activeBot.id}`}
            projectId={projectId}
            botId={activeBot.id}
            botName={activeBot.displayName}
            seed={seed}
          />
        )
      )}
    </div>
  )
}

function BotDetails({ bot }: { bot: BotRow }) {
  const rights = bot.decisionRights as Record<string, string[]>
  const handoffs = bot.handoffTargets as { target: string; trigger: string }[]
  const verbs = ['own', 'recommend', 'consult', 'approve', 'execute', 'escalate', 'automate']

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <dl className="space-y-2">
        {verbs.map((verb) => {
          const items = rights[verb]
          if (!items || items.length === 0) return null
          return (
            <div key={verb} className="flex gap-3 text-xs">
              <dt className="w-20 shrink-0 font-mono uppercase tracking-wide text-seal">
                {verb}
              </dt>
              <dd className="min-w-0 flex-1 leading-relaxed text-muted-foreground">
                {items.map((item) => item.replace(/_/g, ' ')).join(' · ')}
              </dd>
            </div>
          )
        })}
      </dl>

      {handoffs.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            Hands off to
          </p>
          <ul className="mt-2 space-y-1.5">
            {handoffs.map((handoff) => (
              <li key={handoff.target} className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">{handoff.target}</span>
                <span> — {handoff.trigger}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-border pt-3">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          SYNAPSIS cycle
        </p>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
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
  seed?: ChatSeed | null
}

function BotChat({ projectId, botId, botName, seed }: BotChatProps) {
  const { data: session, isLoading: loadingSession } = useSWR(
    ['session', projectId, botId],
    () => getOrCreateSession(projectId, botId),
    { revalidateOnFocus: false },
  )

  return (
    <SessionChat
      session={session ?? null}
      loading={loadingSession}
      agentName={botName}
      projectId={projectId}
      seed={seed}
      emptyHint={`${botName} is oriented on this project and ready. Ask it to work a decision through the SYNAPSIS cycle, or to take a goal from the OKR tree.`}
    />
  )
}

function OrchestratorChat({
  projectId,
  seed,
}: {
  projectId: string
  seed?: ChatSeed | null
}) {
  const { data: session, isLoading } = useSWR(
    ['orchestrator-session', projectId],
    () => getOrCreateOrchestratorSession(projectId),
    { revalidateOnFocus: false },
  )

  return (
    <SessionChat
      session={session ?? null}
      loading={isLoading}
      agentName="Orchestrator"
      projectId={projectId}
      seed={seed}
      emptyHint="Ask what is happening across the OKR tree, which sub-agents are working, or what is waiting on your decision. The orchestrator reports recorded state — it does not do departmental work itself."
    />
  )
}

function SubAgentChat({
  projectId,
  focus,
  seed,
}: {
  projectId: string
  focus: Extract<ChatFocus, { kind: 'sub_agent' }>
  seed?: ChatSeed | null
}) {
  const { data: session, isLoading } = useSWR(
    [
      'sub-agent-session',
      projectId,
      focus.botId,
      focus.subAgentKey,
      focus.objectiveId,
    ],
    () =>
      getOrCreateSubAgentSession({
        projectId,
        botId: focus.botId,
        parentSpecialistKey: focus.parentSpecialistKey,
        subAgentKey: focus.subAgentKey,
        subAgentTitle: focus.subAgentTitle,
        objectiveId: focus.objectiveId,
      }),
    { revalidateOnFocus: false },
  )

  return (
    <SessionChat
      session={session ?? null}
      loading={isLoading}
      agentName={focus.subAgentTitle}
      projectId={projectId}
      seed={seed}
      emptyHint={`${focus.subAgentTitle} is here with its own skills, tools and decision rights. Ask it what it is doing, or push back on its report. Anything outside its decision rights goes back to its department head as a recommendation.`}
    />
  )
}

interface SessionChatProps {
  session: SessionRow | null
  loading: boolean
  agentName: string
  projectId: string
  seed?: ChatSeed | null
  emptyHint: string
}

function SessionChat({
  session,
  loading,
  agentName,
  projectId,
  seed,
  emptyHint,
}: SessionChatProps) {
  const { data: stored, isLoading: loadingMessages } = useSWR(
    session ? ['messages', session.id] : null,
    () => getSessionMessages(session!.id),
    { revalidateOnFocus: false },
  )

  if (loading || (session && loadingMessages)) {
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
      agentName={agentName}
      projectId={projectId}
      seed={seed}
      emptyHint={emptyHint}
      initialMessages={initialMessages}
    />
  )
}

interface ConversationProps {
  sessionId: string
  agentName: string
  projectId: string
  seed?: ChatSeed | null
  emptyHint: string
  initialMessages: UIMessage[]
}

function Conversation({
  sessionId,
  agentName,
  projectId,
  seed,
  emptyHint,
  initialMessages,
}: ConversationProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const { mutate: mutateGlobal } = useSWRConfig()
  const [dragging, setDragging] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)

  // Suggestion chips place their prompt in the composer for the user to edit or
  // send; the nonce makes the same text re-seedable on a second click.
  useEffect(() => {
    if (seed) setInput(seed.text)
  }, [seed])

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

  // A dropped file uploads through the same path as the paperclip, so it becomes
  // project context exactly like a picked one — and the chip list refetches
  // through the shared SWR key rather than a second source of truth.
  async function onDrop(event: React.DragEvent) {
    event.preventDefault()
    setDragging(false)
    const files = Array.from(event.dataTransfer.files ?? [])
    if (files.length === 0) return

    setDropping(true)
    setDropError(null)
    try {
      for (const file of files.slice(0, 4)) {
        await uploadDocument({ file, projectId })
      }
      await mutateGlobal(['documents', projectId])
    } catch (err) {
      setDropError(
        err instanceof Error ? err.message : 'Could not read that file',
      )
    } finally {
      setDropping(false)
    }
  }

  const composerId = `chat-composer-${sessionId}`

  return (
    <>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
        role="log"
        aria-label={`Conversation with ${agentName}`}
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-4 text-sm leading-relaxed text-muted-foreground">
            {emptyHint}
          </p>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} agentName={agentName} />
        ))}

        {status === 'submitted' && (
          <div
            role="status"
            className="flex w-fit items-center gap-2.5 rounded-full border border-border bg-card py-1 pr-4 pl-1 text-sm text-muted-foreground shadow-sm"
          >
            <MarbledFluidOrb size={26} speed={1.6} />
            {agentName} is working
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message || 'The agent could not respond.'}
          </p>
        )}
      </div>

      <div
        className="relative shrink-0 border-t border-border bg-card p-3"
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null))
            return
          setDragging(false)
        }}
        onDrop={onDrop}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-seal bg-background/85 text-sm font-medium text-seal">
            Drop to add files to this project
          </div>
        )}

        <div className="flex items-end gap-2 rounded-2xl border border-input bg-background p-2.5 transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
          <label htmlFor={composerId} className="sr-only">
            Message {agentName}
          </label>
          <textarea
            id={composerId}
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
            placeholder={`Message ${agentName}…`}
            className="max-h-32 min-w-0 flex-1 resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || !input.trim()}
            aria-label="Send message"
            className="shrink-0 rounded-full bg-primary p-2 text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Enter to send · Shift + Enter for a new line
        </p>

        {/* A file added here is context for every agent in the project, not an
            attachment to this one message — so it lives below the composer and
            persists across the conversation. */}
        <DocumentAttach projectId={projectId} />

        {dropping && (
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Reading dropped file…
          </p>
        )}
        {dropError && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {dropError}
          </p>
        )}
      </div>
    </>
  )
}

function MessageBubble({
  message,
  agentName,
}: {
  message: UIMessage
  agentName: string
}) {
  const isUser = message.role === 'user'
  const text = message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('')

  // Recorded server-side when the turn was persisted: which project documents
  // were in context, so a re-read conversation shows what it reasoned over.
  const documentNames = message.parts
    .filter((part) => (part as { type: string }).type === 'data-documents')
    .flatMap(
      (part) => (part as { data?: { names?: string[] } }).data?.names ?? [],
    )

  if (!text) return null

  // The user speaks in an ink bubble; the agent answers in plain type beside its
  // mark, the way the workspace's documents read.
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[1.375rem] rounded-br-lg bg-primary px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-primary-foreground">
          {text}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
      >
        {agentName.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap text-foreground">
        <p className="mb-1 text-xs font-medium text-muted-foreground">{agentName}</p>
        {text}
        {documentNames.length > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Reasoned over: {documentNames.join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}
