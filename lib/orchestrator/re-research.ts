import { resolveModelForUser } from '@/lib/ai'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { languageDirective } from '@/lib/i18n/locales'
import type { Locale } from '@/lib/i18n/locales'
import type { OrientationAnswers } from '@/lib/ontology/orientation'
import { generateText } from 'ai'
import { z } from 'zod'
import { researchOnTheWeb, projectContextLines } from './shared'
import { ResearchBrief } from './roster'

export interface ReFollowUp {
  id: string
  prompt: string
  why: string
  researchBasis: string
}

export interface ReResearchResult {
  brief: ResearchBrief
  refinedGoal: string
  refinementNote: string
  stakeholders: string[]
  outOfScope: string[]
  confidence: number
  thinkAloud: string
  /** Whether an answer tripped the canonical re-research trigger. */
  reResearched: boolean
  /** Up to two re-follow-ups, only when re-research ran. */
  reFollowUps: ReFollowUp[]
  researchMethod: 'web-search' | 'model-reasoning'
}

/**
 * Canonical trigger keywords (orientation_protocol.py) plus Japanese
 * equivalents, since answers arrive in the user's locale.
 */
const TRIGGER_KEYWORDS = [
  'new market',
  'different regulation',
  'budget changed',
  'timeline shifted',
  'stakeholder added',
  'scope expanded',
  'country',
  'jurisdiction',
  '新市場',
  '新しい市場',
  '規制',
  '予算',
  '期限',
  'スケジュール',
  '関係者',
  '範囲',
  '国',
  '管轄',
]

export function shouldReResearch(answers: { answer: string }[]): boolean {
  return answers.some((a) => {
    const text = a.answer.toLowerCase()
    return TRIGGER_KEYWORDS.some((k) => text.includes(k))
  })
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
      'The goal restated in one or two sentences: scope, audience, timeframe and the success criterion made explicit wherever the answers supplied them.',
    ),
  refinementNote: z
    .string()
    .describe('One or two sentences on what changed and which answer changed it.'),
  stakeholders: z
    .array(z.string())
    .describe('Who cares about, signs off on, or may push back on this outcome.'),
  outOfScope: z
    .array(z.string())
    .describe('What is explicitly outside this project.'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('0–1: how well the refined goal is grounded in the answers and research.'),
  thinkAloud: z.string().describe('One or two sentences of your reasoning.'),
  reFollowUps: z
    .array(
      z.object({
        prompt: z.string(),
        why: z.string(),
        researchBasis: z
          .string()
          .describe('The specific new finding that prompted this question.'),
      }),
    )
    .max(2)
    .describe('At most two questions raised by the new research. Empty if none.'),
})

/**
 * Phases four and five of the orientation protocol.
 *
 * As in the canonical protocol, the field is only researched again when an
 * answer signals a material change (new market, regulation, budget, timeline,
 * stakeholders, scope, jurisdiction). Then up to two re-follow-ups may be asked.
 * Otherwise the prior brief stands and only the goal is synthesised.
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
  const triggered = shouldReResearch(given)
  const context = [
    projectContextLines(orientation, goal),
    '',
    given.length > 0
      ? `Answers the user gave:\n${given.map((item) => `- ${item.prompt}: ${item.answer}`).join('\n')}`
      : 'The user gave no answers to the follow-up questions.',
  ].join('\n')

  const research = triggered ? await researchOnTheWeb(context) : null
  const researchMethod: ReResearchResult['researchMethod'] = research
    ? 'web-search'
    : triggered
      ? 'model-reasoning'
      : (priorBrief.sources.length > 0 ? 'web-search' : 'model-reasoning')

  const route = await resolveModelForUser(userId)
  const directive = languageDirective(locale)

  const { toolCalls } = await generateText({
    model: route.model,
    ...(directive ? { system: directive } : {}),
    tools: {
      reresearch: {
        description:
          'Return the updated brief, the refined goal, stakeholders, boundaries and confidence.',
        inputSchema: reResearchSchema,
      },
    },
    toolChoice: 'required',
    prompt: `You are the orchestrator for a team of department agents built on the Kojiki ontology.

${context}

${
  triggered
    ? research
      ? `An answer signals a material change, so the field was researched again:\n\n${research}`
      : 'An answer signals a material change. No live web research was available; reason from your own knowledge and leave sources empty.'
    : 'No answer signals a material change. Keep the brief below as it is (copy it through, including sources) and return no reFollowUps.'
}

The first brief, before the answers:
Market — ${priorBrief.marketScan}
Competition — ${priorBrief.competitiveLandscape}
Regulation — ${priorBrief.regulatoryConsiderations}
Risks — ${priorBrief.keyRisks.join('; ')}
Sources — ${priorBrief.sources.join(', ') || 'none'}

Then synthesise the refined goal: clarify scope and constraints, state measurable success criteria, identify key stakeholders, and note boundaries/out-of-scope. Say what changed and give your confidence.${
      directive ? `\n\n${directive}` : ''
    }`,
  })

  const call = toolCalls.find((c) => c.toolName === 'reresearch')
  if (!call) throw new Error('The orchestrator returned no re-research plan')

  const plan = reResearchSchema.parse(call.input)

  return {
    brief: triggered
      ? {
          marketScan: plan.marketScan,
          competitiveLandscape: plan.competitiveLandscape,
          regulatoryConsiderations: plan.regulatoryConsiderations,
          keyRisks: plan.keyRisks,
          sources: research ? plan.sources : [],
          timestamp: new Date().toISOString(),
        }
      : priorBrief,
    refinedGoal: plan.refinedGoal,
    refinementNote: plan.refinementNote,
    stakeholders: plan.stakeholders.slice(0, 10),
    outOfScope: plan.outOfScope.slice(0, 10),
    confidence: plan.confidence,
    thinkAloud: plan.thinkAloud,
    reResearched: triggered,
    reFollowUps: triggered
      ? plan.reFollowUps.slice(0, 2).map((q, i) => ({
          id: `r${i + 1}`,
          ...q,
        }))
      : [],
    researchMethod,
  }
}
