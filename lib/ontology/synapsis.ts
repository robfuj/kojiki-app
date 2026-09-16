/**
 * The SYNAPSIS decision cycle, transcribed from
 * engine/kojiki_core/prompts/stages/0N-<stage>.md in robfuj/kojiki-ontology.
 *
 * Each stage has a single "authority" question and an explicit transformation
 * boundary: a stage must not silently perform the work of another stage.
 */

export interface SynapsisStage {
  index: number
  key: string
  name: string
  authority: string
  boundary: string
}

export const SYNAPSIS_STAGES: SynapsisStage[] = [
  {
    index: 1,
    key: 'saccade',
    name: 'Saccade',
    authority: 'What is the actual question this decision needs to answer?',
    boundary: 'Frames the problem only. Never gathers evidence, never proposes solutions.',
  },
  {
    index: 2,
    key: 'evidence',
    name: 'Evidence',
    authority: 'What does the retrieved source actually establish?',
    boundary: 'Outputs a sufficiency/gap map. Never diagnoses, never proposes interventions.',
  },
  {
    index: 3,
    key: 'interpretation',
    name: 'Interpretation',
    authority: 'Given accepted evidence, what does it mean?',
    boundary: 'Consumes accepted evidence only. Never retrieves, never proposes interventions.',
  },
  {
    index: 4,
    key: 'strategy',
    name: 'Strategy',
    authority: 'Given accepted interpretation, what should we do and when?',
    boundary: 'Decides the objective (what/when). Never designs the intervention (how).',
  },
  {
    index: 5,
    key: 'output',
    name: 'Output',
    authority: 'Given accepted strategy, how do we execute?',
    boundary: 'Designs the intervention (how). Never re-decides the objective.',
  },
  {
    index: 6,
    key: 'deck',
    name: 'Deck',
    authority: 'Produce a stakeholder-ready communication artifact.',
    boundary: 'Formats the decision for consumption. Never re-decides or re-designs.',
  },
  {
    index: 7,
    key: 'outcome',
    name: 'Outcome',
    authority: 'Kaizen CHECK — how did measured actuals compare to success criteria?',
    boundary: 'Compares actuals against success criteria with guardrails. Never re-plans.',
  },
  {
    index: 8,
    key: 'learning',
    name: 'Learning',
    authority: 'Kaizen ACT — what reusable experience does this cycle yield?',
    boundary: 'Synthesizes experiences that feed NEURAXIS escalation. Never re-litigates.',
  },
]

export const STAGE_BY_KEY = new Map(SYNAPSIS_STAGES.map((s) => [s.key, s]))

export function getStage(key: string): SynapsisStage | undefined {
  return STAGE_BY_KEY.get(key)
}
