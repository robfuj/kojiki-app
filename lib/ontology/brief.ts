import type { DecisionRightVerb, Specialist, SubAgent } from './generated'
import { getSpecialist } from './specialists'

/**
 * A sub-agent's ontology entry IS its job description. Its skills say what it can
 * do, its tools say what it may reach for, and its decision rights say how far it
 * may go without asking. Assembling those into a brief is what lets a department
 * head hand work to a sub-agent without inventing a role on the spot — and what
 * keeps the sub-agent inside the authority the ontology actually granted it.
 */

const VERB_LABELS: Record<DecisionRightVerb, string> = {
  own: 'You own',
  approve: 'You approve',
  execute: 'You execute',
  automate: 'You may automate',
  recommend: 'You recommend (you do not decide)',
  consult: 'You must be consulted on',
  escalate: 'You escalate',
}

// Ordered so the brief reads from strongest authority to weakest.
const VERB_ORDER: DecisionRightVerb[] = [
  'own',
  'approve',
  'execute',
  'automate',
  'recommend',
  'consult',
  'escalate',
]

function bulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n')
}

function decisionRightsBlock(rights: SubAgent['decisionRights']): string {
  const lines = VERB_ORDER.flatMap((verb) => {
    const items = rights[verb] ?? []
    if (items.length === 0) return []
    return [`${VERB_LABELS[verb]}:`, bulletList(items)]
  })

  return lines.length > 0 ? lines.join('\n') : '- None granted; ask before acting.'
}

/** The standing job description for a sub-agent, independent of any one task. */
export function subAgentJobDescription(sub: SubAgent): string {
  const parent = getSpecialist(sub.parentSpecialistKey)
  const department = parent?.department ?? sub.parentDepartment

  return [
    `ROLE: ${sub.title}`,
    `DEPARTMENT: ${department}`,
    sub.description ? `MISSION: ${sub.description}` : null,
    '',
    'SKILLS YOU ARE EXPECTED TO EXERCISE:',
    sub.skills.length > 0 ? bulletList(sub.skills) : '- None declared.',
    '',
    'TOOLS AT YOUR DISPOSAL:',
    sub.tools.length > 0 ? bulletList(sub.tools) : '- None declared.',
    '',
    'DECISION RIGHTS — the limit of your authority:',
    decisionRightsBlock(sub.decisionRights),
  ]
    .filter((line) => line !== null)
    .join('\n')
}

export interface BriefContext {
  taskTitle: string
  objectiveTitle: string
  projectObjective?: string | null
  /** What the department head wants back, in its own words. */
  instruction?: string | null
}

/**
 * The brief a department head hands a sub-agent: the standing job description
 * plus the specific assignment. This is the text stored on the task and used as
 * the sub-agent's system prompt, so what the user reads in the UI is exactly what
 * the agent was told.
 */
export function buildSubAgentBrief(sub: SubAgent, context: BriefContext): string {
  const handoffTargets = sub.handoffs
    .map((handoff) => `- ${handoff.target}: ${handoff.trigger}`)
    .join('\n')

  return [
    subAgentJobDescription(sub),
    '',
    'ASSIGNMENT:',
    `- Sub-goal: ${context.objectiveTitle}`,
    `- Task: ${context.taskTitle}`,
    context.projectObjective
      ? `- Project goal this serves: ${context.projectObjective}`
      : null,
    context.instruction ? `- Your department head asks: ${context.instruction}` : null,
    '',
    'REPORT BACK:',
    'State what you did, what you found, and what you could not settle within your',
    'decision rights. Anything outside those rights goes back to your department',
    'head as a recommendation — never as a decision you made alone.',
    handoffTargets
      ? `\nYOU MAY HAND OFF TO:\n${handoffTargets}`
      : null,
  ]
    .filter((line) => line !== null)
    .join('\n')
}

/** A department head's own mandate, for prompts and the roster UI. */
export function specialistJobDescription(specialist: Specialist): string {
  return [
    `ROLE: ${specialist.department} Head`,
    specialist.description ? `MANDATE: ${specialist.description}` : null,
    '',
    'DEPARTMENT SKILLS:',
    specialist.skills.length > 0
      ? bulletList(specialist.skills)
      : '- None declared.',
    '',
    'SUB-AGENTS YOU MAY DISPATCH:',
    specialist.subAgents.length > 0
      ? bulletList(
          specialist.subAgents.map(
            (sub) => `${sub.title} (${sub.key}) — ${sub.description}`,
          ),
        )
      : '- None; you do the work yourself.',
  ]
    .filter((line) => line !== null)
    .join('\n')
}
