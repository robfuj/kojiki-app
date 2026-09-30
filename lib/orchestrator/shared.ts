import {
  jurisdictionLines,
  type OrientationAnswers,
} from '@/lib/ontology/orientation'
import { generateText } from 'ai'

export const RESEARCH_MODEL =
  process.env.AI_GATEWAY_RESEARCH_MODEL ?? 'perplexity/sonar'

export function contextLines(answers: OrientationAnswers): string {
  const lines = [
    `User: ${answers.userName}`,
    `Goal: ${answers.goal}`,
    `Industry: ${answers.industry}`,
  ]
  lines.push(...jurisdictionLines(answers))
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
export async function researchOnTheWeb(context: string): Promise<string | null> {
  try {
    const { text } = await generateText({
      model: RESEARCH_MODEL,
      temperature: 0.2,
      prompt: `Research the field this goal sits in. Search the live web for current information.

${context}

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

export function projectContextLines(
  orientation: OrientationAnswers,
  goal: string,
): string {
  const lines = [
    `User: ${orientation.userName}`,
    `Company goal: ${orientation.goal}`,
    `Industry: ${orientation.industry}`,
  ]
  lines.push(...jurisdictionLines(orientation))
  if (orientation.geography) lines.push(`Geography: ${orientation.geography}`)
  if (orientation.businessModel) {
    lines.push(`Business model: ${orientation.businessModel}`)
  }
  lines.push(`This project's goal: ${goal}`)
  return lines.join('\n')
}
