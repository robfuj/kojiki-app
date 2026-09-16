/**
 * The Orientation Protocol.
 *
 * Upstream (engine/kojiki_core/prompts/orientation.md) frames orientation as an
 * agent establishing its own identity on a function line. In this product the
 * human is the user and the functions are the sibling agents, so the protocol
 * asks about the user: their name, their goal, and their industry. The
 * orchestrator then researches that goal and industry and selects which
 * canonical specialists the goal needs — the roster follows from the goal
 * rather than from a function the human declares.
 */

import { SPECIALISTS, type Specialist } from './specialists'
import { SYNAPSIS_STAGES } from './synapsis'

export interface OrientationField {
  name: string
  label: string
  kind: 'text' | 'textarea'
  placeholder?: string
  required?: boolean
}

export interface OrientationQuestion {
  id: string
  label: string
  prompt: string
  /** Why the agents need this answer — shown beside the question. */
  why: string
  fields: OrientationField[]
}

export const ORIENTATION_QUESTIONS: OrientationQuestion[] = [
  {
    id: 'q1',
    label: 'Q1 — Identity',
    prompt: 'What should the agents call you?',
    why: 'Every department agent addresses you by this name and attributes its recommendations to you.',
    fields: [
      {
        name: 'userName',
        label: 'Your name',
        kind: 'text',
        placeholder: 'e.g. Rei',
        required: true,
      },
    ],
  },
  {
    id: 'q2',
    label: 'Q2 — Goal',
    prompt: 'What are you trying to accomplish?',
    why: 'The orchestrator reads this goal to research the field and to decide which specialists it needs. The roster follows from the goal.',
    fields: [
      {
        name: 'goal',
        label: 'Your goal',
        kind: 'textarea',
        placeholder: 'e.g. Double APAC freight revenue by the end of FY27 without adding headcount',
        required: true,
      },
    ],
  },
  {
    id: 'q3',
    label: 'Q3 — Industry',
    prompt: 'What industry are you in?',
    why: 'The orchestrator researches this industry — market, competitors, regulation — before any sibling answers you.',
    fields: [
      {
        name: 'industry',
        label: 'Industry',
        kind: 'text',
        placeholder: 'e.g. Logistics and freight forwarding',
        required: true,
      },
    ],
  },
  {
    id: 'q4',
    label: 'Q4 — Context',
    prompt: 'Anything else the orchestrator should know? All of this is optional.',
    why: 'Sharper research and better specialist selection. Skip anything that does not apply.',
    fields: [
      {
        name: 'jurisdiction',
        label: 'Jurisdiction',
        kind: 'text',
        placeholder: 'e.g. Japan, expanding into Singapore',
      },
      {
        name: 'geography',
        label: 'Geography',
        kind: 'text',
        placeholder: 'e.g. JP domestic today, APAC next',
      },
      {
        name: 'businessModel',
        label: 'Business model',
        kind: 'text',
        placeholder: 'e.g. B2B, asset-light forwarding',
      },
    ],
  },
]

export interface OrientationAnswers {
  userName: string
  goal: string
  industry: string
  jurisdiction?: string | null
  geography?: string | null
  businessModel?: string | null
}

export interface DerivedBot {
  specialistKey: string
  displayName: string
  functionLine: string
  mandate: string
  decisionRights: Specialist['decisionRights']
  handoffTargets: { target: string; trigger: string }[]
  synapsisStages: string[]
  position: number
  isPrimary: boolean
}

/**
 * Builds the roster from the specialist keys the orchestrator selected for this
 * goal. Only those specialists are instantiated — a goal that needs no legal
 * exposure gets no Legal agent.
 *
 * Ordering follows the handoff graph: the orchestrator's first pick leads, then
 * the selected specialists it hands off to, then the remainder. The side rail
 * therefore reads in routing order.
 */
export function deriveRoster(selectedKeys: string[]): DerivedBot[] {
  const selected = selectedKeys
    .map((key) => SPECIALISTS.find((s) => s.key === key))
    .filter((s): s is Specialist => Boolean(s))

  if (selected.length === 0) return []

  const lead = selected[0]
  const handoffOrder = lead.handoffs.map((h) => h.target)

  const ordered = [
    lead,
    ...handoffOrder
      .map((key) => selected.find((s) => s.key === key))
      .filter((s): s is Specialist => s !== undefined && s.key !== lead.key),
    ...selected.filter(
      (s) => s.key !== lead.key && !handoffOrder.includes(s.key),
    ),
  ]

  // The handoff pass can repeat a specialist already placed; keep first occurrence.
  const seen = new Set<string>()
  const unique = ordered.filter((s) => {
    if (seen.has(s.key)) return false
    seen.add(s.key)
    return true
  })

  return unique.map((specialist, position) => ({
    specialistKey: specialist.key,
    displayName: specialist.department,
    functionLine: specialist.key,
    mandate: specialist.description,
    decisionRights: specialist.decisionRights,
    handoffTargets: specialist.handoffs.map((h) => ({
      target: h.target,
      trigger: h.trigger,
    })),
    synapsisStages: SYNAPSIS_STAGES.map((s) => s.key),
    position,
    isPrimary: specialist.key === lead.key,
  }))
}

/**
 * The user context injected into every agent's system prompt, so each sibling
 * reasons about the same real person and the same real goal.
 */
export function orientationContext(orientation: OrientationAnswers): string {
  const lines = [
    `User: ${orientation.userName}`,
    `Goal: ${orientation.goal}`,
    `Industry: ${orientation.industry}`,
  ]
  if (orientation.jurisdiction) {
    lines.push(`Jurisdiction: ${orientation.jurisdiction}`)
  }
  if (orientation.geography) lines.push(`Geography: ${orientation.geography}`)
  if (orientation.businessModel) {
    lines.push(`Business model: ${orientation.businessModel}`)
  }
  return lines.join('\n')
}
