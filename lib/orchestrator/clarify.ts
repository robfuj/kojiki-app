import { resolveModelForUser } from '@/lib/ai'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { languageDirective } from '@/lib/i18n/locales'
import type { Locale } from '@/lib/i18n/locales'
import type { OrientationAnswers } from '@/lib/ontology/orientation'
import { generateText } from 'ai'
import { z } from 'zod'
import { projectContextLines } from './shared'

/**
 * Phase one of the orientation protocol: adaptive clarification.
 *
 * Before the field is researched, the orchestrator reads the goal and asks only
 * what the goal leaves open — scope, audience, timeframe, constraints. A goal
 * that is already specific returns no questions and the protocol moves straight
 * to research, so clarification costs nothing when it has nothing to add.
 */
export const clarifySchema = z.object({
  questions: z
    .array(
      z.object({
        prompt: z.string(),
        why: z.string(),
        kind: z.enum(['text', 'textarea']),
        required: z.boolean(),
      }),
    )
    .max(3),
})

export interface ClarifyQuestion {
  id: string
  prompt: string
  why: string
  kind: 'text' | 'textarea'
  required: boolean
}

export async function runClarifyPhase(input: {
  orientation: OrientationAnswers
  goal: string
  userId: string
  locale?: Locale
}): Promise<ClarifyQuestion[]> {
  const { orientation, goal, userId, locale = DEFAULT_LOCALE } = input
  const context = projectContextLines(orientation, goal)
  const route = await resolveModelForUser(userId)

  const { toolCalls } = await generateText({
    model: route.model,
    tools: {
      clarify: {
        description:
          'Return the clarifying questions to ask before researching this goal, or an empty list when the goal is already specific enough to research.',
        inputSchema: clarifySchema,
      },
    },
    toolChoice: 'required',
    prompt: `You are the orchestrator for a team of department agents built on the Kojiki ontology.

${context}

Read the project goal. Return the questions whose answers you need before the field can be researched well: the scope, the audience, the timeframe, or the constraints the goal leaves open. Do not ask what the goal already states. If the goal is specific enough to research as written, return an empty array. At most three questions, each optional unless the research would be meaningless without it. Each "why" must say what the answer changes.${
      languageDirective(locale) ? `\n\n${languageDirective(locale)}` : ''
    }`,
  })

  const call = toolCalls.find((c) => c.toolName === 'clarify')
  if (!call) throw new Error('The orchestrator returned no clarify plan')

  const plan = clarifySchema.parse(call.input)

  return plan.questions.slice(0, 3).map((question, index) => ({
    id: `c${index + 1}`,
    prompt: question.prompt,
    why: question.why,
    kind: question.kind,
    required: question.required,
  }))
}
