/**
 * Generates lib/ontology/generated.ts from the vendored kojiki-ontology sources
 * in ontology/. Run with `pnpm ontology:generate`; `pnpm ontology:check`
 * regenerates and fails if the committed output differs.
 *
 * Output is deterministic (no timestamps) so the check is a plain diff.
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parse as parseYaml } from 'yaml'

const ROOT = process.cwd()
const SOURCE_DIR = join(ROOT, 'ontology')
const OUT_FILE = join(ROOT, 'lib/ontology/generated.ts')

const UPSTREAM = {
  repo: 'robfuj/kojiki-ontology',
  ref: 'main',
  commit: 'ca89d3e3a9a8cb7e161d18d0f65d0e26e159feed',
}

const DECISION_VERBS = [
  'own',
  'recommend',
  'consult',
  'approve',
  'execute',
  'escalate',
  'automate',
]

function sha256(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

function read(path) {
  return readFileSync(path, 'utf8')
}

/** Content of the first matching `## <heading>` section, up to the next `## `. */
function section(markdown, headings) {
  const lines = markdown.split('\n')
  for (const heading of headings) {
    const start = lines.findIndex(
      (line) => line.trim().toLowerCase() === `## ${heading.toLowerCase()}`,
    )
    if (start === -1) continue
    const body = []
    for (let i = start + 1; i < lines.length; i += 1) {
      if (lines[i].startsWith('## ')) break
      body.push(lines[i])
    }
    return body.join('\n').trim()
  }
  return null
}

function bullets(body) {
  if (!body) return []
  return body
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
}

function firstLine(body) {
  if (!body) return null
  const line = body
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean)
  return line ? line.replace(/\*\*/g, '').trim() : null
}

