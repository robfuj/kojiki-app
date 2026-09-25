import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

// The Orientation Protocol is about the user, not about an organizational
// function. The user says who they are, what they are trying to accomplish, and
// what industry they are in. The orchestrator then researches that goal and
// industry and decides which canonical specialists the goal actually needs —
// the roster is a consequence of the goal, not something the human declares.
export const orientationProfiles = pgTable('orientation_profiles', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  // How the department agents address the user.
  userName: text('userName').notNull(),
  // What the user is trying to accomplish. Drives orchestrator research and
  // roster selection.
  goal: text('goal').notNull(),
  industry: text('industry').notNull(),
  // Optional context that sharpens the orchestrator's research.
  jurisdiction: text('jurisdiction'),
  geography: text('geography'),
  businessModel: text('businessModel'),
  // Orchestrator output.
  researchBrief: jsonb('researchBrief'),
  researchMethod: text('researchMethod'),
  rosterRationale: text('rosterRationale'),
  rosterKeys: jsonb('rosterKeys').notNull().default([]),
  researchedAt: timestamp('researchedAt'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  completedAt: timestamp('completedAt'),
})

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  name: text('name').notNull(),
  objective: text('objective'),
  orientationId: text('orientationId'),
  status: text('status').notNull().default('active'),
  // What the orchestrator found and asked when this project was created: the
  // research brief, the clarifying questions and the user's answers, and why the
  // roster was chosen. Agents read it so they plan against what the user actually
  // said rather than against the goal sentence alone.
  intakeContext: jsonb('intakeContext'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const projectBots = pgTable('project_bots', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId').notNull(),
  specialistKey: text('specialistKey').notNull(),
  displayName: text('displayName').notNull(),
  functionLine: text('functionLine').notNull(),
  mandate: text('mandate'),
  decisionRights: jsonb('decisionRights').notNull().default({}),
  handoffTargets: jsonb('handoffTargets').notNull().default([]),
  synapsisStages: jsonb('synapsisStages').notNull().default([]),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// A conversation is with one agent. `agentKind` says which layer that agent sits
// at: a department head (a project bot), one of its sub-agents (addressable
// individually, e.g. the SEO Specialist under Marketing), or the orchestrator
// itself. Sub-agent conversations can be scoped to a single sub-goal so the
// sub-goal panel shows the work happening on that node.
export const chatSessions = pgTable('chat_sessions', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId').notNull(),
  // Null for the orchestrator, which is not a project bot.
  botId: text('botId'),
  agentKind: text('agentKind').notNull().default('department'),
  // Set when agentKind is 'sub_agent'; scoped by its parent department.
  subAgentKey: text('subAgentKey'),
  parentSpecialistKey: text('parentSpecialistKey'),
  // Set when the conversation belongs to one OKR node.
  objectiveId: text('objectiveId'),
  title: text('title'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  sessionId: text('sessionId').notNull(),
  role: text('role').notNull(),
  parts: jsonb('parts').notNull().default([]),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const decisions = pgTable('decisions', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId').notNull(),
  botId: text('botId'),
  sessionId: text('sessionId'),
  stage: text('stage').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  payload: jsonb('payload').notNull().default({}),
  status: text('status').notNull().default('proposed'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// OKR tree. `parentObjectiveId` is null on the project's Overall Goal (the root);
// department agents create sub-goals beneath it, and every node carries its own
// completion percentage. Parent progress rolls up from its children.
export const objectives = pgTable('objectives', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId').notNull(),
  parentObjectiveId: text('parentObjectiveId'),
  // The department that owns the node.
  ownerBotId: text('ownerBotId'),
  // The sub-agent that actually does the work, recorded when a department head
  // reabsorbs a finished task and proposes the node. This is what makes a node
  // read as "proposed · Marketing · SEO Specialist".
  assigneeSubAgentKey: text('assigneeSubAgentKey'),
  assigneeSubAgentTitle: text('assigneeSubAgentTitle'),
  title: text('title').notNull(),
  description: text('description'),
  // The window the node is meant to complete in, e.g. "Q3 2026". Display-only:
  // the orchestrator proposes it and the user edits it in the OKR header.
  timeframe: text('timeframe'),
  kind: text('kind').notNull().default('sub_goal'),
  status: text('status').notNull().default('proposed'),
  progress: integer('progress').notNull().default(0),
  depth: integer('depth').notNull().default(0),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

// A unit of execution. A department head reads a sub-goal, picks whichever of its
// sub-agents the work needs, and hands each one a brief assembled from that
// sub-agent's ontology skills, tools and decision rights. The sub-agent runs the
// brief; the head then reabsorbs the result and proposes an OKR node naming the
// sub-agent that did the work.
export const subAgentTasks = pgTable('sub_agent_tasks', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId').notNull(),
  objectiveId: text('objectiveId').notNull(),
  // The department head that assigned the work.
  assignedByBotId: text('assignedByBotId').notNull(),
  parentSpecialistKey: text('parentSpecialistKey').notNull(),
  subAgentKey: text('subAgentKey').notNull(),
  subAgentTitle: text('subAgentTitle').notNull(),
  title: text('title').notNull(),
  // The job description handed to the sub-agent, derived from the ontology.
  brief: text('brief').notNull(),
  skills: jsonb('skills').notNull().default([]),
  status: text('status').notNull().default('proposed'),
  resultSummary: text('resultSummary'),
  result: jsonb('result'),
  progress: integer('progress').notNull().default(0),

  // KAIZEN — Plan. The head defines what "done" means before the sub-agent runs,
  // so reabsorption is evidence-based rather than taking the sub-agent's word for
  // it. Each criterion carries a metric, target, comparison operator and weight.
  successCriteria: jsonb('successCriteria').notNull().default([]),
  guardrails: jsonb('guardrails').notNull().default([]),
  measurementWindowDays: integer('measurementWindowDays'),

  // KAIZEN — Do/Check. Actuals captured against the criteria, then the verdict.
  // `LEARNING` is the third state upstream defines: a failure that produced a
  // learning case worth carrying forward, not merely a rejection.
  actuals: jsonb('actuals'),
  validationResult: text('validationResult'),
  outcomeScore: integer('outcomeScore'),
  guardrailBreaches: jsonb('guardrailBreaches').notNull().default([]),
  checkedAt: timestamp('checkedAt'),

  // NEURAXIS — Act. Set when Check failed: which error class the failure belongs
  // to and how far it escalated. L0-L2 are autonomous; L3/L4 open a gate request
  // that blocks until the user decides.
  errorClass: text('errorClass'),
  escalationLayer: text('escalationLayer'),
  escalationId: text('escalationId'),
  gateRequestId: text('gateRequestId'),

  // MODEL ROUTING — the head proposes which model should run the task and why,
  // together with what it expects to cost. Nothing runs until the user approves,
  // because the choice spends the user's money and a cheaper model may quietly
  // degrade the work.
  proposedModelId: text('proposedModelId'),
  proposedModelLabel: text('proposedModelLabel'),
  proposedProvider: text('proposedProvider'),
  modelRationale: text('modelRationale'),
  estimatedInputTokens: integer('estimatedInputTokens'),
  estimatedOutputTokens: integer('estimatedOutputTokens'),
  estimatedCostUsd: doublePrecision('estimatedCostUsd'),

  // The user's decision. Kept separate from the proposal so the record shows what
  // was asked for and what was actually authorised, which are not always the same.
  approvedModelId: text('approvedModelId'),
  approvedModelLabel: text('approvedModelLabel'),
  approvedProvider: text('approvedProvider'),
  modelApprovedAt: timestamp('modelApprovedAt'),

  // Actual consumption, read from the provider's own usage figures after the run
  // rather than estimated, so the running total is real spend.
  actualInputTokens: integer('actualInputTokens'),
  actualOutputTokens: integer('actualOutputTokens'),
  actualCostUsd: doublePrecision('actualCostUsd'),
  modelUsedId: text('modelUsedId'),

  // Set once the head has folded the result back into the OKR tree.
  reabsorbedAt: timestamp('reabsorbedAt'),
  proposedObjectiveId: text('proposedObjectiveId'),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

// The user's provider connections, captured during Orientation and editable later.
// One row per provider; `isDefault` marks the one used when a task does not name
// a provider. The key is encrypted at rest (see lib/secrets.ts) and is never
// returned to the client in any form other than a last-four mask.
export const providerConnections = pgTable(
  'provider_connections',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    // openrouter | anthropic | openai
    provider: text('provider').notNull(),
    encryptedKey: text('encryptedKey').notNull(),
    isDefault: boolean('isDefault').notNull().default(false),
    // Set once a key has been used successfully, so a bad key is visible.
    lastVerifiedAt: timestamp('lastVerifiedAt'),
    lastError: text('lastError'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  // One connection per provider per user; connecting twice replaces rather than
  // duplicates, so there is never ambiguity about which key is in use.
  (table) => [uniqueIndex('provider_connections_user_provider_idx').on(table.userId, table.provider)],
)

// A cached snapshot of the live provider catalogs. Model IDs and prices drift, so
// this is a cache with a fetch timestamp rather than a source of truth: the
// provider's own API is authoritative and this table is refreshed from it.
export const modelCatalog = pgTable('model_catalog', {
  // `${provider}:${modelId}` — unique across providers.
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  modelId: text('modelId').notNull(),
  label: text('label').notNull(),
  contextLength: integer('contextLength'),
  // USD per million tokens, as published by the provider.
  inputPricePer1m: doublePrecision('inputPricePer1m').notNull().default(0),
  outputPricePer1m: doublePrecision('outputPricePer1m').notNull().default(0),
  modality: text('modality'),
  isFree: boolean('isFree').notNull().default(false),
  fetchedAt: timestamp('fetchedAt').notNull().defaultNow(),
})

// KAIZEN — Act. A causal trace of one attempt: what was hypothesised, what was
// done, what was expected versus observed, how the gap was classified, and what
// it escalated into. These are the corpus the Neuraxis governance gate counts as
// corroboration, so an agent cannot manufacture authority by asserting it.
export const kaizenExperiences = pgTable('kaizen_experiences', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId').notNull(),
  objectiveId: text('objectiveId'),
  taskId: text('taskId'),
  agentKey: text('agentKey').notNull(),
  agentTitle: text('agentTitle').notNull(),
  hypothesis: text('hypothesis').notNull(),
  action: text('action').notNull(),
  expected: text('expected').notNull(),
  observed: text('observed').notNull(),
  errorClass: text('errorClass').notNull(),
  escalationLayer: text('escalationLayer').notNull(),
  // L2 redefinitions carry lineage: what problem this one supersedes, and why.
  redefinition: text('redefinition'),
  supersedes: text('supersedes'),
  reason: text('reason'),
  insight: text('insight'),
  reusable: boolean('reusable').notNull().default(false),
  // Sealed into the ledger so the gate's corroboration bar counts verified traces.
  sentinelEntryId: text('sentinelEntryId'),
  recordedAt: timestamp('recordedAt').notNull().defaultNow(),
})

// NEURAXIS — the vertical axis. One row per escalation: the failure, its class,
// the layer it reached, and whether that layer may act on its own.
export const neuraxisEscalations = pgTable('neuraxis_escalations', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId').notNull(),
  objectiveId: text('objectiveId'),
  taskId: text('taskId'),
  experienceId: text('experienceId'),
  agentKey: text('agentKey').notNull(),
  agentTitle: text('agentTitle').notNull(),
  errorClass: text('errorClass').notNull(),
  layer: text('layer').notNull(),
  // True for L0/L1/L2 — the agent may proceed. False for L3/L4, which block.
  autonomous: boolean('autonomous').notNull(),
  summary: text('summary').notNull(),
  // The bounded, versioned problem restatement an L2 escalation produces.
  redefinition: text('redefinition'),
  supersedes: text('supersedes'),
  reason: text('reason'),
  status: text('status').notNull().default('resolved'),
  gateRequestId: text('gateRequestId'),
  sentinelEntryId: text('sentinelEntryId'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// NEURAXIS governance gate. An L3 (ontology) or L4 (meta-strategy) change is a
// change to an agent's own authority, so it never self-applies: the request blocks
// here until the user approves or denies it. This is the mechanism that stops an
// agent quietly expanding its own decision rights.
export const gateRequests = pgTable('gate_requests', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId').notNull(),
  objectiveId: text('objectiveId'),
  taskId: text('taskId'),
  escalationId: text('escalationId'),
  // ontology | meta_strategy
  changeType: text('changeType').notNull(),
  layer: text('layer').notNull(),
  requestedByAgent: text('requestedByAgent').notNull(),
  requestedByTitle: text('requestedByTitle').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  // What would change, and what it would cost if approved.
  proposedChange: jsonb('proposedChange').notNull().default({}),
  recommendation: text('recommendation'),
  consult: jsonb('consult').notNull().default([]),
  approveRole: text('approveRole'),
  // How many distinct verified experiences corroborate the request.
  corroborationCount: integer('corroborationCount').notNull().default(0),
  status: text('status').notNull().default('pending'),
  decision: text('decision'),
  decisionNote: text('decisionNote'),
  decidedAt: timestamp('decidedAt'),
  // Upstream gates carry an SLA; a breach is surfaced, never auto-applied.
  slaDueAt: timestamp('slaDueAt'),
  sentinelEntryId: text('sentinelEntryId'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// SENTINEL signing key. Exactly ONE keypair per project, generated on first use
// and held only by the server runtime.
//
// This deliberately diverges from upstream Kojiki, which issues a private key per
// department. Here no agent holds a key at all: an agent cannot sign, so it cannot
// mint provenance for its own claims, cannot backdate an engagement, and cannot
// repudiate one. Every entry is written by the runtime and merely *names* the
// agent that acted. A rogue agent can therefore do damage, but it cannot rewrite
// the record of having done it — which is the whole point of the ledger.
export const sentinelKeys = pgTable('sentinel_keys', {
  projectId: text('projectId').primaryKey(),
  userId: text('userId').notNull(),
  publicKey: text('publicKey').notNull(),
  privateKey: text('privateKey').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// SENTINEL provenance ledger. Append-only and hash-chained: every time a node or
// specialist is brought in, the engagement is wrapped in a non-fungible token
// carrying its own hash, the previous entry's hash, and the runtime's Ed25519
// signature. Rows are never updated or deleted — that is what makes the chain
// auditable, and why there is no update path anywhere in lib/sentinel.ts.
export const sentinelEntries = pgTable('sentinel_entries', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId').notNull(),
  // Monotonic per project. Unique so a concurrent append fails loudly rather than
  // silently forking the chain.
  sequence: integer('sequence').notNull(),
  prevEntryId: text('prevEntryId'),
  prevHash: text('prevHash'),
  // Non-fungibility, per upstream: hash(payloadHash + signer + prevEntryId).
  entryHash: text('entryHash').notNull(),
  entryType: text('entryType').notNull(),
  // The node brought in, e.g. "marketing-brand" or
  // "marketing-brand/seo-specialist".
  subjectKey: text('subjectKey').notNull(),
  subjectTitle: text('subjectTitle').notNull(),
  // Attribution only. The agent that acted; it holds no key and did not sign.
  signer: text('signer').notNull(),
  // The runtime's signature over the canonical entry payload.
  signature: text('signature').notNull(),
  publicKey: text('publicKey').notNull(),
  // What the token points at: a task, objective, or session id.
  payloadRef: text('payloadRef'),
  payloadHash: text('payloadHash').notNull(),
  payload: jsonb('payload').notNull().default({}),
  objectiveId: text('objectiveId'),
  recordedAt: timestamp('recordedAt').notNull().defaultNow(),
}, (table) => [
  // One sequence per project. A concurrent append collides here and fails loudly
  // instead of silently forking the chain.
  uniqueIndex('sentinel_entries_project_sequence_idx').on(
    table.projectId,
    table.sequence,
  ),
])

// MYCELIUM canopy tier: the substrate every agent-to-agent conversation travels
// through. Agents never talk to each other directly — a head dispatching a
// sub-agent, a sub-agent reporting back, or a head reabsorbing a result all emit
// a signal here first. That is what makes inter-agent traffic observable to the
// user in the sub-goal panel, and what Sentinel then seals into the ledger.
export const myceliumSignals = pgTable('mycelium_signals', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId').notNull(),
  objectiveId: text('objectiveId'),
  taskId: text('taskId'),
  // Who emitted it and who it is routed to, as ontology keys.
  fromAgent: text('fromAgent').notNull(),
  fromTitle: text('fromTitle').notNull(),
  toAgent: text('toAgent').notNull(),
  toTitle: text('toTitle').notNull(),
  // dispatch | report | reabsorb | query | answer
  signalKind: text('signalKind').notNull(),
  status: text('status').notNull().default('ROUTED'),
  body: text('body').notNull(),
  payload: jsonb('payload').notNull().default({}),
  // Sealed by Sentinel once the signal is wrapped in a provenance token.
  sentinelEntryId: text('sentinelEntryId'),
  firedAt: timestamp('firedAt').notNull().defaultNow(),
})

// Documents an agent may read as context.
//
// The extracted text is stored rather than the original bytes, because there is no
// object store in this deployment and because the only thing an agent can do with
// a document is read it. That keeps the database small and means nothing has to
// expire or be garbage collected.
//
// `source` and `sourceRef` are the seam for external connectors: a Google Drive
// import writes the same row with source 'google-drive' and the file ID in
// sourceRef, so no query or UI has to change when that connector arrives.
export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  // Null for a document that belongs to the user rather than to one project.
  projectId: text('projectId'),
  name: text('name').notNull(),
  mimeType: text('mimeType').notNull(),
  sizeBytes: integer('sizeBytes').notNull().default(0),
  charCount: integer('charCount').notNull().default(0),
  content: text('content').notNull(),
  // upload | google-drive | dropbox | onedrive — only 'upload' is wired today.
  source: text('source').notNull().default('upload'),
  sourceRef: text('sourceRef'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// Per-user interface preferences. Kept in its own table rather than as columns on
// the auth user row, because Better Auth owns that table's shape.
export const userPreferences = pgTable('user_preferences', {
  userId: text('userId').primaryKey(),
  // Key into ACCENTS in lib/accents.ts. Unknown keys fall back to the default.
  accentKey: text('accentKey').notNull().default('seal'),
  // BCP-47 tag constrained to LOCALES in lib/i18n/locales.ts. Unknown values are
  // resolved to the default on read, so a retired language cannot break a render.
  locale: text('locale').notNull().default('en'),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

// Progress samples for the OKR tree. Every time a node's percentage moves —
// directly or through a rollup from its children — a row is appended here, so the
// Home tab can draw a sparkline of where the objective has actually been rather
// than only where it is now. Append-only; nothing reads it for authority.
export const objectiveProgressHistory = pgTable('objective_progress_history', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  objectiveId: text('objectiveId').notNull(),
  progress: integer('progress').notNull(),
  recordedAt: timestamp('recordedAt').notNull().defaultNow(),
})

// One orchestrator review of the whole project: what each department found and
// what the orchestrator recommends doing about it. A new review is a new row;
// the tab shows the latest and the count of all of them.
export const orchestratorReviews = pgTable('orchestrator_reviews', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId').notNull(),
  // [{ department, severity, summary, detail }]
  findings: jsonb('findings').notNull().default([]),
  // [{ label, kind, targetId, departmentName }]
  actions: jsonb('actions').notNull().default([]),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Engine layer — the upstream kojiki-ontology persistence model (alembic 0001–
// 0015 plus the post-alembic engine/models.py). The upstream Python engine
// persists its mycelium registry, synapsis reasoning cycle, causal chains and
// governance changes as JSONB documents; these tables mirror that shape.
// Two documented deviations: every table carries `userId` because this app is
// multi-tenant and the upstream engine is single-tenant, and columns are
// camelCase to match the rest of this schema (upstream is snake_case).
// ─────────────────────────────────────────────────────────────────────────────

// The registry is the engine's authority on which nodes exist. A node is an
// orchestrator, a department head, or a sub-agent; `decisionRights` is the JSONB
// grant that says what the node may decide alone and what it must escalate.
export const myceliumNodes = pgTable('mycelium_nodes', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId'),
  domain: text('domain').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull().default('active'),
  pipelineManifestRef: text('pipelineManifestRef'),
  pipelineValidated: boolean('pipelineValidated').notNull().default(false),
  publicKey: text('publicKey'),
  keyStatus: text('keyStatus').notNull().default('none'),
  keyIssuedAt: timestamp('keyIssuedAt'),
  keyRevokedAt: timestamp('keyRevokedAt'),
  parentId: text('parentId'),
  decisionRights: jsonb('decisionRights').notNull().default({}),
  decisionRight: text('decisionRight'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

// Append-only audit of registry events, mirroring mycelium_node_audit upstream.
export const myceliumNodeAudit = pgTable('mycelium_node_audit', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  eventType: text('eventType').notNull(),
  nodeId: text('nodeId').notNull(),
  actor: text('actor'),
  detail: jsonb('detail').notNull().default({}),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// A learned pathway between two nodes. Every routed signal reinforces its edge;
// the counters are how the registry knows which pathways carry real traffic.
export const myceliumEdges = pgTable(
  'mycelium_edges',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    fromKr: text('fromKr').notNull(),
    toKr: text('toKr').notNull(),
    weight: text('weight').notNull().default('1'),
    reciprocalExchanges: integer('reciprocalExchanges').notNull().default(0),
    oneDirectionalExchanges: integer('oneDirectionalExchanges').notNull().default(0),
    lastReinforced: timestamp('lastReinforced'),
    triggerEvent: text('triggerEvent'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('mycelium_edges_kr_unique').on(table.userId, table.fromKr, table.toKr)],
)

export const myceliumEdgeExchanges = pgTable('mycelium_edge_exchanges', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  edgeId: text('edgeId').notNull(),
  fromKr: text('fromKr').notNull(),
  toKr: text('toKr').notNull(),
  exchangeType: text('exchangeType').notNull().default('one_directional'),
  signalId: text('signalId'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// Sealed evidence attached to a gate request upstream; kept for parity so gate
// decisions can carry signer-verified exhibits.
export const sentinelGateEvidence = pgTable(
  'sentinel_gate_evidence',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    gateRequestId: text('gateRequestId').notNull(),
    experienceId: text('experienceId').notNull(),
    signer: text('signer'),
    signature: text('signature'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sentinel_gate_evidence_unique').on(
      table.gateRequestId,
      table.experienceId,
      table.signer,
    ),
  ],
)

// ── Synapsis: the reasoning cycle, one row per stage, JSONB payloads ──

export const synapsisProblems = pgTable('synapsis_problems', {
  problemId: text('problemId').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId'),
  dispatchId: text('dispatchId'),
  goal: text('goal').notNull(),
  context: jsonb('context').notNull().default({}),
  assumptions: jsonb('assumptions').notNull().default([]),
  constraints: jsonb('constraints').notNull().default([]),
  unknowns: jsonb('unknowns').notNull().default([]),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const synapsisEvidence = pgTable('synapsis_evidence', {
  findingId: text('findingId').primaryKey(),
  userId: text('userId').notNull(),
  problemId: text('problemId').notNull(),
  question: text('question'),
  answer: text('answer'),
  source: text('source'),
  confidence: text('confidence'),
  retrievalState: text('retrievalState'),
  coverageLimits: jsonb('coverageLimits').notNull().default([]),
  sufficiency: jsonb('sufficiency').notNull().default({}),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const synapsisInterpretations = pgTable('synapsis_interpretations', {
  interpretationId: text('interpretationId').primaryKey(),
  userId: text('userId').notNull(),
  problemId: text('problemId').notNull(),
  synthesis: text('synthesis'),
  confidence: text('confidence'),
  keyDrivers: jsonb('keyDrivers').notNull().default([]),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const synapsisStrategies = pgTable('synapsis_strategies', {
  strategyId: text('strategyId').primaryKey(),
  userId: text('userId').notNull(),
  problemId: text('problemId').notNull(),
  interpretationRef: text('interpretationRef'),
  objective: text('objective'),
  rationale: text('rationale'),
  timeline: text('timeline'),
  successCriteria: jsonb('successCriteria').notNull().default([]),
  escalationConditions: jsonb('escalationConditions').notNull().default([]),
  decisionRights: jsonb('decisionRights').notNull().default({}),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// `strategyId` is nullable here (upstream: NOT NULL FK) because this app's
// dispatch writes the problem and the output directly; the interpretation and
// strategy stages are recorded when a run produces them, not synthesised.
export const synapsisOutputs = pgTable('synapsis_outputs', {
  outputId: text('outputId').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId'),
  strategyId: text('strategyId'),
  content: jsonb('content').notNull().default({}),
  measurementWindow: jsonb('measurementWindow').notNull().default({}),
  confidence: text('confidence'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const synapsisOutcomes = pgTable('synapsis_outcomes', {
  outcomeId: text('outcomeId').primaryKey(),
  userId: text('userId').notNull(),
  outputId: text('outputId').notNull(),
  actuals: jsonb('actuals').notNull().default({}),
  evaluations: jsonb('evaluations').notNull().default({}),
  outcomeScore: text('outcomeScore'),
  targetMet: boolean('targetMet'),
  converged: boolean('converged'),
  iterationCount: integer('iterationCount'),
  guardrailViolations: jsonb('guardrailViolations').notNull().default([]),
  deviationAnalysis: text('deviationAnalysis'),
  confidence: text('confidence'),
  kaizenIteration: integer('kaizenIteration'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const synapsisLearning = pgTable('synapsis_learning', {
  learningId: text('learningId').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId'),
  cycleTimestamp: timestamp('cycleTimestamp').notNull().defaultNow(),
  experiences: jsonb('experiences').notNull().default([]),
  patterns: jsonb('patterns').notNull().default([]),
  reusableInsights: jsonb('reusableInsights').notNull().default([]),
  redefinitions: jsonb('redefinitions').notNull().default({}),
  outcomeScore: text('outcomeScore'),
  guardrailViolations: jsonb('guardrailViolations').notNull().default([]),
  confidence: text('confidence'),
  kaizenIteration: integer('kaizenIteration'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const kaizenIterations = pgTable('kaizen_iterations', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  problemId: text('problemId').notNull(),
  iteration: integer('iteration').notNull().default(1),
  phase: text('phase'),
  startedAt: timestamp('startedAt'),
  completedAt: timestamp('completedAt'),
  inputData: jsonb('inputData').notNull().default({}),
  outputData: jsonb('outputData').notNull().default({}),
  guardrailViolations: jsonb('guardrailViolations').notNull().default([]),
  learningGenerated: boolean('learningGenerated').notNull().default(false),
  experienceRefs: jsonb('experienceRefs').notNull().default([]),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// ── Causal chains: hash-linked replay of a dispatch, stage by stage ──

export const causalChains = pgTable('causal_chains', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId'),
  dispatchId: text('dispatchId').notNull(),
  startedAt: timestamp('startedAt').notNull().defaultNow(),
  completedAt: timestamp('completedAt'),
  totalTokens: integer('totalTokens'),
  totalLatencyMs: integer('totalLatencyMs'),
  finalProblemId: text('finalProblemId'),
  finalOutputId: text('finalOutputId'),
  finalLearningId: text('finalLearningId'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const causalNodes = pgTable('causal_nodes', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  chainId: text('chainId').notNull(),
  stage: text('stage').notNull(),
  artifactType: text('artifactType').notNull(),
  artifactId: text('artifactId'),
  contentHash: text('contentHash'),
  content: jsonb('content').notNull().default({}),
  agentId: text('agentId'),
  tools: jsonb('tools').notNull().default([]),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const causalTransitions = pgTable('causal_transitions', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  chainId: text('chainId').notNull(),
  fromStage: text('fromStage').notNull(),
  toStage: text('toStage').notNull(),
  inputHash: text('inputHash'),
  outputHash: text('outputHash'),
  agentId: text('agentId'),
  signer: text('signer'),
  signature: text('signature'),
  publicKey: text('publicKey'),
  inputSummary: text('inputSummary'),
  outputSummary: text('outputSummary'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// Every authority change — a gate decision, a redefinition, a roster change —
// lands here as a JSONB payload, the way upstream's governance_changes does.
export const governanceChanges = pgTable('governance_changes', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId'),
  changeType: text('changeType').notNull(),
  target: text('target'),
  payload: jsonb('payload').notNull().default({}),
  reason: text('reason'),
  gateId: text('gateId'),
  approver: text('approver'),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
})

export const deckDnaCache = pgTable('deck_dna_cache', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  cacheKey: text('cacheKey').notNull().unique(),
  department: text('department'),
  mode: text('mode'),
  templateData: jsonb('templateData').notNull().default({}),
  slides: jsonb('slides').notNull().default([]),
  hitCount: integer('hitCount').notNull().default(0),
  lastAccessed: timestamp('lastAccessed'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  expiresAt: timestamp('expiresAt'),
})
