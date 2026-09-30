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
 * Mirrors kojiki_core/orientation_protocol.py: questions come from a fixed bank
 * of eight, each tagged with a category. Required questions are always asked;
 * optional ones are asked only when the goal leaves their category unknown. The
 * model never invents questions — it only reports which categories the goal
 * already covers and adapts the bank wording to the goal and locale.
 */
export type ClarifyCategory =
  | 'scope'
  | 'constraints'
  | 'stakeholders'
  | 'success'
  | 'context'

const CATEGORIES = [
  'scope',
  'constraints',
  'stakeholders',
  'success',
  'context',
] as const

interface BankQuestion {
  id: string
  prompt: string
  category: ClarifyCategory
  required: boolean
}

export const CLARIFY_BANK: BankQuestion[] = [
  {
    id: 'c_goal_meaning',
    prompt:
      "You said: '{raw_goal}'. What specifically does that involve? Give a concrete example.",
    category: 'scope',
    required: true,
  },
  {
    id: 'c_goal_trigger',
    prompt: 'What happened recently that made this a priority now?',
    category: 'context',
    required: false,
  },
  {
    id: 'c_success_criteria',
    prompt:
      "Six months from now, what specific metrics or outcomes mean 'this succeeded'?",
    category: 'success',
    required: true,
  },
  {
    id: 'c_constraints',
    prompt:
      "What's absolutely non-negotiable? (Hard budget cap? Regulatory deadline? Team capacity?)",
    category: 'constraints',
    required: true,
  },
  {
    id: 'c_stakeholders',
    prompt:
      'Who else cares about this outcome? Who must sign off? Who might push back?',
    category: 'stakeholders',
    required: true,
  },
  {
    id: 'c_boundaries',
    prompt:
      "What's explicitly OUT of scope? What would make you say 'that's a different project'?",
    category: 'scope',
    required: false,
  },
  {
    id: 'c_decision_context',
    prompt:
      'Is this a one-time decision or ongoing capability? Will you repeat this analysis?',
    category: 'context',
    required: false,
  },
  {
    id: 'c_existing_data',
    prompt:
      'What data or reports do you already have? (CRM, analytics, financials, customer feedback?)',
    category: 'context',
    required: false,
  },
]

const MAX_CLARIFY = 4

export const clarifySchema = z.object({
  thinkAloud: z
    .string()
    .describe('One or two sentences on what the goal already makes clear.'),
  knownCategories: z
    .array(z.enum(CATEGORIES))
    .describe('Categories the goal already answers explicitly.'),
  wording: z
    .array(
      z.object({
        id: z.string(),
        prompt: z.string(),
        why: z.string(),
      }),
    )
    .describe('Every bank question, reworded for this goal, with why it matters.'),
})

export interface ClarifyQuestion {
  id: string
  prompt: string
  why: string
  kind: 'text' | 'textarea'
  required: boolean
  category: ClarifyCategory
}

export interface ClarifyResult {
  questions: ClarifyQuestion[]
  thinkAloud: string
}

export async function runClarifyPhase(input: {
  orientation: OrientationAnswers
  goal: string
  userId: string
  locale?: Locale
}): Promise<ClarifyResult> {
  const { orientation, goal, userId, locale = DEFAULT_LOCALE } = input
  const context = projectContextLines(orientation, goal)
  const route = await resolveModelForUser(userId)
  const bank = CLARIFY_BANK.map((q) => ({
    ...q,
    prompt: q.prompt.replace('{raw_goal}', goal.slice(0, 200)),
  }))

  const { toolCalls } = await generateText({
    model: route.model,
    tools: {
      clarify: {
        description:
          'Report which question categories the goal already covers, and reword each bank question for this goal.',
        inputSchema: clarifySchema,
      },
    },
    toolChoice: 'required',
    prompt: `You are the orchestrator for a team of department agents built on the Kojiki ontology.

${context}

Question bank (id — category — question):
${bank.map((q) => `${q.id} — ${q.category} — ${q.prompt}`).join('\n')}

List the categories the goal already answers explicitly. Then reword every bank question so it refers to this goal concretely, keeping its intent and id. Each "why" says in one sentence what the answer changes.${
      languageDirective(locale) ? `\n\n${languageDirective(locale)}` : ''
    }`,
  })

  const call = toolCalls.find((c) => c.toolName === 'clarify')
  if (!call) throw new Error('The orchestrator returned no clarify plan')
  const plan = clarifySchema.parse(call.input)

  const known = new Set(plan.knownCategories)
  const wording = new Map(plan.wording.map((w) => [w.id, w]))

  const questions = bank
    .filter((q) => q.required || !known.has(q.category))
    .sort((a, b) => Number(b.required) - Number(a.required))
    .slice(0, MAX_CLARIFY)
    .map((q) => {
      const worded = wording.get(q.id)
      return {
        id: q.id,
        prompt: worded?.prompt || q.prompt,
        why: worded?.why || '',
        kind: 'textarea' as const,
        required: q.required,
        category: q.category,
      }
    })

  return { questions, thinkAloud: plan.thinkAloud }
}
