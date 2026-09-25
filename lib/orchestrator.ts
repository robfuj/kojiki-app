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

import { resolveModelForUser } from '@/lib/ai'
import {
  DEFAULT_LOCALE,
  languageDirective,
  type Locale,
} from '@/lib/i18n/locales'
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
async function researchOnTheWeb(context: string): Promise<string | null> {
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

function projectContextLines(
  orientation: OrientationAnswers,
  goal: string,
): string {
  const lines = [
    `User: ${orientation.userName}`,
    `Company goal: ${orientation.goal}`,
    `Industry: ${orientation.industry}`,
  ]
  if (orientation.jurisdiction) {
    lines.push(`Jurisdiction: ${orientation.jurisdiction}`)
  }
  if (orientation.geography) lines.push(`Geography: ${orientation.geography}`)
  if (orientation.businessModel) {
    lines.push(`Business model: ${orientation.businessModel}`)
  }
  lines.push(`This project's goal: ${goal}`)
  return lines.join('\n')
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
    },
    rosterKeys,
    rosterRationale: plan.rosterRationale,
    // Capped so a verbose model cannot turn the intake into a long form.
    questions: plan.questions.slice(0, 5).map((question, index) => ({
      id: `q${index + 1}`,
      prompt: question.prompt,
      why: question.why,
      kind: question.kind,
      required: question.required,
    })),
    researchMethod,
  }
}

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

/**
 * The periodic whole-project review.
 *
 * The orchestrator reads a digest of the project's real state — objectives,
 * tasks and their verdicts, open gates, recent agent traffic — and returns what
 * each department found plus what it recommends doing. It reasons over rows the
 * runtime already holds rather than over an agent's own claims, so a finding is
 * only as strong as the record behind it.
 */
export const orchestratorReviewSchema = z.object({
  findings: z
    .array(
      z.object({
        department: z
          .string()
          .describe(
            'Display name of the department this finding belongs to, exactly as written in the digest, or "Orchestrator" for a cross-cutting finding.',
          ),
        severity: z.enum(['info', 'attention', 'critical']),
        summary: z.string().describe('The finding in one line.'),
        detail: z
          .string()
          .describe(
            'Two or three sentences citing the specific objectives, tasks, gates or signals from the digest that support it.',
          ),
      }),
    )
    .describe('Three to eight findings, most severe first.'),
  actions: z
    .array(
      z.object({
        label: z
          .string()
          .describe('Short imperative button label, e.g. "Ask Legal about the import licence".'),
        kind: z.enum(['ask_department', 'create_decision', 'open_objective']),
        targetId: z
          .string()
          .nullable()
          .describe(
            'The objective id for open_objective, taken from the digest. Null for the other kinds.',
          ),
        departmentName: z
          .string()
          .nullable()
          .describe(
            'For ask_department, the display name of the department to open a conversation with. Null otherwise.',
          ),
      }),
    )
    .describe('Two to five recommended actions the user can take right now.'),
})

export type OrchestratorReview = z.infer<typeof orchestratorReviewSchema>

export async function runOrchestratorReview(input: {
  digest: string
  userId: string
  locale?: Locale
}): Promise<OrchestratorReview> {
  const route = await resolveModelForUser(input.userId)
  const directive = languageDirective(input.locale ?? DEFAULT_LOCALE)

  const { toolCalls } = await generateText({
    model: route.model,
    tools: {
      review: {
        description:
          'Return the department findings and recommended actions for this project review.',
        inputSchema: orchestratorReviewSchema,
      },
    },
    toolChoice: 'required',
    prompt: `You are the orchestrator for a team of department agents built on the Kojiki ontology. Review the project state below and report what matters.

${input.digest}

Rules:
- Every finding must cite something that actually appears in the digest — an objective, a task and its verdict, a gate, or a signal. Do not invent work that is not listed.
- A department only gets a finding when the digest shows work or exposure belonging to it; otherwise the finding belongs to "Orchestrator".
- Severity: critical means blocked or at risk of failing, attention means slipping or unverified, info means healthy and worth knowing.
- Recommended actions must be things the user can do in this workspace: open a conversation with a department, record a decision, or open an objective. For open_objective, copy the objective id exactly as written in the digest.${directive ? `\n\n${directive}` : ''}`,
  })

  const call = toolCalls.find((c) => c.toolName === 'review')
  if (!call) throw new Error('The orchestrator returned no review')

  const review = orchestratorReviewSchema.parse(call.input)
  return {
    findings: review.findings.slice(0, 8),
    actions: review.actions.slice(0, 5),
  }
}
