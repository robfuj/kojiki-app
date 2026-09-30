#!/usr/bin/env node
/**
 * Adds the free-first preference column to user_preferences.
 * Idempotent — safe to run repeatedly.
 *
 * Run with: pnpm db:migrate-free-first
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
  // On by default: the system's work is drafting and evaluation, most of which
  // does not need a paid model. Existing users keep the preference they have
  // always had in practice — the cheapest thing that works.
  `ALTER TABLE user_preferences
     ADD COLUMN IF NOT EXISTS "freeFirst" boolean NOT NULL DEFAULT true`,
]

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

try {
  for (const step of STEPS) {
    await client.query(step)
  }
  console.log('free-first migration complete')
} finally {
  await client.end()
}
