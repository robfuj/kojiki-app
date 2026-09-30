#!/usr/bin/env node
/**
 * Vendors the definitional content of robfuj/kojiki-ontology into ./ontology.
 *
 * The reference repo is mounted read-only by the v0 reference workspace. This
 * script copies only ontology *definitions* — specialist configs, prompts, and
 * JSON schemas — and deliberately skips runtime artifacts (causal_chains
 * execution logs, __pycache__, .hidden scratch dirs) that are not part of the
 * ontology contract.
 *
 * Usage: node scripts/vendor-ontology.mjs [--check]
 *   --check  report drift without writing (exit 1 if the vendor is stale)
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const UPSTREAM =
  process.env.KOJIKI_ONTOLOGY_PATH ??
  '/vercel/share/v0-reference-workspace-sources/robfuj/kojiki-ontology/main'
const CORE = join(UPSTREAM, 'engine/kojiki_core')
const DEST = join(ROOT, 'ontology')

const CHECK = process.argv.includes('--check')

/** Directories that hold runtime output rather than ontology definitions. */
const SKIP_DIRS = new Set(['__pycache__', 'causal_chains', '.hidden', '.git'])

/** File extensions that carry ontology definitions. */
const KEEP_EXT = new Set(['.yaml', '.yml', '.md', '.json'])

function* walk(dir) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (KEEP_EXT.has(entry.name.slice(entry.name.lastIndexOf('.')))) yield full
  }
}

/** Upstream definition root -> vendored destination root. */
const MAPPINGS = [
  { from: join(CORE, 'specialists'), to: join(DEST, 'specialists') },
  { from: join(CORE, 'prompts'), to: join(DEST, 'prompts') },
]

const plan = []
for (const { from, to } of MAPPINGS) {
  for (const src of walk(from)) {
    const rel = relative(from, src)
    plan.push({ src, dest: join(to, rel), rel: `${relative(CORE, from)}/${rel}` })
  }
}

let copied = 0
let unchanged = 0
const stale = []

for (const { src, dest, rel } of plan) {
  const content = readFileSync(src)
  if (existsSync(dest) && readFileSync(dest).equals(content)) {
    unchanged++
    continue
  }
  stale.push(rel)
  if (CHECK) continue
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, content)
  copied++
}

// Drop vendored files that no longer exist upstream so the vendor cannot drift
// by accumulation after an upstream rename or deletion.
const vendored = new Set(plan.map((p) => p.dest))
let removed = 0
for (const { to } of MAPPINGS) {
  for (const existing of walk(to)) {
    if (vendored.has(existing)) continue
    if (CHECK) {
      stale.push(`REMOVED ${relative(DEST, existing)}`)
      continue
    }
    rmSync(existing)
    removed++
  }
}

const specialists = existsSync(join(DEST, 'specialists'))
  ? readdirSync(join(DEST, 'specialists'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  : []

const summary = {
  upstream: UPSTREAM,
  definitions: plan.length,
  specialists,
  copied,
  unchanged,
  removed,
  stale: stale.length,
}

if (CHECK) {
  console.log(JSON.stringify(summary, null, 2))
  if (stale.length) {
    console.log(`\nDRIFT: ${stale.length} file(s) differ from upstream`)
    for (const s of stale.slice(0, 40)) console.log(`  ${s}`)
    process.exit(1)
  }
  console.log('\nVendor is in sync with upstream.')
} else {
  console.log(JSON.stringify(summary, null, 2))
  if (stale.length) {
    console.log(`\nVendored ${stale.length} changed file(s):`)
    for (const s of stale.slice(0, 40)) console.log(`  ${s}`)
  }
}
