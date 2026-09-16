import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
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
