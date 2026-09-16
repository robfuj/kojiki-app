import type { ResearchBrief } from '@/lib/orchestrator'
import { subAgentJobDescription } from './brief'
import { orientationContext, type OrientationAnswers } from './orientation'
import { getSpecialist, getSubAgent, specialistLabel } from './specialists'
import { SYNAPSIS_STAGES, stageBoundary } from './synapsis'

interface BotRecord {
  specialistKey: string
  displayName: string
  mandate: string | null
}

/**
 * Assembles a department bot's system prompt from the ontology: its mandate,
 * its seven-verb decision rights, its handoff targets, the SYNAPSIS stage
 * discipline, and the orientation context that scopes it to the real org.
 */
export function buildSystemPrompt(
  bot: BotRecord,
  orientation: OrientationAnswers | null,
  projectName: string,
  projectObjective: string | null,
  research: ResearchBrief | null = null,
): string {
  const specialist = getSpecialist(bot.specialistKey)

  const sections: string[] = [
    `You are the ${bot.displayName} department agent of the Kojiki ontology, operating inside the project "${projectName}".`,
  ]

  if (projectObjective) {
    sections.push(`Project objective: ${projectObjective}`)
  }

  if (specialist) {
    sections.push(`Mandate: ${specialist.description}`)

    const rights = Object.entries(specialist.decisionRights)
      .map(([verb, items]) => `- ${verb.toUpperCase()}: ${items.join(', ')}`)
      .join('\n')
    sections.push(
      `Your decision rights. Stay inside them; never exercise a verb you do not hold.\n${rights}`,
    )

    if (specialist.handoffs.length > 0) {
      const handoffs = specialist.handoffs
        .map((h) => {
          const target = specialistLabel(h.target)
          // Upstream config.yaml files cite payload schema paths that are not
          // present in the repository; only cite one that actually resolves.
          return h.payloadSchemaResolved && h.payloadSchema
            ? `- on "${h.trigger}" hand off to ${target} (${h.payloadSchema})`
            : `- on "${h.trigger}" hand off to ${target}`
        })
        .join('\n')
      sections.push(
        `Cross-functional handoffs you may initiate:\n${handoffs}\nWhen work crosses your mandate, name the target department and the trigger rather than answering outside your rights.`,
      )
    }

    if (specialist.tools.length > 0) {
      sections.push(`Tools you reason with: ${specialist.tools.join(', ')}`)
    }
  }

  const stages = SYNAPSIS_STAGES.map((s) => {
    const boundary = stageBoundary(s)
      .split('\n')
      .map((line) => `     ${line}`)
      .join('\n')
    return `   ${s.index}. ${s.name} — ${s.authority}\n${boundary}`
  }).join('\n')
  sections.push(
    `You reason through the SYNAPSIS decision cycle. Each stage has one authority and an explicit boundary; never let one stage silently perform another's work.\n${stages}\n\nWhen the user asks about building something out, run SACCADE first: locate the goal in the field before you propose anything, and say what you located. Only then move through the later stages, naming the stage you are in at each step. For a quick factual question, answer directly without forcing the cycle.`,
  )

  if (orientation) {
    sections.push(
      `The user you serve, from the Orientation Protocol:\n${orientationContext(orientation)}\n\nAddress the user by name. Their goal is this project's goal; every recommendation you make serves it.`,
    )
  }

  if (research) {
    const risks = research.keyRisks.map((risk) => `- ${risk}`).join('\n')
    sections.push(
      `The orchestrator researched this goal and industry before you were instantiated. Ground your answers in this research rather than re-deriving it from scratch.\n\nMarket: ${research.marketScan}\n\nCompetition: ${research.competitiveLandscape}\n\nRegulation: ${research.regulatoryConsiderations}\n\nKey risks:\n${risks}`,
    )
  }

  sections.push(
    'Be concrete and brief. Prefer a clear recommendation with its reasoning over hedging. Use markdown sparingly: short paragraphs, and lists only when they carry real structure.',
  )

  return sections.join('\n\n')
}

const STYLE_RULE =
  'Be concrete and brief. Prefer a clear recommendation with its reasoning over hedging. Use markdown sparingly: short paragraphs, and lists only when they carry real structure.'

function synapsisSection(): string {
  const stages = SYNAPSIS_STAGES.map((s) => {
    const boundary = stageBoundary(s)
      .split('\n')
      .map((line) => `     ${line}`)
      .join('\n')
    return `   ${s.index}. ${s.name} — ${s.authority}\n${boundary}`
  }).join('\n')

  return `You reason through the SYNAPSIS decision cycle. Each stage has one authority and an explicit boundary; never let one stage silently perform another's work.\n${stages}\n\nWhen the user asks about building something out, run SACCADE first: locate the goal in the field before you propose anything, and say what you located. Only then move through the later stages, naming the stage you are in at each step. For a quick factual question, answer directly without forcing the cycle.`
}

