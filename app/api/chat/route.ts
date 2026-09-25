import { getSessionUser } from '@/lib/session'
import { resolveModelForUser } from '@/lib/ai'
import { db } from '@/lib/db'
import {
  chatMessages,
  chatSessions,
  orientationProfiles,
  projectBots,
  projects,
  subAgentTasks,
} from '@/lib/db/schema'
import { documentsForContext } from '@/app/actions/documents'
import { getLocale } from '@/app/actions/settings'
import type { Locale } from '@/lib/i18n/locales'
import type { SuccessCriterion } from '@/lib/kaizen'
import type { ResearchBrief } from '@/lib/orchestrator'
import {
  buildOrchestratorSystemPrompt,
  buildSubAgentSystemPrompt,
  buildSystemPrompt,
  type PromptDocument,
  type SubAgentTaskContext,
} from '@/lib/ontology/prompt'
import type { OrientationAnswers } from '@/lib/ontology/orientation'
import {
  summarizeActiveTasks,
  summarizeOkrTree,
  summarizePendingGates,
  summarizeRecentSignals,
} from '@/lib/workspace-context'
import { convertToModelMessages, streamText, type UIMessage } from 'ai'
import { and, desc, eq } from 'drizzle-orm'

export const maxDuration = 60

interface ChatRequestBody {
  messages: UIMessage[]
  sessionId: string
}

interface ResolvePromptInput {
  chatSession: typeof chatSessions.$inferSelect
  project: typeof projects.$inferSelect
  userId: string
  orientationAnswers: OrientationAnswers | null
  research: ResearchBrief | null
  documents: PromptDocument[]
  locale: Locale
}

/**
 * Picks the system prompt for whichever agent this session belongs to.
 *
 * Three layers, three prompts. The orchestrator coordinates and reports; a
 * department head owns a mandate and routes handoffs; a sub-agent executes
 * within its parent's mandate. Returning null means the session points at an
 * agent that does not exist, which the caller turns into a 404.
 */
async function resolveSystemPrompt(input: ResolvePromptInput): Promise<string | null> {
  const {
    chatSession,
    project,
    userId,
    orientationAnswers,
    research,
    documents,
    locale,
  } = input

  if (chatSession.agentKind === 'orchestrator' || !chatSession.botId) {
    const [okrSummary, pendingGates, recentSignals, activeTasks] = await Promise.all([
      summarizeOkrTree(project.id, userId),
      summarizePendingGates(project.id, userId),
      summarizeRecentSignals(project.id, userId),
      summarizeActiveTasks(project.id, userId),
    ])

    return buildOrchestratorSystemPrompt(
      orientationAnswers,
      project.name,
      project.objective,
      research,
      {
        okrSummary,
        pendingGates,
        recentSignals: [recentSignals, activeTasks].filter(Boolean).join('\n\n') || null,
      },
      documents,
      locale,
    )
  }

  const [bot] = await db
    .select()
    .from(projectBots)
    .where(and(eq(projectBots.id, chatSession.botId), eq(projectBots.userId, userId)))
    .limit(1)

  if (!bot) return null

  if (
    chatSession.agentKind === 'sub_agent' &&
    chatSession.subAgentKey &&
    chatSession.parentSpecialistKey
  ) {
    // When the conversation is scoped to one sub-goal, hand the sub-agent the
    // task it is actually working on so it answers about that work specifically.
    const task = chatSession.objectiveId
      ? await activeTaskFor(chatSession.objectiveId, chatSession.subAgentKey, userId)
      : null

    return buildSubAgentSystemPrompt(
      chatSession.parentSpecialistKey,
      chatSession.subAgentKey,
      orientationAnswers,
      project.name,
      project.objective,
      research,
      task,
      documents,
      locale,
    )
  }

  return buildSystemPrompt(
    {
      specialistKey: bot.specialistKey,
      displayName: bot.displayName,
      mandate: bot.mandate,
    },
    orientationAnswers,
    project.name,
    project.objective,
    research,
    documents,
    locale,
  )
}

