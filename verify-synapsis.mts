import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  synapsisEvidence,
  synapsisInterpretations,
  synapsisLearning,
  synapsisOutcomes,
  synapsisOutputs,
  synapsisProblems,
  synapsisStrategies,
} from '@/lib/db/schema'
import {
  SynapsisOrderError,
  frameProblem,
  gatherEvidence,
  integrateLearning,
  interpret,
  produceOutput,
  recordOutcome,
  strategise,
  synapsisChain,
  synapsisStatus,
} from '@/lib/engine/synapsis'
import { sentinelKeys } from '@/lib/db/schema'

let pass = 0
let fail = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok   ${label}`) }
  else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`) }
}
async function throws(label: string, fn: () => Promise<unknown>, match?: string) {
  try { await fn(); check(label, false, 'did not throw') }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    check(label, match ? message.includes(match) : true, message)
  }
}

const keys = await db.select().from(sentinelKeys).limit(1)
const key = keys[0]
if (!key) { console.log('no sentinel key'); process.exit(1) }
const base = { userId: key.userId, projectId: key.projectId, actor: 'verify' }
console.log(`project: ${key.projectId}\n`)

const framing = (id: string) => ({
  problemId: id,
  title: 'Verify the reasoning loop',
  description: 'A problem framed to exercise every stage of SYNAPSIS in order.',
  successCriteria: ['every stage runs', 'out-of-order stages are refused'],
  constraints: ['no side effects outside this project'],
  kaizenClassification: 'L2' as const,
  departments: ['Engineering'],
  owner: 'Engineering.Head',
})

console.log('ORDERING ENFORCEMENT')
const pid = `P-${String(Date.now()).slice(-10)}`

// Every stage must refuse to run before its predecessor. This is the property
// that makes the loop a chain rather than a set of independent notes.
await throws('evidence refused before framing', () =>
  gatherEvidence({ ...base, problemId: pid, question: 'q', answer: 'a', source: 's', confidence: 'high', retrievalState: 'retrieved' }), 'frame')
await throws('interpret refused before evidence', () =>
  interpret({ ...base, problemId: pid, synthesis: 'x', confidence: 'high', interpretationRef: 'INTP-0000000000' } as never), 'evidence')
await throws('strategise refused before interpret', () =>
  strategise({ ...base, problemId: pid, interpretationRef: 'INTP-0000000000', objective: 'o', rationale: 'r' }), 'interpret')
await throws('output refused before strategise', () =>
  produceOutput({ ...base, problemId: pid, strategyId: 'STRA-0000000000', content: {} }), 'strategise')
await throws('outcome refused before output', () =>
  recordOutcome({ ...base, problemId: pid, outputId: 'OUTP-0000000000', actuals: {}, outcomeScore: 'met', targetMet: true, converged: true }), 'output')
await throws('learn refused before outcome', () =>
  integrateLearning({ ...base, problemId: pid, outcomeId: 'OUTC-0000000000' }), 'outcome')

let orderErrors = 0
for (const fn of [
  () => gatherEvidence({ ...base, problemId: pid, question: 'q', answer: 'a', source: 's', confidence: 'high' as const, retrievalState: 'retrieved' as const }),
]) {
  try { await fn() } catch (error) { if (error instanceof SynapsisOrderError) orderErrors++ }
}
check('refusals are the typed error', orderErrors === 1)

console.log('\nFULL LOOP')
const framed = await frameProblem({ ...base, framing: framing(pid) })
check('frame succeeds', framed.problemId === pid && !framed.repaired)

await throws('re-framing the same id is refused', () =>
  frameProblem({ ...base, framing: framing(pid) }), 'already framed')

// A near-miss id is repaired rather than rejected.
const sloppy = await frameProblem({ ...base, framing: { ...framing('p-42'), title: 'Repaired framing check' } })
check('near-miss id is repaired', sloppy.repaired && /^P-\d{10}$/.test(sloppy.problemId), sloppy.problemId)

const ev = await gatherEvidence({ ...base, problemId: pid, question: 'Does the loop enforce order?', answer: 'Yes', source: 'this run', confidence: 'high', retrievalState: 'retrieved' })
check('evidence after framing', !!ev.findingId)

const intp = await interpret({ ...base, problemId: pid, synthesis: 'Order is enforced at every stage', confidence: 'high', keyDrivers: ['predecessor checks'], findingRefs: [ev.findingId] })
check('interpret after evidence', !!intp.interpretationId)

