/**
 * Browser-safe specialist lookups. Client components import this instead of
 * ./specialists so the full generated ontology stays out of the client bundle.
 */

import { CLIENT_SPECIALISTS, type ClientSpecialist } from './generated-client'

export { CLIENT_SPECIALISTS, type ClientSpecialist } from './generated-client'

const CLIENT_SPECIALIST_BY_KEY = new Map(CLIENT_SPECIALISTS.map((s) => [s.key, s]))

/** The sub-agents a department head can dispatch work to (key + title only). */
export function subAgentsOf(specialistKey: string): ClientSpecialist['subAgents'] {
  return CLIENT_SPECIALIST_BY_KEY.get(specialistKey)?.subAgents ?? []
}
