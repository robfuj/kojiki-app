/**
 * Specialist registry. The data is generated from the vendored
 * ontology/specialists/<key>/config.yaml sources by
 * scripts/generate-ontology.mjs — this module only adds lookup helpers.
 */

import { SPECIALISTS, type Specialist } from './generated'

export {
  SPECIALISTS,
  ONTOLOGY_MANIFEST,
  ONTOLOGY_SOURCE,
  type DecisionRightVerb,
  type DecisionRights,
  type Handoff,
  type Specialist,
} from './generated'

export const SPECIALIST_BY_KEY = new Map(SPECIALISTS.map((s) => [s.key, s]))

export function getSpecialist(key: string): Specialist | undefined {
  return SPECIALIST_BY_KEY.get(key)
}

/** Human-readable label, e.g. "engineering-platform" -> "Engineering Platform". */
export function specialistLabel(key: string): string {
  return key
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
