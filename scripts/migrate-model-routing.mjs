#!/usr/bin/env node
/**
 * Creates the model routing layer: provider connections, the cached model
 * catalog, and the proposal / approval / actual-cost columns on sub-agent tasks.
 * Idempotent — safe to run repeatedly.
 *
 * Run with: pnpm db:migrate-model-routing
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
  // The head proposes a model and an expected cost; the user authorises it; the
  // run records what was actually consumed. Proposal and approval are separate
  // columns so the record distinguishes what was asked from what was permitted.
  `ALTER TABLE sub_agent_tasks
     ADD COLUMN IF NOT EXISTS "proposedModelId" text,
     ADD COLUMN IF NOT EXISTS "proposedModelLabel" text,
     ADD COLUMN IF NOT EXISTS "proposedProvider" text,
     ADD COLUMN IF NOT EXISTS "modelRationale" text,
     ADD COLUMN IF NOT EXISTS "estimatedInputTokens" integer,
     ADD COLUMN IF NOT EXISTS "estimatedOutputTokens" integer,
     ADD COLUMN IF NOT EXISTS "estimatedCostUsd" double precision,
     ADD COLUMN IF NOT EXISTS "approvedModelId" text,
     ADD COLUMN IF NOT EXISTS "approvedModelLabel" text,
     ADD COLUMN IF NOT EXISTS "approvedProvider" text,
     ADD COLUMN IF NOT EXISTS "modelApprovedAt" timestamp,
     ADD COLUMN IF NOT EXISTS "actualInputTokens" integer,
     ADD COLUMN IF NOT EXISTS "actualOutputTokens" integer,
     ADD COLUMN IF NOT EXISTS "actualCostUsd" double precision,
     ADD COLUMN IF NOT EXISTS "modelUsedId" text`,

  // Provider keys are encrypted at rest (lib/secrets.ts) and unique per provider
  // per user, so reconnecting replaces rather than duplicates.
  `CREATE TABLE IF NOT EXISTS provider_connections (
     id text PRIMARY KEY,
     "userId" text NOT NULL,
     provider text NOT NULL,
     "encryptedKey" text NOT NULL,
     "isDefault" boolean NOT NULL DEFAULT false,
     "lastVerifiedAt" timestamp,
     "lastError" text,
     "createdAt" timestamp NOT NULL DEFAULT now(),
     "updatedAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS provider_connections_user_provider_idx
     ON provider_connections ("userId", provider)`,

  // A cache of the providers' live catalogs, not a source of truth: model IDs and
  // prices drift, so fetchedAt records how stale the snapshot is.
  `CREATE TABLE IF NOT EXISTS model_catalog (
     id text PRIMARY KEY,
     provider text NOT NULL,
     "modelId" text NOT NULL,
     label text NOT NULL,
     "contextLength" integer,
     "inputPricePer1m" double precision NOT NULL DEFAULT 0,
     "outputPricePer1m" double precision NOT NULL DEFAULT 0,
     modality text,
     "isFree" boolean NOT NULL DEFAULT false,
     "fetchedAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS model_catalog_provider_idx
     ON model_catalog (provider, "inputPricePer1m")`,

  // Cost rollups read tasks by project and by objective.
  `CREATE INDEX IF NOT EXISTS sub_agent_tasks_cost_idx
     ON sub_agent_tasks ("projectId", "actualCostUsd")`,
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
       AND table_name IN ('provider_connections','model_catalog')
     ORDER BY table_name`,
  )
  console.log('\nmodel routing tables present:')
  console.log(rows.map((r) => `  ${r.table_name}`).join('\n'))

  const { rows: cols } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'sub_agent_tasks'
       AND column_name IN ('proposedModelId','approvedModelId','actualCostUsd','modelUsedId')
     ORDER BY column_name`,
  )
  console.log('\ntask cost columns present:')
  console.log(cols.map((r) => `  ${r.column_name}`).join('\n'))
} catch (error) {
  console.error('migration failed:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
