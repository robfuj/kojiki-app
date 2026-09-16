/**
 * The Orientation Protocol, transcribed from
 * engine/kojiki_core/prompts/orientation.md in robfuj/kojiki-ontology.
 *
 * "Before any decision work, the agent must orient: establish identity, learn
 * the operating context, and discover sibling agents so the organization's
 * functions can coordinate."
 *
 * This runs on first contact, before the workspace opens.
 */

import { SPECIALISTS, type Specialist } from './specialists'
import { SYNAPSIS_STAGES } from './synapsis'

export interface OrientationQuestion {
  id: string
  label: string
  prompt: string
  captures: string[]
  flowsTo: string
  fields: OrientationField[]
}

export interface OrientationField {
  name: string
  label: string
  kind: 'text' | 'select'
  placeholder?: string
  options?: string[]
  required?: boolean
}

/** The organizational function lines a registering agent can represent (Q1). */
export const FUNCTION_LINES = SPECIALISTS.map((s) => ({
  value: s.key,
  label: s.department,
  description: s.description,
}))

export const ORIENTATION_QUESTIONS: OrientationQuestion[] = [
  {
    id: 'q1',
    label: 'Q1 — Identity',
    prompt: 'What should I call you, and which organizational function do you represent?',
    captures: ['agent_name', 'function_line'],
    flowsTo: 'decision-rights/ (owner/role), ontology/functions.md',
    fields: [
      { name: 'agentName', label: 'Agent name', kind: 'text', placeholder: 'e.g. Rei', required: true },
      { name: 'functionLine', label: 'Function line', kind: 'select', options: FUNCTION_LINES.map((f) => f.value), required: true },
    ],
  },
  {
    id: 'q2',
    label: 'Q2 — Field',
    prompt: 'What industry or sector is the organization in?',
    captures: ['industry', 'sector'],
    flowsTo: "triggers the agent's research team: market/competitive/regulatory scan of the field",
    fields: [
      { name: 'industry', label: 'Industry', kind: 'text', placeholder: 'e.g. Financial services', required: true },
      { name: 'sector', label: 'Sector', kind: 'text', placeholder: 'e.g. Payments infrastructure' },
    ],
  },
  {
    id: 'q3',
    label: 'Q3 — Jurisdiction',
    prompt: 'What jurisdiction(s) apply — which country, region/state, and regulatory regime?',
    captures: ['country', 'region', 'regulatory_regime'],
    flowsTo: 'Legal/Compliance research; any decision with legal exposure; ontology/ (geography axis)',
    fields: [
      { name: 'country', label: 'Country', kind: 'text', placeholder: 'e.g. Japan', required: true },
      { name: 'region', label: 'Region / state', kind: 'text', placeholder: 'e.g. Kanto' },
      { name: 'regulatoryRegime', label: 'Regulatory regime', kind: 'text', placeholder: 'e.g. FSA / APPI' },
    ],
  },
  {
    id: 'q4',
    label: 'Q4 — Operating context',
    prompt: 'What geography do you operate in, and what is the business model?',
    captures: ['geography', 'business_model'],
    flowsTo: 'ontology/ (adaptation axes, S20); scopes the canonical ontology to the real org',
    fields: [
      { name: 'geography', label: 'Geography', kind: 'text', placeholder: 'e.g. JP domestic, expanding APAC' },
      { name: 'businessModel', label: 'Business model', kind: 'text', placeholder: 'e.g. B2B SaaS, usage-based' },
    ],
  },
  {
    id: 'q5',
    label: 'Q5 — Siblings',
    prompt: 'Are other agents from this same group already running? Register me so we can hand off.',
    captures: ['group_id', 'sibling_agents'],
    flowsTo: 'handoffs/ (Cross-Functional Handoff Standard, S11); enables agent-to-agent messaging',
    fields: [
      { name: 'groupId', label: 'Group ID', kind: 'text', placeholder: 'e.g. kojiki-core' },
    ],
  },
]

export interface OrientationAnswers {
  agentName: string
  functionLine: string
  industry?: string | null
  sector?: string | null
  country?: string | null
  region?: string | null
  regulatoryRegime?: string | null
  geography?: string | null
  businessModel?: string | null
  groupId?: string | null
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
 * Derives a project's bot roster from the Orientation Protocol answers.
 *
 * The registering agent's function line (Q1) becomes the primary bot and is
 * placed first. Departments it hands off to come next, so the side rail reads
 * in routing order. The remaining functions follow, keeping the whole org
 * addressable per the Cross-Functional Handoff Standard.
 */
export function deriveRoster(orientation: OrientationAnswers): DerivedBot[] {
  const primary = SPECIALISTS.find((s) => s.key === orientation.functionLine)
  const handoffOrder = primary?.handoffs.map((h) => h.target) ?? []

  const ordered = [
    ...(primary ? [primary] : []),
    ...handoffOrder
      .map((key) => SPECIALISTS.find((s) => s.key === key))
      .filter((s): s is Specialist => Boolean(s)),
    ...SPECIALISTS.filter(
      (s) => s.key !== primary?.key && !handoffOrder.includes(s.key),
    ),
  ]

  return ordered.map((specialist, position) => ({
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
    isPrimary: specialist.key === primary?.key,
  }))
}

/**
 * The orientation context injected into every bot's system prompt, so each
 * department reasons about the same real organization rather than a generic one.
 */
export function orientationContext(orientation: OrientationAnswers): string {
  const lines = [
    `Registering agent: ${orientation.agentName}`,
    `Function line: ${orientation.functionLine}`,
  ]
  if (orientation.industry) lines.push(`Industry: ${orientation.industry}`)
  if (orientation.sector) lines.push(`Sector: ${orientation.sector}`)
  if (orientation.country) lines.push(`Country: ${orientation.country}`)
  if (orientation.region) lines.push(`Region: ${orientation.region}`)
  if (orientation.regulatoryRegime) {
    lines.push(`Regulatory regime: ${orientation.regulatoryRegime}`)
  }
  if (orientation.geography) lines.push(`Geography: ${orientation.geography}`)
  if (orientation.businessModel) {
    lines.push(`Business model: ${orientation.businessModel}`)
  }
  if (orientation.groupId) lines.push(`Group ID: ${orientation.groupId}`)
  return lines.join('\n')
}