await throws('interpret cannot cite a foreign interpretation', () =>
  strategise({ ...base, problemId: pid, interpretationRef: 'INTP-9999999999', objective: 'o', rationale: 'r' }), 'interpret')

const strat = await strategise({ ...base, problemId: pid, interpretationRef: intp.interpretationRef ?? intp.interpretationId, objective: 'Prove the ordering', rationale: 'Because the record must show reasoning happened', successCriteria: ['all stages sealed'], escalationConditions: ['any stage skipped'] })
check('strategise after interpret', !!strat.strategyId)

const out = await produceOutput({ ...base, problemId: pid, strategyId: strat.strategyId, content: { report: 'ordering holds' }, measurementWindow: { days: 1 }, confidence: 'high' })
check('output after strategise', !!out.outputId)

const outcome = await recordOutcome({ ...base, problemId: pid, outputId: out.outputId, actuals: { stages: 7 }, outcomeScore: 'met', targetMet: true, converged: false, iterationCount: 1 })
check('outcome after output', !!outcome.outcomeId)

// A non-converged outcome must say what to change, or the next iteration is a
// repeat rather than a next attempt.
await throws('non-converged outcome needs a redefinition', () =>
  integrateLearning({ ...base, problemId: pid, outcomeId: outcome.outcomeId, reusableInsights: ['order matters'] }), 'redefinition')

const learned = await integrateLearning({ ...base, problemId: pid, outcomeId: outcome.outcomeId, reusableInsights: ['order matters'], redefinitions: { nextFraming: 'narrow the criteria' } })
check('redefinition closes the loop', !!learned.learningId && learned.converged === false)

console.log('\nSTATUS AND CHAIN')
const status = await synapsisStatus(key.userId, pid)
check('status reports the furthest stage', status.stage === 'learn', status.stage)
check('status has no next stage once closed', status.next === null, String(status.next))
check('status counts every stage', status.counts.frame === 1 && status.counts.evidence === 1 && status.counts.interpret === 1 && status.counts.strategise === 1 && status.counts.output === 1 && status.counts.outcome === 1, JSON.stringify(status.counts))
check('status carries convergence', status.converged === false, String(status.converged))

const chain = await synapsisChain(key.userId, pid)
check('chain returns every stage', !!chain.problem && chain.evidence.length === 1 && chain.interpretations.length === 1 && chain.strategies.length === 1 && chain.outputs.length === 1 && chain.outcomes.length === 1, `outputs=${chain.outputs.length} outcomes=${chain.outcomes.length}`)

// A converged loop needs no redefinition.
const pid2 = `P-${String(Date.now() + 1).slice(-10)}`
await frameProblem({ ...base, framing: framing(pid2) })
const ev2 = await gatherEvidence({ ...base, problemId: pid2, question: 'q', answer: 'a', source: 's', confidence: 'high', retrievalState: 'retrieved' })
const intp2 = await interpret({ ...base, problemId: pid2, synthesis: 's', confidence: 'high' })
const strat2 = await strategise({ ...base, problemId: pid2, interpretationRef: intp2.interpretationId, objective: 'o', rationale: 'r' })
const out2 = await produceOutput({ ...base, problemId: pid2, strategyId: strat2.strategyId, content: {} })
const outcome2 = await recordOutcome({ ...base, problemId: pid2, outputId: out2.outputId, actuals: {}, outcomeScore: 'met', targetMet: true, converged: true })
const learned2 = await integrateLearning({ ...base, problemId: pid2, outcomeId: outcome2.outcomeId })
check('converged loop closes without a redefinition', !!learned2.learningId && learned2.converged === true)

// Cleanup: these are verification rows, not a real project's reasoning.
for (const id of [pid, sloppy.problemId, pid2]) {
  await db.delete(synapsisEvidence).where(eq(synapsisEvidence.problemId, id))
  await db.delete(synapsisInterpretations).where(eq(synapsisInterpretations.problemId, id))
  await db.delete(synapsisStrategies).where(eq(synapsisStrategies.problemId, id))
  await db.delete(synapsisProblems).where(eq(synapsisProblems.problemId, id))
}
for (const id of [out.outputId, out2.outputId]) {
  await db.delete(synapsisOutcomes).where(eq(synapsisOutcomes.outputId, id))
  await db.delete(synapsisOutputs).where(eq(synapsisOutputs.outputId, id))
}
await db.delete(synapsisLearning).where(eq(synapsisLearning.projectId, key.projectId))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
