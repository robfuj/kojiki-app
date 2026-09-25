#!/usr/bin/env node
/**
 * Creates the engine layer: the upstream kojiki-ontology persistence tables
 * (mycelium registry, synapsis cycle, causal chains, governance changes,
 * deck DNA cache) as JSONB documents. Idempotent — safe to run repeatedly.
 *
 * Deviations from upstream (robfuj/kojiki-ontology alembic 0001–0015 +
 * engine/models.py): every table carries "userId" (this app is multi-tenant,
 * the upstream engine is single-tenant) and columns are camelCase to match
 * the rest of this schema.
 *
 * Run with: pnpm db:migrate-engine
 */
import { readFileSync } from 'node:fs'
import pg from 'pg'

function loadEnv() {
  for (const file of ['.env.development.local', '.env.local', '.env']) {
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
      }
    }
  }
}

loadEnv()

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const STEPS = [
  `CREATE TABLE IF NOT EXISTS mycelium_nodes (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text,
     "domain" text NOT NULL,
     "type" text NOT NULL,
     "status" text NOT NULL DEFAULT 'active',
     "pipelineManifestRef" text,
     "pipelineValidated" boolean NOT NULL DEFAULT false,
     "publicKey" text,
     "keyStatus" text NOT NULL DEFAULT 'none',
     "keyIssuedAt" timestamp,
     "keyRevokedAt" timestamp,
     "parentId" text,
     "decisionRights" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "decisionRight" text,
     "createdAt" timestamp NOT NULL DEFAULT now(),
     "updatedAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS mycelium_nodes_user_idx
     ON mycelium_nodes ("userId", "projectId")`,

  `CREATE TABLE IF NOT EXISTS mycelium_node_audit (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "eventType" text NOT NULL,
     "nodeId" text NOT NULL,
     "actor" text,
     "detail" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS mycelium_node_audit_node_idx
     ON mycelium_node_audit ("nodeId", "createdAt")`,

  `CREATE TABLE IF NOT EXISTS mycelium_edges (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "fromKr" text NOT NULL,
     "toKr" text NOT NULL,
     "weight" text NOT NULL DEFAULT '1',
     "reciprocalExchanges" integer NOT NULL DEFAULT 0,
     "oneDirectionalExchanges" integer NOT NULL DEFAULT 0,
     "lastReinforced" timestamp,
     "triggerEvent" text,
     "createdAt" timestamp NOT NULL DEFAULT now(),
     "updatedAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS mycelium_edges_kr_unique
     ON mycelium_edges ("userId", "fromKr", "toKr")`,

  `CREATE TABLE IF NOT EXISTS mycelium_edge_exchanges (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "edgeId" text NOT NULL,
     "fromKr" text NOT NULL,
     "toKr" text NOT NULL,
     "exchangeType" text NOT NULL DEFAULT 'one_directional',
     "signalId" text,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS mycelium_edge_exchanges_edge_idx
     ON mycelium_edge_exchanges ("edgeId", "createdAt")`,

  `CREATE TABLE IF NOT EXISTS sentinel_gate_evidence (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "gateRequestId" text NOT NULL,
     "experienceId" text NOT NULL,
     "signer" text,
     "signature" text,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sentinel_gate_evidence_unique
     ON sentinel_gate_evidence ("gateRequestId", "experienceId", "signer")`,

  `CREATE TABLE IF NOT EXISTS synapsis_problems (
     "problemId" text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text,
     "dispatchId" text,
     "goal" text NOT NULL,
     "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "assumptions" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "constraints" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "unknowns" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS synapsis_evidence (
     "findingId" text PRIMARY KEY,
     "userId" text NOT NULL,
     "problemId" text NOT NULL,
     "question" text,
     "answer" text,
     "source" text,
     "confidence" text,
     "retrievalState" text,
     "coverageLimits" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "sufficiency" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS synapsis_evidence_problem_idx
     ON synapsis_evidence ("problemId")`,

  `CREATE TABLE IF NOT EXISTS synapsis_interpretations (
     "interpretationId" text PRIMARY KEY,
     "userId" text NOT NULL,
     "problemId" text NOT NULL,
     "synthesis" text,
     "confidence" text,
     "keyDrivers" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS synapsis_strategies (
     "strategyId" text PRIMARY KEY,
     "userId" text NOT NULL,
     "problemId" text NOT NULL,
     "interpretationRef" text,
     "objective" text,
     "rationale" text,
     "timeline" text,
     "successCriteria" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "escalationConditions" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "decisionRights" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS synapsis_outputs (
     "outputId" text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text,
     "strategyId" text,
     "content" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "measurementWindow" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "confidence" text,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS synapsis_outcomes (
     "outcomeId" text PRIMARY KEY,
     "userId" text NOT NULL,
     "outputId" text NOT NULL,
     "actuals" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "evaluations" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "outcomeScore" text,
     "targetMet" boolean,
     "converged" boolean,
     "iterationCount" integer,
     "guardrailViolations" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "deviationAnalysis" text,
     "confidence" text,
     "kaizenIteration" integer,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS synapsis_learning (
     "learningId" text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text,
     "cycleTimestamp" timestamp NOT NULL DEFAULT now(),
     "experiences" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "patterns" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "reusableInsights" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "redefinitions" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "outcomeScore" text,
     "guardrailViolations" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "confidence" text,
     "kaizenIteration" integer,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS kaizen_iterations (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "problemId" text NOT NULL,
     "iteration" integer NOT NULL DEFAULT 1,
     "phase" text,
     "startedAt" timestamp,
     "completedAt" timestamp,
     "inputData" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "outputData" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "guardrailViolations" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "learningGenerated" boolean NOT NULL DEFAULT false,
     "experienceRefs" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS kaizen_iterations_problem_idx
     ON kaizen_iterations ("problemId", "iteration")`,

  `CREATE TABLE IF NOT EXISTS causal_chains (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text,
     "dispatchId" text NOT NULL,
     "startedAt" timestamp NOT NULL DEFAULT now(),
     "completedAt" timestamp,
     "totalTokens" integer,
     "totalLatencyMs" integer,
     "finalProblemId" text,
     "finalOutputId" text,
     "finalLearningId" text,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS causal_chains_dispatch_idx
     ON causal_chains ("userId", "dispatchId")`,

  `CREATE TABLE IF NOT EXISTS causal_nodes (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "chainId" text NOT NULL,
     "stage" text NOT NULL,
     "artifactType" text NOT NULL,
     "artifactId" text,
     "contentHash" text,
     "content" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "agentId" text,
     "tools" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS causal_nodes_chain_idx
     ON causal_nodes ("chainId", "createdAt")`,

  `CREATE TABLE IF NOT EXISTS causal_transitions (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "chainId" text NOT NULL,
     "fromStage" text NOT NULL,
     "toStage" text NOT NULL,
     "inputHash" text,
     "outputHash" text,
     "agentId" text,
     "signer" text,
     "signature" text,
     "publicKey" text,
     "inputSummary" text,
     "outputSummary" text,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS causal_transitions_chain_idx
     ON causal_transitions ("chainId", "createdAt")`,

  `CREATE TABLE IF NOT EXISTS governance_changes (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text,
     "changeType" text NOT NULL,
     "target" text,
     "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "reason" text,
     "gateId" text,
     "approver" text,
     "timestamp" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS governance_changes_project_idx
     ON governance_changes ("userId", "projectId", "timestamp")`,

  `CREATE TABLE IF NOT EXISTS deck_dna_cache (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "cacheKey" text NOT NULL UNIQUE,
     "department" text,
     "mode" text,
     "templateData" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "slides" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "hitCount" integer NOT NULL DEFAULT 0,
     "lastAccessed" timestamp,
     "createdAt" timestamp NOT NULL DEFAULT now(),
     "expiresAt" timestamp
   )`,
]

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

try {
  for (const [index, sql] of STEPS.entries()) {
    await pool.query(sql)
    console.log(`[${index + 1}/${STEPS.length}] ok`)
  }

  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('mycelium_nodes','mycelium_node_audit','mycelium_edges',
                          'mycelium_edge_exchanges','sentinel_gate_evidence',
                          'synapsis_problems','synapsis_evidence','synapsis_interpretations',
                          'synapsis_strategies','synapsis_outputs','synapsis_outcomes',
                          'synapsis_learning','kaizen_iterations','causal_chains',
                          'causal_nodes','causal_transitions','governance_changes',
                          'deck_dna_cache')
     ORDER BY table_name`,
  )
  console.log('\nengine layer tables present:')
  console.log(rows.map((r) => `  ${r.table_name}`).join('\n'))
} catch (error) {
  console.error('migration failed:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