function parseStage(file) {
  const base = file.replace(/\.md$/, '')
  const [, index, key] = base.match(/^(\d+)-(.+)$/) ?? []
  if (!index || !key) throw new Error(`Unrecognised stage filename: ${file}`)

  const markdown = read(join(SOURCE_DIR, 'prompts/stages', file))
  const titleLine = markdown.split('\n').find((l) => l.startsWith('# ')) ?? ''
  // "# SACCADE Stage — A Priori Problem Framing"
  const [, name, subtitle] =
    titleLine.replace(/^#\s*/, '').match(/^([A-Z]+)\s+Stage\s*—\s*(.+)$/) ?? []

  // Stages 01-06 use Authority / Must Not Become; the Kaizen stages 07-08 use
  // Purpose / Forbidden. Both express the same authority + boundary contract.
  const authority =
    firstLine(section(markdown, ['Authority'])) ??
    firstLine(section(markdown, ['Purpose']))
  // An empty array is truthy, so fall through on length rather than with ||.
  const mustNotBecome = bullets(section(markdown, ['Must Not Become']))
  const boundaryItems = mustNotBecome.length
    ? mustNotBecome
    : bullets(section(markdown, ['Forbidden']))

  if (!authority) throw new Error(`No authority/purpose found in ${file}`)

  return {
    index: Number(index),
    key,
    name: name ?? key.toUpperCase(),
    subtitle: subtitle ?? null,
    authority,
    boundary: boundaryItems,
    prompt: markdown.trim(),
    source: `ontology/prompts/stages/${file}`,
    sha256: sha256(markdown),
  }
}

/** Acronyms that must stay uppercase when a sub-agent key becomes a title. */
const ACRONYMS = new Set(['seo', 'aeo', 'pr', 'ab', 'ai', 'hr', 'okrs', 'okr'])

/** "seo-specialist" -> "SEO Specialist". Deterministic, no upstream title field. */
function titleFromKey(key) {
  return key
    .split('-')
    .filter(Boolean)
    .map((part) =>
      ACRONYMS.has(part)
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(' ')
}

/**
 * Parses one sub-agent config.yaml. A sub-agent is the unit of execution inside
 * a department: its skills, tools and decision rights together form the job
 * description the department head hands it when assigning work.
 */
function parseSubAgent(specDir, subDir, parent) {
  const rel = `specialists/${specDir}/sub-agents/${subDir}`
  const configPath = join(SOURCE_DIR, rel, 'config.yaml')
  const raw = read(configPath)
  const config = parseYaml(raw)

  const agent = config.agent ?? {}
  const model = config.model ?? {}
  const rights = config.decision_rights ?? {}

  const decisionRights = Object.fromEntries(
    DECISION_VERBS.map((verb) => [verb, rights[verb] ?? []]),
  )

  const handoffs = (config.handoffs ?? []).map((handoff) => {
    const schemaPath = handoff.payload_schema ?? null
    return {
      target: handoff.target,
      trigger: handoff.trigger,
      payloadSchema: schemaPath,
      payloadSchemaResolved: schemaPath
        ? existsSync(join(SOURCE_DIR, schemaPath))
        : false,
    }
  })

  const key = agent.name ?? subDir

  return {
    key,
    title: titleFromKey(key),
    parentSpecialistKey: parent.key,
    parentDepartment: agent.parent_department ?? parent.department,
    description: agent.description ?? '',
    skills: config.skills ?? [],
    tools: config.tools ?? [],
    temperature: model.temperature ?? null,
    maxTokens: model.max_tokens ?? null,
    upstreamModel: model.model ?? null,
    decisionRights,
    handoffs,
    source: `ontology/${rel}/config.yaml`,
    sha256: sha256(raw),
  }
}

function parseSpecialist(dir) {
  const configPath = join(SOURCE_DIR, 'specialists', dir, 'config.yaml')
  const raw = read(configPath)
  const config = parseYaml(raw)

  const agent = config.agent ?? {}
  const model = config.model ?? {}
  const rights = config.decision_rights ?? {}

  const decisionRights = Object.fromEntries(
    DECISION_VERBS.map((verb) => [verb, rights[verb] ?? []]),
  )

  const handoffs = (config.handoffs ?? []).map((handoff) => {
    const schemaPath = handoff.payload_schema ?? null
    return {
      target: handoff.target,
      trigger: handoff.trigger,
      payloadSchema: schemaPath,
      // Upstream config.yaml files reference schemas/handoff-*.json paths that
      // are not present in the repository. Record the gap instead of implying
      // the schema is available.
      payloadSchemaResolved: schemaPath
        ? existsSync(join(SOURCE_DIR, schemaPath))
        : false,
    }
  })

  const specialist = {
    key: agent.name ?? dir,
    department: agent.department ?? dir,
    description: agent.description ?? '',
    skills: config.skills ?? [],
    tools: config.tools ?? [],
    temperature: model.temperature ?? null,
    maxTokens: model.max_tokens ?? null,
    upstreamModel: model.model ?? null,
    decisionRights,
    handoffs,
    source: `ontology/specialists/${dir}/config.yaml`,
    sha256: sha256(raw),
  }

  const subAgentDir = join(SOURCE_DIR, 'specialists', dir, 'sub-agents')
  specialist.subAgents = existsSync(subAgentDir)
    ? readdirSync(subAgentDir)
        .sort()
        .filter((sub) =>
          existsSync(join(subAgentDir, sub, 'config.yaml')),
        )
        .map((sub) => parseSubAgent(dir, sub, specialist))
    : []

  return specialist
}

function sortedEntries(dir) {
  return readdirSync(join(SOURCE_DIR, dir)).sort()
}

const specialists = sortedEntries('specialists')
  .filter((dir) => existsSync(join(SOURCE_DIR, 'specialists', dir, 'config.yaml')))
  .map(parseSpecialist)

const stages = sortedEntries('prompts/stages')
  .filter((file) => file.endsWith('.md'))
  .map(parseStage)
  .sort((a, b) => a.index - b.index)

const PROSE_FILES = [
  ['orientation', 'orientation.md'],
  ['linePrompts', 'line-prompts.md'],
  ['universalFunctionArchitecture', 'universal-function-architecture.md'],
]

const prose = Object.fromEntries(
  PROSE_FILES.map(([name, file]) => [
    name,
    {
      text: read(join(SOURCE_DIR, 'prompts', file)).trim(),
      path: `ontology/prompts/${file}`,
    },
  ]),
)

const stageSchemas = Object.fromEntries(
  sortedEntries('schemas')
    .filter((file) => file.endsWith('.json'))
    .map((file) => [
      file.replace(/\.json$/, ''),
      JSON.parse(read(join(SOURCE_DIR, 'schemas', file))),
    ]),
)

const manifest = {
  ...UPSTREAM,
  files: [
    ...specialists.map((s) => ({ path: s.source, sha256: s.sha256 })),
    ...stages.map((s) => ({ path: s.source, sha256: s.sha256 })),
    ...Object.values(prose).map((entry) => ({
      path: entry.path,
      sha256: sha256(entry.text),
    })),
  ].sort((a, b) => a.path.localeCompare(b.path)),
}

const unresolved = specialists.flatMap((s) =>
  s.handoffs
    .filter((h) => h.payloadSchema && !h.payloadSchemaResolved)
    .map((h) => `${s.key} -> ${h.target} (${h.payloadSchema})`),
)

const banner = `/**
 * AUTO-GENERATED by scripts/generate-ontology.mjs from the vendored sources in
 * ontology/. Do not edit by hand — edit ontology/ and re-run
 * \`pnpm ontology:generate\`.
 *
 * Upstream: ${UPSTREAM.repo}@${UPSTREAM.ref} (${UPSTREAM.commit})
 *
 * ${unresolved.length} handoff payload schema(s) referenced by upstream config.yaml
 * files do not exist in the repository and are marked payloadSchemaResolved: false.
 */
`

const output = `${banner}
export const ONTOLOGY_SOURCE = ${JSON.stringify(
  { repo: UPSTREAM.repo, ref: UPSTREAM.ref, commit: UPSTREAM.commit },
  null,
  2,
)} as const

export const ONTOLOGY_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const

export type DecisionRightVerb = ${DECISION_VERBS.map((v) => `'${v}'`).join(' | ')}

export type DecisionRights = Record<DecisionRightVerb, string[]>

export interface Handoff {
  target: string
  trigger: string
  payloadSchema: string | null
  payloadSchemaResolved: boolean
}

/**
 * A sub-agent is the unit of execution inside a department. Its skills, tools
 * and decision rights together form the job description its department head
 * hands it when assigning work.
 */
export interface SubAgent {
  key: string
  title: string
  parentSpecialistKey: string
  parentDepartment: string
  description: string
  skills: string[]
  tools: string[]
  temperature: number | null
  maxTokens: number | null
  upstreamModel: string | null
  decisionRights: DecisionRights
  handoffs: Handoff[]
  source: string
  sha256: string
}

export interface Specialist {
  key: string
  department: string
  description: string
  skills: string[]
  tools: string[]
  subAgents: SubAgent[]
  temperature: number | null
  maxTokens: number | null
  upstreamModel: string | null
  decisionRights: DecisionRights
  handoffs: Handoff[]
  source: string
  sha256: string
}

export interface SynapsisStage {
  index: number
  key: string
  name: string
  subtitle: string | null
  authority: string
  boundary: string[]
  prompt: string
  source: string
  sha256: string
}

export const SPECIALISTS: Specialist[] = ${JSON.stringify(specialists, null, 2)}

export const SYNAPSIS_STAGES: SynapsisStage[] = ${JSON.stringify(stages, null, 2)}

export const ORIENTATION_PROMPT = ${JSON.stringify(prose.orientation.text)}

export const LINE_PROMPTS = ${JSON.stringify(prose.linePrompts.text)}

export const UNIVERSAL_FUNCTION_ARCHITECTURE = ${JSON.stringify(
  prose.universalFunctionArchitecture.text,
)}

export const STAGE_SCHEMAS: Record<string, unknown> = ${JSON.stringify(
  stageSchemas,
  null,
  2,
)}
`

if (process.argv.includes('--check')) {
  const current = existsSync(OUT_FILE) ? read(OUT_FILE) : null
  if (current !== output) {
    const where = current === null ? 'missing' : 'out of date'
    console.error(
      `[ontology] lib/ontology/generated.ts is ${where}.\n` +
        `Run \`pnpm ontology:generate\` and commit the result.\n` +
        `Sources: ${relative(ROOT, SOURCE_DIR)}/`,
    )
    process.exit(1)
  }
  console.log('[ontology] generated.ts is up to date with ontology/')
} else {
  writeFileSync(OUT_FILE, output)
  console.log(
    `[ontology] wrote ${relative(ROOT, OUT_FILE)}\n` +
      `  ${specialists.length} specialists, ${stages.length} SYNAPSIS stages, ` +
      `${Object.keys(stageSchemas).length} stage schemas\n` +
      `  upstream ${UPSTREAM.repo}@${UPSTREAM.commit.slice(0, 7)}` +
      (unresolved.length
        ? `\n  ${unresolved.length} unresolved handoff payload schema(s) flagged`
        : ''),
  )
}
