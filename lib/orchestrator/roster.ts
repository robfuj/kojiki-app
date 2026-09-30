import { resolveModelForUser } from '@/lib/ai'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { languageDirective } from '@/lib/i18n/locales'
import type { Locale } from '@/lib/i18n/locales'
import type { OrientationAnswers } from '@/lib/ontology/orientation'
import { SPECIALISTS } from '@/lib/ontology/specialists'
import { generateText } from 'ai'
import { z } from 'zod'
import { contextLines, researchOnTheWeb } from './shared'

export const orchestratorSchema = z.object({
  marketScan: z
    .string()
    .describe(
      'What the market for this goal looks like right now: size, direction, and the forces moving it.',
    ),
  competitiveLandscape: z
    .string()
    .describe(
      'Who competes for this goal, how they are positioned, and where the gap is.',
    ),
  regulatoryConsiderations: z
    .string()
    .describe(
      'The regulatory and compliance exposure this goal carries in the stated jurisdiction.',
    ),
  keyRisks: z
    .array(z.string())
    .describe('The three to five risks most likely to derail this goal.'),
  sources: z
    .array(z.string())
    .describe(
      'URLs cited by the research. Empty when the research came from model reasoning rather than the web.',
    ),
  rosterKeys: z
    .array(z.string())
    .describe(
      'The specialist keys this goal needs, most central first. Only keys from the catalog.',
    ),
  rosterRationale: z
    .string()
    .describe(
      'One or two sentences on why these specialists and not the others, tied to the goal.',
    ),
})

export type OrchestratorPlan = z.infer<typeof orchestratorSchema>

export interface ResearchBrief {
  marketScan: string
  competitiveLandscape: string
  regulatoryConsiderations: string
  keyRisks: string[]
  sources: string[]
  /** ISO time the brief was produced (canonical ResearchBrief.timestamp). */
  timestamp?: string
}

export interface OrchestratorResult {
  brief: ResearchBrief
  rosterKeys: string[]
  rosterRationale: string
  researchMethod: 'web-search' | 'model-reasoning'
}

/**
 * Runs the orchestrator: research the goal and industry, then select the
 * specialists the goal needs from the canonical catalog.
 */
export async function runOrchestrator(
  answers: OrientationAnswers,
  userId: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<OrchestratorResult> {
  const research = await researchOnTheWeb(contextLines(answers))
  const researchMethod: OrchestratorResult['researchMethod'] = research
    ? 'web-search'
    : 'model-reasoning'

  const catalog = SPECIALISTS.map(
    (s) => `- ${s.key}: ${s.department} — ${s.description}`,
  ).join('\n')

  // The orchestrator runs on the user's connected provider when they have one, so
  // a paid key is actually used rather than silently falling back to the free tier.
  const route = await resolveModelForUser(userId)

  const { toolCalls } = await generateText({
    model: route.model,
    // A trailing directive loses to pages of English web research, so the
    // output language is also pinned as the system instruction.
    system: languageDirective(locale) ?? undefined,
    tools: {
      orchestrate: {
        description:
          'Return the research brief for this goal and the specialists it needs.',
        inputSchema: orchestratorSchema,
      },
    },
    toolChoice: 'required',
    prompt: `You are the orchestrator for a team of department agents built on the Kojiki ontology.

${contextLines(answers)}

${
  research
    ? `Live web research on this field:\n\n${research}`
    : 'No live web research was available. Reason from your own knowledge and leave sources empty.'
}

Specialist catalog — the only specialists you may select from:
${catalog}

Select the specialists this goal actually needs. Do not select all of them by default: a goal with no legal exposure needs no legal specialist, and a goal with no marketing surface needs no marketing specialist. Order them most central to the goal first. Every key you return must appear in the catalog above.${
    languageDirective(locale) ? `\n\n${languageDirective(locale)}` : ''
  }`,
  })

  const call = toolCalls.find((c) => c.toolName === 'orchestrate')
  if (!call) throw new Error('The orchestrator returned no plan')

  const plan = orchestratorSchema.parse(call.input)

  // The model can invent keys; keep only ones the ontology actually defines.
  const validKeys = new Set(SPECIALISTS.map((s) => s.key))
  const rosterKeys = plan.rosterKeys.filter((key) => validKeys.has(key))

  if (rosterKeys.length === 0) {
    throw new Error('The orchestrator selected no specialists for this goal')
  }

  return {
    brief: {
      marketScan: plan.marketScan,
      competitiveLandscape: plan.competitiveLandscape,
      regulatoryConsiderations: plan.regulatoryConsiderations,
      keyRisks: plan.keyRisks,
      // Only keep sources when the research actually came from the web.
      sources: research ? plan.sources : [],
    },
    rosterKeys,
    rosterRationale: plan.rosterRationale,
    researchMethod,
  }
}
