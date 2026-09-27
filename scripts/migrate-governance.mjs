#!/usr/bin/env node
/**
 * Creates the governance engine tables: MORPHEUS (snapshot / seal / verify),
 * decision rights, approval gates, handoffs, the Kaizen 14-class taxonomy and
 * its learning cases, per-project sub-agent configs, and per-node SENTINEL keys.
 * Idempotent — safe to run repeatedly.
 *
 * Deviations from upstream (robfuj/kojiki-ontology):
 *   - every tenant-scoped table carries "userId" (this app is multi-tenant, the
 *     upstream engine is single-tenant) and columns are camelCase;
 *   - SACCADE framing and the SYNAPSIS stages are NOT recreated here — they are
 *     synapsis_problems and the synapsis_* tables from migrate-engine-schema.mjs;
 *   - kaizen_error_classes and handoff_schemas carry no userId: they are fixed
 *     reference data from the ontology, not per-tenant rows;
 *   - sentinel_node_keys stores a public key only. The signing path stays a
 *     single per-project keypair (see the comment on that table in schema.ts),
 *     so no node gains authority to sign the ledger.
 *
 * Run with: pnpm db:migrate-governance
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

const KAIZEN_CLASSES = [
  ['L0', 'Execution Error', 'The agent did the work wrong; the plan was sound.', 'FAIL', false],
  ['L1', 'Schema Violation', 'Output did not satisfy the contract it was asked for.', 'FAIL', false],
  ['L2', 'Logic Error', 'Reasoning was internally inconsistent.', 'FAIL', false],
  ['L3', 'Governance Gap', 'No rule covered the situation, so nothing constrained it.', 'LEARNING', true],
  ['L4', 'Data Integrity', 'The record and the world disagree.', 'LEARNING', true],
  ['L5', 'Resource Exhaustion', 'Budget, tokens, rate limit or time ran out.', 'FAIL', false],
  ['L6', 'External Dependency', 'A third party failed or changed shape.', 'FAIL', false],
  ['L7', 'Configuration Drift', 'Deployed configuration no longer matches intent.', 'LEARNING', false],
  ['L8', 'Identity Mismatch', 'An agent acted as something it is not registered as.', 'LEARNING', true],
  ['L9', 'Consultation Deadlock', 'Mycelium consultation could not converge.', 'LEARNING', true],
  ['L10', 'Approval Rejection', 'A gate rejected the result.', 'FAIL', false],
  ['L11', 'Orientation Failure', 'The goal was framed too loosely to act on.', 'LEARNING', false],
  ['L12', 'SACCADE Framing Error', 'The problem statement itself was wrong.', 'LEARNING', true],
  ['L13', 'OKR Validation Error', 'Objectives or key results failed validation.', 'LEARNING', true],
]

const HANDOFF_SCHEMAS = [
  [
    'handoff-lead',
    'Qualified lead to sales',
    'marketing-brand/growth-hacker',
    'sales-outbound',
    {
      type: 'object',
      required: ['leadId', 'source'],
      properties: {
        leadId: { type: 'string' },
        source: { type: 'string' },
        score: { type: 'number', minimum: 0, maximum: 1 },
        notes: { type: 'string' },
      },
    },
  ],
  [
    'handoff-landing-page',
    'Copy to landing page build',
    'marketing-brand/content-creator',
    'engineering-platform',
    {
      type: 'object',
      required: ['pageKey', 'copy', 'cta'],
      properties: {
        pageKey: { type: 'string' },
        copy: { type: 'string' },
        cta: { type: 'string' },
        audience: { type: 'string' },
      },
    },
  ],
  [
    'handoff-content',
    'Keyword cluster to content brief',
    'marketing-brand/seo-specialist',
    'marketing-brand/content-creator',
    {
      type: 'object',
      required: ['briefId', 'topic'],
      properties: {
        briefId: { type: 'string' },
        topic: { type: 'string' },
        keywords: { type: 'array', items: { type: 'string' } },
        outline: { type: 'string' },
      },
    },
  ],
  [
    'handoff-review',
    'Artifact to compliance review',
    null,
    'legal-compliance',
    {
      type: 'object',
      required: ['artifactId', 'artifactType'],
      properties: {
        artifactId: { type: 'string' },
        artifactType: { type: 'string' },
        checklist: { type: 'array', items: { type: 'string' } },
      },
    },
  ],
  [
    'handoff-escalation',
    'Unresolvable finding to NEURAXIS',
    null,
    null,
    {
      type: 'object',
      required: ['reason', 'severity'],
      properties: {
        reason: { type: 'string' },
        severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        evidence: { type: 'array', items: { type: 'string' } },
      },
    },
  ],
]

const STEPS = [
  `CREATE TABLE IF NOT EXISTS morpheus_snapshots (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text NOT NULL,
     "snapshotHash" text NOT NULL,
     "stores" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "storeCount" integer NOT NULL DEFAULT 0,
     "rowCount" integer NOT NULL DEFAULT 0,
     "status" text NOT NULL DEFAULT 'snapshotted',
     "sentinelEntryId" text,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS morpheus_snapshots_project_idx
     ON morpheus_snapshots ("projectId", "createdAt")`,

  `CREATE TABLE IF NOT EXISTS morpheus_seals (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text NOT NULL,
     "snapshotId" text NOT NULL,
     "sealHash" text NOT NULL,
     "sentinelEntryId" text NOT NULL,
     "sequence" integer NOT NULL,
     "sealedAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS morpheus_seals_project_idx
     ON morpheus_seals ("projectId", "sealedAt")`,

  `CREATE TABLE IF NOT EXISTS morpheus_verifications (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text NOT NULL,
     "snapshotId" text,
     "chainValid" boolean NOT NULL,
     "entries" integer NOT NULL DEFAULT 0,
     "brokenAtSequence" integer,
     "reason" text,
     "gatesRematerialized" integer NOT NULL DEFAULT 0,
     "storesCleared" jsonb NOT NULL DEFAULT '[]'::jsonb,
     "verifiedAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS morpheus_verifications_project_idx
     ON morpheus_verifications ("projectId", "verifiedAt")`,

  `CREATE TABLE IF NOT EXISTS agent_decision_rights (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text NOT NULL,
     "agentKey" text NOT NULL,
     "rights" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "source" text NOT NULL DEFAULT 'default',
     "grantedBy" text,
     "gateRequestId" text,
     "createdAt" timestamp NOT NULL DEFAULT now(),
     "updatedAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS agent_decision_rights_project_agent_unique
     ON agent_decision_rights ("projectId", "agentKey")`,

  `CREATE TABLE IF NOT EXISTS approval_requests (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text NOT NULL,
     "orchestrationId" text,
     "channel" text NOT NULL DEFAULT 'failclosed',
     "title" text NOT NULL,
     "summary" text,
     "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "confidence" double precision,
     "retries" integer NOT NULL DEFAULT 0,
     "status" text NOT NULL DEFAULT 'pending',
     "webhookUrl" text,
     "decision" text,
     "decisionNote" text,
     "decidedBy" text,
     "sentinelEntryId" text,
     "expiresAt" timestamp,
     "createdAt" timestamp NOT NULL DEFAULT now(),
     "decidedAt" timestamp
   )`,
  `CREATE INDEX IF NOT EXISTS approval_requests_project_idx
     ON approval_requests ("projectId", "status", "createdAt")`,

  `CREATE TABLE IF NOT EXISTS kaizen_error_classes (
     "code" text PRIMARY KEY,
     "label" text NOT NULL,
     "description" text,
     "defaultVerdict" text,
     "escalates" boolean NOT NULL DEFAULT false,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS kaizen_learning_cases (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text,
     "errorClass" text NOT NULL,
     "problemId" text,
     "taskId" text,
     "symptom" text NOT NULL,
     "rootCause" text,
     "resolution" text,
     "reusableInsight" text,
     "verdict" text NOT NULL DEFAULT 'LEARNING',
     "sentinelEntryId" text,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS kaizen_learning_cases_class_idx
     ON kaizen_learning_cases ("userId", "errorClass", "createdAt")`,

  `CREATE TABLE IF NOT EXISTS handoff_requests (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text NOT NULL,
     "sourceAgent" text NOT NULL,
     "targetAgent" text NOT NULL,
     "trigger" text NOT NULL,
     "schemaKey" text NOT NULL,
     "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "status" text NOT NULL DEFAULT 'sent',
     "rejectionReason" text,
     "signalId" text,
     "sentinelEntryId" text,
     "createdAt" timestamp NOT NULL DEFAULT now(),
     "updatedAt" timestamp NOT NULL DEFAULT now(),
     "closedAt" timestamp
   )`,
  `CREATE INDEX IF NOT EXISTS handoff_requests_project_idx
     ON handoff_requests ("projectId", "status", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS handoff_requests_target_idx
     ON handoff_requests ("targetAgent", "status")`,

  `CREATE TABLE IF NOT EXISTS handoff_schemas (
     "key" text PRIMARY KEY,
     "label" text NOT NULL,
     "sourceAgent" text,
     "targetAgent" text,
     "schema" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "version" integer NOT NULL DEFAULT 1,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS sub_agent_configs (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text NOT NULL,
     "department" text NOT NULL,
     "subAgentKey" text NOT NULL,
     "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
     "source" text NOT NULL DEFAULT 'ontology',
     "enabled" boolean NOT NULL DEFAULT true,
     "createdAt" timestamp NOT NULL DEFAULT now(),
     "updatedAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sub_agent_configs_project_dept_agent_unique
     ON sub_agent_configs ("projectId", "department", "subAgentKey")`,

  `CREATE TABLE IF NOT EXISTS sentinel_node_keys (
     "id" text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text NOT NULL,
     "nodeId" text NOT NULL,
     "publicKey" text NOT NULL,
     "keyStatus" text NOT NULL DEFAULT 'active',
     "createdAt" timestamp NOT NULL DEFAULT now(),
     "rotatedAt" timestamp,
     "revokedAt" timestamp
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sentinel_node_keys_project_node_unique
     ON sentinel_node_keys ("projectId", "nodeId")`,
]

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

try {
  for (const [index, sql] of STEPS.entries()) {
    await pool.query(sql)
    console.log(`[${index + 1}/${STEPS.length}] ok`)
  }

  // Reference data: upserted so re-running picks up label or description changes
  // without duplicating rows.
  for (const [code, label, description, verdict, escalates] of KAIZEN_CLASSES) {
    await pool.query(
      `INSERT INTO kaizen_error_classes ("code", "label", "description", "defaultVerdict", "escalates")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ("code") DO UPDATE
         SET "label" = EXCLUDED."label",
             "description" = EXCLUDED."description",
             "defaultVerdict" = EXCLUDED."defaultVerdict",
             "escalates" = EXCLUDED."escalates"`,
      [code, label, description, verdict, escalates],
    )
  }
  console.log(`seeded ${KAIZEN_CLASSES.length} kaizen error classes`)

  for (const [key, label, source, target, schema] of HANDOFF_SCHEMAS) {
    await pool.query(
      `INSERT INTO handoff_schemas ("key", "label", "sourceAgent", "targetAgent", "schema")
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT ("key") DO UPDATE
         SET "label" = EXCLUDED."label",
             "sourceAgent" = EXCLUDED."sourceAgent",
             "targetAgent" = EXCLUDED."targetAgent",
             "schema" = EXCLUDED."schema",
             "version" = handoff_schemas."version" + 1`,
      [key, label, source, target, JSON.stringify(schema)],
    )
  }
  console.log(`seeded ${HANDOFF_SCHEMAS.length} handoff schemas`)

  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('morpheus_snapshots','morpheus_seals','morpheus_verifications',
                          'agent_decision_rights','approval_requests','kaizen_error_classes',
                          'kaizen_learning_cases','handoff_requests','handoff_schemas',
                          'sub_agent_configs','sentinel_node_keys')
     ORDER BY table_name`,
  )
  console.log('\ngovernance tables present:')
  console.log(rows.map((r) => `  ${r.table_name}`).join('\n'))
} catch (error) {
  console.error('migration failed:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
