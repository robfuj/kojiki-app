#!/usr/bin/env node
/**
 * Migrates orientation_profiles from the function-line shape to the
 * user-oriented shape. Idempotent — safe to run repeatedly.
 *
 * The Orientation Protocol used to ask which organizational function the human
 * represented, then instantiated all eight departments for every project. It
 * now asks who the user is, what they are trying to accomplish, and what
 * industry they are in; the orchestrator derives the roster from the goal.
 *
 * Run with: pnpm ontology:migrate
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
  // Add the user-oriented columns and the orchestrator output columns.
  `ALTER TABLE orientation_profiles
     ADD COLUMN IF NOT EXISTS "userName" text,
     ADD COLUMN IF NOT EXISTS goal text,
     ADD COLUMN IF NOT EXISTS jurisdiction text,
     ADD COLUMN IF NOT EXISTS "researchBrief" jsonb,
     ADD COLUMN IF NOT EXISTS "researchMethod" text,
     ADD COLUMN IF NOT EXISTS "rosterRationale" text,
     ADD COLUMN IF NOT EXISTS "rosterKeys" jsonb NOT NULL DEFAULT '[]',
     ADD COLUMN IF NOT EXISTS "researchedAt" timestamp`,

  // Carry the old identity forward so existing rows survive the NOT NULL switch.
  `UPDATE orientation_profiles
     SET "userName" = "agentName"
     WHERE "userName" IS NULL AND "agentName" IS NOT NULL`,
  `UPDATE orientation_profiles SET goal = 'Not recorded' WHERE goal IS NULL`,
  `UPDATE orientation_profiles SET industry = 'Not recorded' WHERE industry IS NULL`,

  `ALTER TABLE orientation_profiles
     ALTER COLUMN "userName" SET NOT NULL,
     ALTER COLUMN goal SET NOT NULL,
     ALTER COLUMN industry SET NOT NULL`,

  // Drop the function-line columns the protocol no longer asks about.
  `ALTER TABLE orientation_profiles
     DROP COLUMN IF EXISTS "agentName",
     DROP COLUMN IF EXISTS "functionLine",
     DROP COLUMN IF EXISTS sector,
     DROP COLUMN IF EXISTS country,
     DROP COLUMN IF EXISTS region,
     DROP COLUMN IF EXISTS "regulatoryRegime",
     DROP COLUMN IF EXISTS "groupId",
     DROP COLUMN IF EXISTS "siblingAgents"`,
]

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

try {
  for (const [index, sql] of STEPS.entries()) {
    await pool.query(sql)
    console.log(`[${index + 1}/${STEPS.length}] ok`)
  }

  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'orientation_profiles' ORDER BY ordinal_position`,
  )
  console.log('\norientation_profiles columns:')
  console.log(rows.map((r) => `  ${r.column_name}`).join('\n'))
} catch (error) {
  console.error('migration failed:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