/** The task a sub-agent is currently running under a given sub-goal, if any. */
async function activeTaskFor(
  objectiveId: string,
  subAgentKey: string,
  userId: string,
): Promise<SubAgentTaskContext | null> {
  const [task] = await db
    .select({
      title: subAgentTasks.title,
      brief: subAgentTasks.brief,
      successCriteria: subAgentTasks.successCriteria,
    })
    .from(subAgentTasks)
    .where(
      and(
        eq(subAgentTasks.objectiveId, objectiveId),
        eq(subAgentTasks.subAgentKey, subAgentKey),
        eq(subAgentTasks.userId, userId),
      ),
    )
    .orderBy(desc(subAgentTasks.updatedAt))
    .limit(1)

  if (!task) return null

  const criteria = task.successCriteria as SuccessCriterion[]
  const rendered =
    criteria.length > 0
      ? `Success criteria:\n${criteria
          .map((c) => `- ${c.metric} ${c.operator} ${c.target} (weight ${c.weight})`)
          .join('\n')}`
      : 'No success criteria were recorded for this task.'

  return { title: task.title, brief: task.brief, successCriteria: rendered }
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = user.id

  let body: ChatRequestBody
  try {
    body = (await request.json()) as ChatRequestBody
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { messages, sessionId } = body
  if (!sessionId || !Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: 'sessionId and a non-empty messages array are required' },
      { status: 400 },
    )
  }

  // Every lookup is scoped by userId — there is no RLS on Neon, so this is what
  // stops one user from driving another user's bots.
  const [chatSession] = await db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.id, sessionId),
        eq(chatSessions.userId, userId),
      ),
    )
    .limit(1)

  if (!chatSession) {
    return Response.json({ error: 'Session not found' }, { status: 404 })
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, chatSession.projectId),
        eq(projects.userId, userId),
      ),
    )
    .limit(1)

  if (!project) {
    return Response.json({ error: 'Project not found' }, { status: 404 })
  }

  const [orientation] = await db
    .select()
    .from(orientationProfiles)
    .where(eq(orientationProfiles.userId, userId))
    .orderBy(desc(orientationProfiles.createdAt))
    .limit(1)

  const orientationAnswers = orientation
    ? {
        userName: orientation.userName,
        goal: orientation.goal,
        industry: orientation.industry,
        jurisdiction: orientation.jurisdiction,
        geography: orientation.geography,
        businessModel: orientation.businessModel,
      }
    : null
  const research = (orientation?.researchBrief as ResearchBrief | null) ?? null

  // Documents are organisational context, not per-agent context: a pricing sheet
  // uploaded in chat should inform Finance's numbers and Legal's review alike.
  // A failure here must not break the conversation, so it degrades to no documents.
  let documents: PromptDocument[] = []
  try {
    documents = await documentsForContext(project.id)
  } catch (error) {
    console.error(
      '[chat] continuing without document context:',
      error instanceof Error ? error.message : String(error),
    )
  }

  // A conversation is with one agent at one layer. The orchestrator has no bot
  // row; a sub-agent borrows its parent department's bot but gets its own prompt
  // built from the ontology, so the user can talk to the SEO Specialist directly
  // rather than only through the Marketing head.
  // Agent replies follow the reader's language, so the prompt builders need the
  // stored preference rather than anything the client claims.
  const locale = await getLocale()

  const system = await resolveSystemPrompt({
    chatSession,
    project,
    userId,
    orientationAnswers,
    research,
    documents,
    locale,
  })

  if (!system) {
    return Response.json({ error: 'Agent not found' }, { status: 404 })
  }

  const route = await resolveModelForUser(userId)

  const result = streamText({
    model: route.model,
    system,
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onEnd: async ({ messages: finalMessages }) => {
      // Upsert on message id so a retry or a reconnect cannot duplicate turns.
      // The assistant turn also records which documents were in context, so a
      // re-read conversation shows what it reasoned over.
      const documentNames = documents.map((document) => document.name)
      for (const message of finalMessages) {
        const parts =
          message.role === 'assistant' && documentNames.length > 0
            ? ([
                ...message.parts,
                { type: 'data-documents', data: { names: documentNames } },
              ] as UIMessage['parts'])
            : message.parts

        await db
          .insert(chatMessages)
          .values({
            id: message.id,
            userId,
            sessionId,
            role: message.role,
            parts,
          })
          .onConflictDoUpdate({
            target: chatMessages.id,
            set: { parts, role: message.role },
          })
      }

      await db
        .update(chatSessions)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(chatSessions.id, sessionId),
            eq(chatSessions.userId, userId),
          ),
        )
    },
  })
}
