/**
 * Display labels for execution-layer enums.
 *
 * Deliberately free of any database or server-only import so client components
 * can render these without pulling the server runtime into the browser bundle.
 * lib/neuraxis.ts re-exports LAYER_LABELS from here rather than defining its own,
 * so the server logic and the UI can never drift apart on what a layer is called.
 */

export type EscalationLayer = 'L0' | 'L1' | 'L2' | 'L3' | 'L4'

export const LAYER_LABELS: Record<EscalationLayer, string> = {
  L0: 'Execution',
  L1: 'Reasoning',
  L2: 'Problem representation',
  L3: 'Ontology',
  L4: 'Meta-strategy',
}

/** Layers an agent may act on without asking. */
export const AUTONOMOUS_LAYERS: readonly EscalationLayer[] = ['L0', 'L1', 'L2']

/** Layers that change an agent's authority, and therefore require the user. */
export const GOVERNANCE_LAYERS: readonly EscalationLayer[] = ['L3', 'L4']

export type ErrorClass =
  | 'information'
  | 'execution'
  | 'reasoning'
  | 'assumption'
  | 'model'
  | 'meta'

export const ERROR_CLASS_LABELS: Record<ErrorClass, string> = {
  information: 'Information',
  execution: 'Execution',
  reasoning: 'Reasoning',
  assumption: 'Assumption',
  model: 'Model / representation',
  meta: 'Meta-strategy',
}

/** What each error class means, shown when the user picks one to escalate. */
export const ERROR_CLASS_HINTS: Record<ErrorClass, string> = {
  information: 'The data was missing or wrong. Fixable where the work happened.',
  execution: 'The plan was sound but did not get carried out.',
  reasoning: 'The data was fine; the inference drawn from it was not.',
  assumption: 'The inference was sound given a premise that turned out false. Supersedes the problem statement.',
  model: 'The categories the agent reasons in are wrong. Changing them changes what agents may decide — requires your approval.',
  meta: 'The strategy for choosing strategies is wrong — requires your approval.',
}

export type ValidationResult = 'PASS' | 'FAIL' | 'LEARNING'

export const VALIDATION_LABELS: Record<ValidationResult, string> = {
  PASS: 'Passed',
  FAIL: 'Failed',
  LEARNING: 'Learning',
}

/** What the third verdict means — it is the one users most often misread. */
export const LEARNING_EXPLANATION =
  'A miss that produced a reusable lesson. It is not a pass, but unlike a plain failure it still earns a partial node in the OKR tree.'

export const TASK_STATUS_LABELS: Record<string, string> = {
  proposed: 'Proposed',
  dispatched: 'Dispatched',
  reported: 'Reported',
  verified: 'Verified',
  checked: 'Checked',
  blocked: 'Blocked by gate',
  returned: 'Returned to head',
  reabsorbed: 'Reabsorbed',
}

export const SIGNAL_KIND_LABELS: Record<string, string> = {
  dispatch: 'Dispatched work',
  report: 'Reported back',
  reabsorb: 'Reabsorbed into OKR tree',
  query: 'Asked',
  answer: 'Answered',
}

export function layerLabel(layer: string): string {
  return LAYER_LABELS[layer as EscalationLayer] ?? layer
}

export function isGovernanceLayer(layer: string): boolean {
  return GOVERNANCE_LAYERS.includes(layer as EscalationLayer)
}
