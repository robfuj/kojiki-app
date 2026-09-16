import {
  boolean,
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
  // Set once the head has folded the result back into the OKR tree.
  reabsorbedAt: timestamp('reabsorbedAt'),
  proposedObjectiveId: text('proposedObjectiveId'),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
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