function researchSection(research: ResearchBrief): string {
  const risks = research.keyRisks.map((risk) => `- ${risk}`).join('\n')
  return `The orchestrator researched this goal and industry before you were instantiated. Ground your answers in this research rather than re-deriving it from scratch.\n\nMarket: ${research.marketScan}\n\nCompetition: ${research.competitiveLandscape}\n\nRegulation: ${research.regulatoryConsiderations}\n\nKey risks:\n${risks}`
}

export interface SubAgentTaskContext {
  title: string
  brief: string
  successCriteria: string
}

/**
 * Assembles a sub-agent's system prompt.
 *
 * A sub-agent is addressable on its own — the user can talk to the SEO Specialist
 * directly rather than only through the Marketing head — but it is never
 * free-floating. Its prompt carries its parent department's mandate as a scope
 * boundary, so it answers as the specialist it is and escalates rather than
 * drifting into another department's work.
 */
export function buildSubAgentSystemPrompt(
  parentSpecialistKey: string,
  subAgentKey: string,
  orientation: OrientationAnswers | null,
  projectName: string,
  projectObjective: string | null,
  research: ResearchBrief | null = null,
  task: SubAgentTaskContext | null = null,
): string | null {
  const sub = getSubAgent(parentSpecialistKey, subAgentKey)
  if (!sub) return null

  const parent = getSpecialist(parentSpecialistKey)
  const parentName = parent ? specialistLabel(parent.key) : parentSpecialistKey

  const sections: string[] = [
    `You are the ${sub.title}, a sub-agent of the ${parentName} department in the Kojiki ontology, operating inside the project "${projectName}".`,
  ]

  if (projectObjective) {
    sections.push(`Project objective: ${projectObjective}`)
  }

  sections.push(`Your job description, from the ontology:\n${subAgentJobDescription(sub)}`)

  if (parent) {
    sections.push(
      `You sit inside ${parentName}, whose mandate is: ${parent.description}\n\nWork within that mandate. When a question belongs to another department, say which one and why rather than answering it yourself — your department head routes the handoff.`,
    )
  }

  if (task) {
    sections.push(
      `You are currently assigned this task:\n\n${task.title}\n\n${task.brief}\n\n${task.successCriteria}\n\nTreat the success criteria as the definition of done. If you cannot meet them, say so plainly and say what blocked you — a reported miss that names its cause is worth more than a claimed success.`,
    )
  }

  sections.push(synapsisSection())

  if (orientation) {
    sections.push(
      `The user you serve, from the Orientation Protocol:\n${orientationContext(orientation)}\n\nAddress the user by name. Their goal is this project's goal; your work serves it through your department.`,
    )
  }

  if (research) {
    sections.push(researchSection(research))
  }

  sections.push(STYLE_RULE)

  return sections.join('\n\n')
}

export interface OrchestratorContext {
  /** Rendered OKR tree, so the orchestrator can check in on objectives. */
  okrSummary: string | null
  /** Open L3/L4 gate requests awaiting the user's decision. */
  pendingGates: string | null
  /** Recent Mycelium traffic, so it can report what agents are doing. */
  recentSignals: string | null
}

/**
 * Assembles the orchestrator's system prompt.
 *
 * The orchestrator does not do department work. It coordinates, reports status
 * against the OKR tree, and surfaces the decisions only the user can make —
 * above all the open governance gates, since an agent may never approve its own
 * change of authority.
 */
export function buildOrchestratorSystemPrompt(
  orientation: OrientationAnswers | null,
  projectName: string,
  projectObjective: string | null,
  research: ResearchBrief | null,
  context: OrchestratorContext,
): string {
  const sections: string[] = [
    `You are the orchestrator of the Kojiki ontology, operating inside the project "${projectName}". Department agents and their sub-agents do the work; you coordinate them, report on their progress, and surface the decisions that belong to the user.`,
  ]

  if (projectObjective) {
    sections.push(`Project objective: ${projectObjective}`)
  }

  sections.push(
    `Your role and its limits:\n- You do not perform department work yourself. When the user needs a specialist's judgement, say which department or sub-agent should answer and why.\n- You report status against the OKR tree rather than restating it.\n- You never approve a governance gate on the user's behalf. An L3 (ontology) or L4 (meta-strategy) change alters an agent's own authority, so only the user may decide it. Surface open gates; do not resolve them.\n- Every engagement is recorded in the SENTINEL ledger. You may cite it, but you cannot alter it.`,
  )

  if (context.okrSummary) {
    sections.push(`Current OKR tree:\n${context.okrSummary}`)
  }

  if (context.pendingGates) {
    sections.push(
      `Open governance gates awaiting the user's decision. Raise these proactively when relevant:\n${context.pendingGates}`,
    )
  }

  if (context.recentSignals) {
    sections.push(`Recent agent-to-agent traffic on the Mycelium substrate:\n${context.recentSignals}`)
  }

  if (orientation) {
    sections.push(
      `The user you serve, from the Orientation Protocol:\n${orientationContext(orientation)}\n\nAddress the user by name. Their goal is this project's goal.`,
    )
  }

  if (research) {
    sections.push(researchSection(research))
  }

  sections.push(STYLE_RULE)

  return sections.join('\n\n')
}
