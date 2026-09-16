import { auth } from '@/lib/auth'
import { resolveModel } from '@/lib/ai'
import { db } from '@/lib/db'
import {
  chatMessages,
  chatSessions,
  orientationProfiles,
  projectBots,
  projects,
  subAgentTasks,
} from '@/lib/db/schema'
import type { SuccessCriterion } from '@/lib/kaizen'
import type { ResearchBrief } from '@/lib/orchestrator'
import {
  buildOrchestratorSystemPrompt,
  buildSubAgentSystemPrompt,
  buildSystemPrompt,
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
import { headers } from 'next/headers'

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
  const { chatSession, project, userId, orientationAnswers, research } = input

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
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

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

  // A conversation is with one agent at one layer. The orchestrator has no bot
  // row; a sub-agent borrows its parent department's bot but gets its own prompt
  // built from the ontology, so the user can talk to the SEO Specialist directly
  // rather than only through the Marketing head.
  const system = await resolveSystemPrompt({
    chatSession,
    project,
    userId,
    orientationAnswers,
    research,
  })

  if (!system) {
    return Response.json({ error: 'Agent not found' }, { status: 404 })
  }

  const result = streamText({
    model: resolveModel(),
    system,
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onEnd: async ({ messages: finalMessages }) => {
      // Upsert on message id so a retry or a reconnect cannot duplicate turns.
      for (const message of finalMessages) {
        await db
          .insert(chatMessages)
          .values({
            id: message.id,
            userId,
            sessionId,
            role: message.role,
            parts: message.parts,
          })
          .onConflictDoUpdate({
            target: chatMessages.id,
            set: { parts: message.parts, role: message.role },
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
