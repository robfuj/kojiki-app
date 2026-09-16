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

export const orientationProfiles = pgTable('orientation_profiles', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  agentName: text('agentName').notNull(),
  functionLine: text('functionLine').notNull(),
  industry: text('industry'),
  sector: text('sector'),
  country: text('country'),
  region: text('region'),
  regulatoryRegime: text('regulatoryRegime'),
  geography: text('geography'),
  businessModel: text('businessModel'),
  groupId: text('groupId'),
  siblingAgents: jsonb('siblingAgents').notNull().default([]),
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

export const chatSessions = pgTable('chat_sessions', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  projectId: text('projectId').notNull(),
  botId: text('botId').notNull(),
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
