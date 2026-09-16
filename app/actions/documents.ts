'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { documents } from '@/lib/db/schema'
import {
  isSupportedMimeType,
  MAX_UPLOAD_BYTES,
  parseDocument,
  SUPPORTED_MIME_LABEL,
} from '@/lib/documents'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export type DocumentRow = typeof documents.$inferSelect

/** The row shape the UI needs — never the content, which can be 200KB each. */
export interface DocumentSummary {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
  charCount: number
  projectId: string | null
  source: string
  createdAt: Date
}

function summarise(row: DocumentRow): DocumentSummary {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    charCount: row.charCount,
    projectId: row.projectId,
    source: row.source,
    createdAt: row.createdAt,
  }
}

export async function listDocuments(
  projectId?: string | null,
): Promise<DocumentSummary[]> {
  const userId = await getUserId()

  const rows = await db
    .select()
    .from(documents)
    .where(
      projectId
        ? and(eq(documents.userId, userId), eq(documents.projectId, projectId))
        : eq(documents.userId, userId),
    )
    .orderBy(desc(documents.createdAt))

  return rows.map(summarise)
}

/**
 * Ingests an upload.
 *
 * The file is parsed here rather than in the browser: extraction decides what the
 * agents can read, so it belongs on the server where the size and type limits are
 * enforced and where a failure can be reported honestly instead of producing an
 * empty document that looks usable.
 */
export async function uploadDocument(input: {
  file: File
  projectId?: string | null
}): Promise<DocumentSummary> {
  const userId = await getUserId()
  const { file } = input

  if (!file || file.size === 0) throw new Error('Choose a file to upload.')

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `That file is too large. The limit is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`,
    )
  }

  // Browsers sometimes send an empty type for uncommon extensions. Rejecting is
  // better than guessing: a wrong guess produces a document with no text in it.
  if (!isSupportedMimeType(file.type)) {
    throw new Error(
      `"${file.name}" is not a supported file type. Supported: ${SUPPORTED_MIME_LABEL}.`,
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  const parsed = await parseDocument({
    buffer,
    mimeType: file.type,
    fileName: file.name,
  })

  // A project scope is only honoured when the project belongs to this user; an
  // unowned id would otherwise attach the document to someone else's context.
  let projectId: string | null = null
  if (input.projectId) {
    const { projects } = await import('@/lib/db/schema')
    const [owned] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.userId, userId)))
      .limit(1)
    projectId = owned?.id ?? null
  }

  const [row] = await db
    .insert(documents)
    .values({
      id: crypto.randomUUID(),
      userId,
      projectId,
      name: file.name.slice(0, 300),
      mimeType: file.type,
      sizeBytes: file.size,
      charCount: parsed.charCount,
      content: parsed.text,
      source: 'upload',
    })
    .returning()

  revalidatePath('/')
  return summarise(row)
}

export async function deleteDocument(documentId: string): Promise<void> {
  const userId = await getUserId()

  await db
    .delete(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)))

  revalidatePath('/')
}

/**
 * The documents that should be in an agent's context for a given project.
 *
 * Project-scoped documents first, then the user's unscoped library, newest first.
 * Content is selected here rather than by the caller so a list query never drags
 * 200KB rows through a component that only wanted names.
 */
export async function documentsForContext(
  projectId: string | null,
  limit = 6,
): Promise<{ name: string; content: string }[]> {
  const userId = await getUserId()

  const rows = await db
    .select({
      name: documents.name,
      content: documents.content,
      projectId: documents.projectId,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt))
    .limit(50)

  const scoped = projectId
    ? rows.filter((row) => row.projectId === projectId)
    : []
  const unscoped = rows.filter((row) => row.projectId === null)

  return [...scoped, ...unscoped]
    .slice(0, limit)
    .map((row) => ({ name: row.name, content: row.content }))
}

/** Documents with no project scope — the user's general library. */
export async function listLibraryDocuments(): Promise<DocumentSummary[]> {
  const userId = await getUserId()

  const rows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), isNull(documents.projectId)))
    .orderBy(desc(documents.createdAt))

  return rows.map(summarise)
}
