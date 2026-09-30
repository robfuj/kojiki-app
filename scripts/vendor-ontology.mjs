#!/usr/bin/env node
/**
 * Vendors the definitional content of robfuj/kojiki-ontology into ./ontology.
 *
 * The upstream repo is mounted read-only by the v0 reference workspace. This
 * script copies the ontology *definitions* (YAML configs, prompt markdown,
 * JSON schemas) and deliberately skips Python implementation, __pycache__,
 * runtime causal_chains logs, and hidden scratch dirs.
 *
 * One local divergence is preserved on purpose: the `model:` line in each
 * specialist config.yaml. Model selection in this app is owned by
 * lib/providers.ts (free-first routing), so a blind overwrite would silently
 * regress routing on every re-vendor.
 *
 * Usage:
 *   node scripts/vendor-ontology.mjs           # copy upstream -> ./ontology
 *   node scripts/vendor-ontology.mjs --check   # report drift, exit 1 if any
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'

const UPSTREAM =
  process.env.KOJIKI_ONTOLOGY_SRC ??
  '/vercel/share/v0-reference-workspace-sources/robfuj/kojiki-ontology/main/engine/kojiki_core'

const DEST = join(process.cwd(), 'ontology')
const CHECK = process.argv.includes('--check')

const KEEP_EXT = new Set(['.yaml', '.yml', '.md', '.json'])
const SKIP_DIR = (name) =>
  name === '__pycache__' ||
  name === 'causal_chains' ||
  name.startsWith('.hidden') ||
  name.startsWith('.')

/** Walk a directory, yielding files whose extension we vendor. */
function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (KEEP_EXT.has(entry.name.slice(entry.name.lastIndexOf('.')))) yield full
  }
}

/**
 * Upstream ships a `model:` per specialist, but this app routes models itself.
 * Keep whatever we already have so re-vendoring cannot change routing.
 */
function preserveModelOverride(destPath, incoming) {
  if (!destPath.endsWith('config.yaml') || !existsSync(destPath)) return incoming
  const current = readFileSync(destPath, 'utf8')
  const currentModel = current.match(/^model:.*$/m)
  if (!currentModel) return incoming
  return incoming.replace(/^model:.*$/m, currentModel[0])
}

const SOURCES = [
  { from: join(UPSTREAM, 'specialists'), to: join(DEST, 'specialists') },
  { from: join(UPSTREAM, 'prompts'), to: join(DEST, 'prompts') },
]

let copied = 0
let unchanged = 0
const drift = []

for (const { from, to } of SOURCES) {
  if (!existsSync(from)) {
    console.error(`[vendor] missing upstream source: ${from}`)
    process.exit(2)
  }
  for (const src of walk(from)) {
    const rel = relative(from, src)
    const destPath = join(to, rel)
    const incoming = preserveModelOverride(destPath, readFileSync(src, 'utf8'))
    const existing = existsSync(destPath) ? readFileSync(destPath, 'utf8') : null

    if (existing === incoming) {
      unchanged++
      continue
    }
    drift.push(`${existing === null ? 'MISSING' : 'STALE'} ${rel}`)
    if (!CHECK) {
      mkdirSync(dirname(destPath), { recursive: true })
      writeFileSync(destPath, incoming)
    }
    copied++
  }
}

if (CHECK) {
  console.log(`[vendor] ${unchanged} in sync, ${drift.length} drifted`)
  for (const line of drift.slice(0, 40)) console.log('  ' + line)
  if (drift.length > 40) console.log(`  ... and ${drift.length - 40} more`)
  process.exit(drift.length === 0 ? 0 : 1)
}

console.log(`[vendor] wrote ${copied} files, ${unchanged} already in sync`)
console.log(`[vendor] next: node scripts/generate-ontology.mjs`)
