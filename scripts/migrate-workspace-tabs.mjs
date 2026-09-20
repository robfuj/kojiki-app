#!/usr/bin/env node
/**
 * Creates the workspace-tabs tables: objective_progress_history (progress
 * samples that power the Home tab sparklines) and orchestrator_reviews
 * (persisted orchestrator reviews of the whole project), and adds
 * objectives.timeframe.
 * Idempotent — safe to run repeatedly.
 *
 * Run with: pnpm db:migrate-workspace-tabs
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
  // Append-only progress samples. Nothing reads these for authority; they exist
  // so the Home tab can show where an objective has been, not just where it is.
  `CREATE TABLE IF NOT EXISTS objective_progress_history (
     id text PRIMARY KEY,
     "userId" text NOT NULL,
     "objectiveId" text NOT NULL,
     progress integer NOT NULL,
     "recordedAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS objective_progress_history_objective_idx
     ON objective_progress_history ("objectiveId", "recordedAt")`,

  // One row per orchestrator review; the tab shows the latest.
  `CREATE TABLE IF NOT EXISTS orchestrator_reviews (
     id text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text NOT NULL,
     findings jsonb NOT NULL DEFAULT '[]',
     actions jsonb NOT NULL DEFAULT '[]',
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS orchestrator_reviews_project_idx
     ON orchestrator_reviews ("projectId", "createdAt")`,

  `ALTER TABLE objectives ADD COLUMN IF NOT EXISTS timeframe text`,
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
       AND table_name IN ('objective_progress_history','orchestrator_reviews')
     ORDER BY table_name`,
  )
  console.log('\ntables present:')
  console.log(rows.map((r) => `  ${r.table_name}`).join('\n'))

  const { rows: cols } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'objectives' AND column_name = 'timeframe'`,
  )
  console.log('\nobjectives.timeframe present:', cols.length > 0)
} catch (error) {
  console.error('migration failed:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
