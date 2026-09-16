/**
 * Adds the language preference column.
 *
 * Idempotent, following the pattern of the other migrate-* scripts: it can be run
 * repeatedly and against a database that already has the column.
 */
import pg from 'pg'

const connectionString =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL

if (!connectionString) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const client = new pg.Client({ connectionString })

const statements = [
  `ALTER TABLE user_preferences
     ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en'`,
]

try {
  await client.connect()
  for (const statement of statements) {
    await client.query(statement)
  }
  console.log('locale migration complete')
} catch (error) {
  console.error('locale migration failed:', error.message)
  process.exit(1)
} finally {
  await client.end()
}
