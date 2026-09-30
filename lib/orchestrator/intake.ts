import { resolveModelForUser } from '@/lib/ai'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { languageDirective } from '@/lib/i18n/locales'
import type { Locale } from '@/lib/i18n/locales'
import type { OrientationAnswers } from '@/lib/ontology/orientation'
import { SPECIALISTS } from '@/lib/ontology/specialists'
import { generateText } from 'ai'
import { z } from 'zod'
import { researchOnTheWeb, projectContextLines } from './shared'
import { ResearchBrief } from './roster'

/**
 * Project intake.
 *
 * A new project starts here rather than with a name field, because the useful
 * output is not a project row — it is the orchestrator reading the goal, saying
 * what it knows about the field, and asking the questions whose answers change
 * the plan. The user sees the rundown and answers the questions before anything
 * is written, so the tree that gets built is the one they agreed to.
 *
 * The roster is selected per project rather than inherited from orientation:
 * doubling freight revenue and launching a podcast need different specialists
 * even inside the same company.
 */
export const projectIntakeSchema = z.object({
  marketScan: z
    .string()
    .describe(
      'What the market for this specific project goal looks like now: size, direction, and the forces moving it.',
    ),
  competitiveLandscape: z
    .string()
    .describe(
      'Who competes for this goal, how they are positioned, and where the opening is.',
    ),
  regulatoryConsiderations: z
    .string()
    .describe(
      'The regulatory and compliance exposure this goal carries. Say so plainly when there is none.',
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
      'The specialist keys this project needs, most central first. Only keys from the catalog.',
    ),
  rosterRationale: z
    .string()
    .describe(
      'One or two sentences on why these specialists and not the others, tied to this goal.',
    ),
  questions: z
    .array(
      z.object({
        prompt: z
          .string()
          .describe(
            'The question, in plain language, answerable in a sentence or two.',
          ),
        why: z
          .string()
          .describe(
            'One sentence on how the answer changes the plan. Never a restatement of the question.',
          ),
        researchBasis: z
          .string()
          .describe(
            'The specific research finding that prompted this question.',
          ),
        kind: z.enum(['text', 'textarea']),
        required: z.boolean(),
      }),
    )
    .describe(
      'Three to five questions whose answers would materially change the decomposition. Ask only what the goal leaves genuinely open — a goal that already states its budget must not be asked for one.',
    ),
})

export type ProjectIntakePlan = z.infer<typeof projectIntakeSchema>

export interface IntakeQuestion {
  id: string
  prompt: string
  why: string
  researchBasis: string
  kind: 'text' | 'textarea'
  required: boolean
}

export interface ProjectIntakeResult {
  brief: ResearchBrief
  rosterKeys: string[]
  rosterRationale: string
  questions: IntakeQuestion[]
  researchMethod: 'web-search' | 'model-reasoning'
}

export async function runProjectIntake(input: {
  orientation: OrientationAnswers
  goal: string
  userId: string
  locale?: Locale
  /** Phase one's answers, so research starts from what the user clarified. */
  clarifyAnswers?: { prompt: string; answer: string }[]
}): Promise<ProjectIntakeResult> {
  const { orientation, goal, userId, locale = DEFAULT_LOCALE } = input
  const clarified = (input.clarifyAnswers ?? []).filter(
    (item) => item.answer.trim().length > 0,
  )
  const context = [
    projectContextLines(orientation, goal),
    ...(clarified.length > 0
      ? [
          '',
          `Answers the user already gave:\n${clarified
            .map((item) => `- ${item.prompt}: ${item.answer}`)
            .join('\n')}`,
        ]
      : []),
  ].join('\n')

  const research = await researchOnTheWeb(context)
  const researchMethod: ProjectIntakeResult['researchMethod'] = research
    ? 'web-search'
    : 'model-reasoning'

  const catalog = SPECIALISTS.map(
    (s) => `- ${s.key}: ${s.department} — ${s.description}`,
  ).join('\n')

  const route = await resolveModelForUser(userId)

  const { toolCalls } = await generateText({
    model: route.model,
    tools: {
      intake: {
        description:
          'Return the research brief for this project goal, the specialists it needs, and the clarifying questions to ask before planning.',
        inputSchema: projectIntakeSchema,
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

Specialist catalog — the only specialists you may select from:
${catalog}

Do two things.

First, select the specialists this project actually needs. Do not select all of them by default: a goal with no legal exposure needs no legal specialist. Order them most central first. Every key you return must appear in the catalog above.

Second, ask the three to five questions whose answers would materially change how this goal is decomposed. Ask only what the goal leaves genuinely open. If the goal already states its budget, timeline or audience, do not ask for it again. At most one question may be required; the rest are optional so the user can move quickly. Each question's "why" must say how the answer changes the plan.${
    languageDirective(locale) ? `\n\n${languageDirective(locale)}` : ''
  }`,
  })

  const call = toolCalls.find((c) => c.toolName === 'intake')
  if (!call) throw new Error('The orchestrator returned no intake plan')

  const plan = projectIntakeSchema.parse(call.input)

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
      sources: research ? plan.sources : [],
      timestamp: new Date().toISOString(),
    },
    rosterKeys,
    rosterRationale: plan.rosterRationale,
    // Capped so a verbose model cannot turn the intake into a long form.
    questions: plan.questions.slice(0, 5).map((question, index) => ({
      id: `q${index + 1}`,
      prompt: question.prompt,
      why: question.why,
      researchBasis: question.researchBasis,
      kind: question.kind,
      required: question.required,
    })),
    researchMethod,
  }
}
