import { resolveModelForUser } from '@/lib/ai'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { languageDirective } from '@/lib/i18n/locales'
import type { Locale } from '@/lib/i18n/locales'
import { generateText } from 'ai'
import { z } from 'zod'

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
