import { auth } from '@/lib/auth'
import { resolveModel } from '@/lib/ai'
import { db } from '@/lib/db'
import {
  chatMessages,
  chatSessions,
  orientationProfiles,
  projectBots,
  projects,
} from '@/lib/db/schema'
import { buildSystemPrompt } from '@/lib/ontology/prompt'
import { convertToModelMessages, streamText, type UIMessage } from 'ai'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'

export const maxDuration = 60

interface ChatRequestBody {
  messages: UIMessage[]
  sessionId: string
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

  const [bot] = await db
    .select()
    .from(projectBots)
    .where(
      and(
        eq(projectBots.id, chatSession.botId),
        eq(projectBots.userId, userId),
      ),
    )
    .limit(1)

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

  if (!bot || !project) {
    return Response.json({ error: 'Project or bot not found' }, { status: 404 })
  }

  const [orientation] = await db
    .select()
    .from(orientationProfiles)
    .where(eq(orientationProfiles.userId, userId))
    .orderBy(desc(orientationProfiles.createdAt))
    .limit(1)

  const system = buildSystemPrompt(
    {
      specialistKey: bot.specialistKey,
      displayName: bot.displayName,
      mandate: bot.mandate,
    },
    orientation
      ? {
          agentName: orientation.agentName,
          functionLine: orientation.functionLine,
          industry: orientation.industry,
          sector: orientation.sector,
          country: orientation.country,
          region: orientation.region,
          regulatoryRegime: orientation.regulatoryRegime,
          geography: orientation.geography,
          businessModel: orientation.businessModel,
          groupId: orientation.groupId,
        }
      : null,
    project.name,
    project.objective,
  )

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
