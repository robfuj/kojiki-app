import { orientationContext, type OrientationAnswers } from './orientation'
import { getSpecialist, specialistLabel } from './specialists'
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
    `You reason through the SYNAPSIS decision cycle. Each stage has one authority and an explicit boundary; never let one stage silently perform another's work.\n${stages}\n\nWhen a request is a real decision, say which stage you are in before answering, and keep the stages separate. For a quick factual question, answer directly without forcing the cycle.`,
  )

  if (orientation) {
    sections.push(
      `Organization context from the Orientation Protocol:\n${orientationContext(orientation)}`,
    )
  }

  sections.push(
    'Be concrete and brief. Prefer a clear recommendation with its reasoning over hedging. Use markdown sparingly: short paragraphs, and lists only when they carry real structure.',
  )

  return sections.join('\n\n')
}
