import { resolveModelForUser } from '@/lib/ai'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { languageDirective } from '@/lib/i18n/locales'
import type { Locale } from '@/lib/i18n/locales'
import type { OrientationAnswers } from '@/lib/ontology/orientation'
import { generateText } from 'ai'
import { z } from 'zod'
import { researchOnTheWeb, projectContextLines } from './shared'
import { ResearchBrief } from './roster'

export interface ReResearchResult {
  brief: ResearchBrief
  refinedGoal: string
  refinementNote: string
  researchMethod: 'web-search' | 'model-reasoning'
}

export const reResearchSchema = z.object({
  marketScan: z.string(),
  competitiveLandscape: z.string(),
  regulatoryConsiderations: z.string(),
  keyRisks: z.array(z.string()),
  sources: z.array(z.string()),
  refinedGoal: z
    .string()
    .describe(
      'The project goal restated in one or two sentences, sharpened by the answers: scope, audience, timeframe and the criterion for success made explicit wherever the answers supplied them.',
    ),
  refinementNote: z
    .string()
    .describe(
      'One or two sentences on what changed versus the first brief, and which answer changed it.',
    ),
})

/**
 * Phases four and five of the orientation protocol: re-research and refine.
 *
 * The answers the user gave are folded into the research context and the field
 * is researched again, so the brief the project is built on reflects what the
 * user actually said. The same pass restates the goal around those answers —
 * the refined goal becomes the project's root objective.
 */
export async function runReResearchPhase(input: {
  orientation: OrientationAnswers
  goal: string
  clarifyAnswers: { prompt: string; answer: string }[]
  answers: { prompt: string; answer: string }[]
  priorBrief: ResearchBrief
  userId: string
  locale?: Locale
}): Promise<ReResearchResult> {
  const {
    orientation,
    goal,
    clarifyAnswers,
    answers,
    priorBrief,
    userId,
    locale = DEFAULT_LOCALE,
  } = input

  const given = [...clarifyAnswers, ...answers].filter(
    (item) => item.answer.trim().length > 0,
  )
  const context = [
    projectContextLines(orientation, goal),
    '',
    given.length > 0
      ? `Answers the user gave:\n${given.map((item) => `- ${item.prompt}: ${item.answer}`).join('\n')}`
      : 'The user gave no answers to the follow-up questions.',
  ].join('\n')

  const research = await researchOnTheWeb(context)
  const researchMethod: ReResearchResult['researchMethod'] = research
    ? 'web-search'
    : 'model-reasoning'

  const route = await resolveModelForUser(userId)

  const { toolCalls } = await generateText({
    model: route.model,
    tools: {
      reresearch: {
        description:
          'Return the updated research brief and the refined goal statement after the user answered the follow-up questions.',
        inputSchema: reResearchSchema,
      },
    },
    toolChoice: 'required',
    prompt: `You are the orchestrator for a team of department agents built on the Kojiki ontology.

${context}

${
  research
    ? `Live web research on this field:\n\n${research}`
    : 'No live web research was available. Reason from your own knowledge and leave sources empty.'
}

The first brief, before the answers:
Market — ${priorBrief.marketScan}
Competition — ${priorBrief.competitiveLandscape}
Regulation — ${priorBrief.regulatoryConsiderations}

Do two things.

First, update the brief where the answers change it: a stated audience narrows the market scan, a stated timeframe moves the risks, a stated constraint changes the competitive read. Keep what the answers did not touch.

Second, restate the goal in one or two sentences around the answers, and say in one or two sentences what changed versus the first brief.${
      languageDirective(locale) ? `\n\n${languageDirective(locale)}` : ''
    }`,
  })

  const call = toolCalls.find((c) => c.toolName === 'reresearch')
  if (!call) throw new Error('The orchestrator returned no re-research plan')

  const plan = reResearchSchema.parse(call.input)

  return {
    brief: {
      marketScan: plan.marketScan,
      competitiveLandscape: plan.competitiveLandscape,
      regulatoryConsiderations: plan.regulatoryConsiderations,
      keyRisks: plan.keyRisks,
      sources: research ? plan.sources : [],
    },
    refinedGoal: plan.refinedGoal,
    refinementNote: plan.refinementNote,
    researchMethod,
  }
}
