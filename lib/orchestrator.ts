/**
 * The orchestrator runs between the Orientation Protocol and the workspace.
 *
 * It takes the user's goal and industry, researches the field on the live web,
 * then decides which of the canonical specialists that goal actually needs.
 * The roster is a consequence of the goal rather than a fixed eight-department
 * org chart instantiated for every project.
 *
 * Two steps, because the Gateway's search model supports no tool calls:
 *   1. perplexity/sonar retrieves live market, competitive, and regulatory
 *      context and returns it as prose with inline citations.
 *   2. A tool-capable model structures that prose into a brief and selects the
 *      roster from the ontology catalog.
 *
 * If the search model is unavailable (the Gateway free tier restricts it), step
 * one is skipped and step two reasons from its own knowledge. The result records
 * which path ran so the UI can be honest about provenance.
 */

export * from './orchestrator/roster'
export * from './orchestrator/intake'
export * from './orchestrator/clarify'
export * from './orchestrator/re-research'
export * from './orchestrator/review'
