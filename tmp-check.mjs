import { readFileSync } from 'node:fs'
import pg from 'pg'

for (const f of ['.env.development.local', '.env.local', '.env']) {
  try {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  } catch {}
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const { rows } = await pool.query(
  `SELECT id, "userName", goal, industry, "rosterKeys", "researchMethod" FROM orientation_profiles`,
)
console.log('orientation profiles:', JSON.stringify(rows, null, 2))

const p = await pool.query(`SELECT count(*)::int AS n FROM projects`)
console.log('projects:', p.rows[0].n)

const b = await pool.query(
  `SELECT "specialistKey", "displayName", position FROM project_bots ORDER BY position`,
)
console.log('project bots:', JSON.stringify(b.rows))

await pool.end()
