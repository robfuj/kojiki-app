#!/usr/bin/env node
/**
 * Creates the execution layer: sub-agent tasks, the SENTINEL provenance ledger,
 * the MYCELIUM signal substrate, and the KAIZEN / NEURAXIS tables. Idempotent —
 * safe to run repeatedly.
 *
 * Run with: pnpm db:migrate-execution
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
  // A conversation is with one agent, at one layer: a department head, one of its
  // sub-agents, or the orchestrator. botId becomes nullable because the
  // orchestrator is not a project bot.
  `ALTER TABLE chat_sessions
     ADD COLUMN IF NOT EXISTS "agentKind" text NOT NULL DEFAULT 'department',
     ADD COLUMN IF NOT EXISTS "subAgentKey" text,
     ADD COLUMN IF NOT EXISTS "parentSpecialistKey" text,
     ADD COLUMN IF NOT EXISTS "objectiveId" text,
     ALTER COLUMN "botId" DROP NOT NULL`,

  // The sub-agent that actually did the work, recorded when a head reabsorbs a
  // finished task. This is what makes a node read as
  // "proposed · Marketing · SEO Specialist".
  `ALTER TABLE objectives
     ADD COLUMN IF NOT EXISTS "assigneeSubAgentKey" text,
     ADD COLUMN IF NOT EXISTS "assigneeSubAgentTitle" text`,

  `CREATE TABLE IF NOT EXISTS sub_agent_tasks (
     id text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text NOT NULL,
     "objectiveId" text NOT NULL,
     "assignedByBotId" text NOT NULL,
     "parentSpecialistKey" text NOT NULL,
     "subAgentKey" text NOT NULL,
     "subAgentTitle" text NOT NULL,
     title text NOT NULL,
     brief text NOT NULL,
     skills jsonb NOT NULL DEFAULT '[]',
     status text NOT NULL DEFAULT 'proposed',
     "resultSummary" text,
     result jsonb,
     progress integer NOT NULL DEFAULT 0,
     "successCriteria" jsonb NOT NULL DEFAULT '[]',
     guardrails jsonb NOT NULL DEFAULT '[]',
     "measurementWindowDays" integer,
     actuals jsonb,
     "validationResult" text,
     "outcomeScore" integer,
     "guardrailBreaches" jsonb NOT NULL DEFAULT '[]',
     "checkedAt" timestamp,
     "errorClass" text,
     "escalationLayer" text,
     "escalationId" text,
     "gateRequestId" text,
     "reabsorbedAt" timestamp,
     "proposedObjectiveId" text,
     position integer NOT NULL DEFAULT 0,
     "createdAt" timestamp NOT NULL DEFAULT now(),
     "updatedAt" timestamp NOT NULL DEFAULT now()
   )`,

  // Exactly one keypair per project, held only by the runtime. No agent holds a
  // key, so no agent can mint provenance for its own claims.
  `CREATE TABLE IF NOT EXISTS sentinel_keys (
     "projectId" text PRIMARY KEY,
     "userId" text NOT NULL,
     "publicKey" text NOT NULL,
     "privateKey" text NOT NULL,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,

  // Append-only and hash-chained. There is deliberately no update or delete path
  // anywhere in lib/sentinel.ts.
  `CREATE TABLE IF NOT EXISTS sentinel_entries (
     id text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text NOT NULL,
     sequence integer NOT NULL,
     "prevEntryId" text,
     "prevHash" text,
     "entryHash" text NOT NULL,
     "entryType" text NOT NULL,
     "subjectKey" text NOT NULL,
     "subjectTitle" text NOT NULL,
     signer text NOT NULL,
     signature text NOT NULL,
     "publicKey" text NOT NULL,
     "payloadRef" text,
     "payloadHash" text NOT NULL,
     payload jsonb NOT NULL DEFAULT '{}',
     "objectiveId" text,
     "recordedAt" timestamp NOT NULL DEFAULT now()
   )`,

  // One sequence per project, so a concurrent append fails loudly instead of
  // silently forking the chain.
  `CREATE UNIQUE INDEX IF NOT EXISTS sentinel_entries_project_sequence_idx
     ON sentinel_entries ("projectId", sequence)`,
  `CREATE INDEX IF NOT EXISTS sentinel_entries_project_idx
     ON sentinel_entries ("projectId", sequence)`,

  `CREATE TABLE IF NOT EXISTS mycelium_signals (
     id text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text NOT NULL,
     "objectiveId" text,
     "taskId" text,
     "fromAgent" text NOT NULL,
     "fromTitle" text NOT NULL,
     "toAgent" text NOT NULL,
     "toTitle" text NOT NULL,
     "signalKind" text NOT NULL,
     status text NOT NULL DEFAULT 'ROUTED',
     body text NOT NULL,
     payload jsonb NOT NULL DEFAULT '{}',
     "sentinelEntryId" text,
     "firedAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS mycelium_signals_objective_idx
     ON mycelium_signals ("objectiveId", "firedAt")`,
  `CREATE INDEX IF NOT EXISTS mycelium_signals_task_idx
     ON mycelium_signals ("taskId", "firedAt")`,

  `CREATE TABLE IF NOT EXISTS kaizen_experiences (
     id text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text NOT NULL,
     "objectiveId" text,
     "taskId" text,
     "agentKey" text NOT NULL,
     "agentTitle" text NOT NULL,
     hypothesis text NOT NULL,
     action text NOT NULL,
     expected text NOT NULL,
     observed text NOT NULL,
     "errorClass" text NOT NULL,
     "escalationLayer" text NOT NULL,
     redefinition text,
     supersedes text,
     reason text,
     insight text,
     reusable boolean NOT NULL DEFAULT false,
     "sentinelEntryId" text,
     "recordedAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS kaizen_experiences_project_idx
     ON kaizen_experiences ("projectId", "agentKey", "errorClass")`,

  `CREATE TABLE IF NOT EXISTS neuraxis_escalations (
     id text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text NOT NULL,
     "objectiveId" text,
     "taskId" text,
     "experienceId" text,
     "agentKey" text NOT NULL,
     "agentTitle" text NOT NULL,
     "errorClass" text NOT NULL,
     layer text NOT NULL,
     autonomous boolean NOT NULL,
     summary text NOT NULL,
     redefinition text,
     supersedes text,
     reason text,
     status text NOT NULL DEFAULT 'resolved',
     "gateRequestId" text,
     "sentinelEntryId" text,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,

  // An L3/L4 change is a change to an agent's own authority, so it never
  // self-applies: it blocks here until the user decides.
  `CREATE TABLE IF NOT EXISTS gate_requests (
     id text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text NOT NULL,
     "objectiveId" text,
     "taskId" text,
     "escalationId" text,
     "changeType" text NOT NULL,
     layer text NOT NULL,
     "requestedByAgent" text NOT NULL,
     "requestedByTitle" text NOT NULL,
     title text NOT NULL,
     summary text NOT NULL,
     "proposedChange" jsonb NOT NULL DEFAULT '{}',
     recommendation text,
     consult jsonb NOT NULL DEFAULT '[]',
     "approveRole" text,
     "corroborationCount" integer NOT NULL DEFAULT 0,
     status text NOT NULL DEFAULT 'pending',
     decision text,
     "decisionNote" text,
     "decidedAt" timestamp,
     "slaDueAt" timestamp,
     "sentinelEntryId" text,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS gate_requests_pending_idx
     ON gate_requests ("projectId", status, "createdAt")`,
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
       AND table_name IN ('sub_agent_tasks','sentinel_keys','sentinel_entries',
                          'mycelium_signals','kaizen_experiences',
                          'neuraxis_escalations','gate_requests')
     ORDER BY table_name`,
  )
  console.log('\nexecution layer tables present:')
  console.log(rows.map((r) => `  ${r.table_name}`).join('\n'))
} catch (error) {
  console.error('migration failed:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
