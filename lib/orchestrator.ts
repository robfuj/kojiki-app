/**
 * The orchestrator runs between the Orientation Protocol and the workspace.
 *
 * It takes the user's goal and industry, researches the field on the live web,
 * then decides which of the canonical specialists that goal actually needs.
 * The roster is a consequence of the goal rather than a fixed eight-department
 * org chart instantiated for every project.
 *
 * Two steps, because the Gateway's search model supports no tool calls:
 *   1. perplexity/sonar retrieves live market, competitive, and regulatory
 *      context and returns it as prose with inline citations.
 *   2. A tool-capable model structures that prose into a brief and selects the
 *      roster from the ontology catalog.
 *
 * If the search model is unavailable (the Gateway free tier restricts it), step
 * one is skipped and step two reasons from its own knowledge. The result records
 * which path ran so the UI can be honest about provenance.
 */

import { resolveModel } from '@/lib/ai'
import type { OrientationAnswers } from '@/lib/ontology/orientation'
import { SPECIALISTS } from '@/lib/ontology/specialists'
import { generateText } from 'ai'
import { z } from 'zod'

const RESEARCH_MODEL =
  process.env.AI_GATEWAY_RESEARCH_MODEL ?? 'perplexity/sonar'

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
}

export interface OrchestratorResult {
  brief: ResearchBrief
  rosterKeys: string[]
  rosterRationale: string
  researchMethod: 'web-search' | 'model-reasoning'
}

function contextLines(answers: OrientationAnswers): string {
  const lines = [
    `User: ${answers.userName}`,
    `Goal: ${answers.goal}`,
    `Industry: ${answers.industry}`,
  ]
  if (answers.jurisdiction) lines.push(`Jurisdiction: ${answers.jurisdiction}`)
  if (answers.geography) lines.push(`Geography: ${answers.geography}`)
  if (answers.businessModel) {
    lines.push(`Business model: ${answers.businessModel}`)
  }
  return lines.join('\n')
}

/**
 * Live web research. Returns null when the search model is unavailable so the
 * caller can fall back to model reasoning instead of failing orientation.
 */
async function researchOnTheWeb(
  answers: OrientationAnswers,
): Promise<string | null> {
  try {
    const { text } = await generateText({
      model: RESEARCH_MODEL,
      temperature: 0.2,
      prompt: `Research the field this goal sits in. Search the live web for current information.

${contextLines(answers)}

Cover four things, with a short headed section for each:
1. Market — size, growth direction, and the forces currently moving it.
2. Competition — who is competing for this goal and how they are positioned.
3. Regulation — the compliance exposure this goal carries, naming the regimes that apply.
4. Risks — what most often derails a goal like this.

Cite the URLs you used inline as [n] and list them at the end. Be specific and current; prefer named companies, figures, and regulations over generalities.`,
    })

    const trimmed = text.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch (error) {
    console.log(
      '[v0] orchestrator web research unavailable, falling back to model reasoning:',
      error instanceof Error ? error.message : String(error),
    )
    return null
  }
}

/**
 * Runs the orchestrator: research the goal and industry, then select the
 * specialists the goal needs from the canonical catalog.
 */
export async function runOrchestrator(
  answers: OrientationAnswers,
): Promise<OrchestratorResult> {
  const research = await researchOnTheWeb(answers)
  const researchMethod: OrchestratorResult['researchMethod'] = research
    ? 'web-search'
    : 'model-reasoning'

  const catalog = SPECIALISTS.map(
    (s) => `- ${s.key}: ${s.department} — ${s.description}`,
  ).join('\n')

  const { toolCalls } = await generateText({
    model: resolveModel(),
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

Select the specialists this goal actually needs. Do not select all of them by default: a goal with no legal exposure needs no legal specialist, and a goal with no marketing surface needs no marketing specialist. Order them most central to the goal first. Every key you return must appear in the catalog above.`,
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
