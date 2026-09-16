#!/usr/bin/env node
/**
 * Creates the documents table (agent-readable context extracted from uploaded
 * files) and the user_preferences table (per-user accent choice).
 * Idempotent — safe to run repeatedly.
 *
 * Run with: pnpm db:migrate-documents
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
  // Extracted text rather than bytes: there is no object store here, and the only
  // thing an agent does with a document is read it. `source` and `sourceRef` are
  // the seam for external connectors such as Google Drive, which write the same
  // row shape with a different source.
  `CREATE TABLE IF NOT EXISTS documents (
     id text PRIMARY KEY,
     "userId" text NOT NULL,
     "projectId" text,
     name text NOT NULL,
     "mimeType" text NOT NULL,
     "sizeBytes" integer NOT NULL DEFAULT 0,
     "charCount" integer NOT NULL DEFAULT 0,
     content text NOT NULL,
     source text NOT NULL DEFAULT 'upload',
     "sourceRef" text,
     "createdAt" timestamp NOT NULL DEFAULT now()
   )`,
  // Chat lists a user's documents newest first, optionally scoped to one project.
  `CREATE INDEX IF NOT EXISTS documents_user_created_idx
     ON documents ("userId", "createdAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS documents_project_idx
     ON documents ("projectId")`,

  // Interface preferences live apart from the auth user table, whose shape is
  // owned by Better Auth.
  `CREATE TABLE IF NOT EXISTS user_preferences (
     "userId" text PRIMARY KEY,
     "accentKey" text NOT NULL DEFAULT 'seal',
     "updatedAt" timestamp NOT NULL DEFAULT now()
   )`,

  // What the orchestrator found and asked at project creation, so agents plan
  // against the user's answers rather than the goal sentence alone.
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS "intakeContext" jsonb`,
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
       AND table_name IN ('documents','user_preferences')
     ORDER BY table_name`,
  )
  console.log('\ntables present:')
  console.log(rows.map((r) => `  ${r.table_name}`).join('\n'))

  const { rows: cols } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'projects' AND column_name = 'intakeContext'`,
  )
  console.log('\nprojects.intakeContext present:', cols.length > 0)
} catch (error) {
  console.error('migration failed:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
