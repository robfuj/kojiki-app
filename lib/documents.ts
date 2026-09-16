/**
 * Document ingestion.
 *
 * There is no object store here, and the only thing an agent does with a document
 * is read it — so what gets stored is the extracted text, not the bytes. That
 * keeps uploads cheap, keeps the row self-contained, and means a document is
 * immediately usable as prompt context with no retrieval step.
 *
 * The tradeoff is that the original file is not recoverable. That is acceptable
 * for context and would not be acceptable for attachments the user needs back;
 * `source` and `sourceRef` on the row are the seam for adding a real store or an
 * external connector such as Google Drive later without changing the row shape.
 */

/** Hard ceiling on what one document may contribute to a prompt. */
export const MAX_DOCUMENT_CHARS = 200_000

/** Hard ceiling on upload size, checked before any parsing work happens. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

export interface ParsedDocument {
  text: string
  charCount: number
  /** True when the text was cut down to MAX_DOCUMENT_CHARS. */
  truncated: boolean
}

const PDF_TYPES = new Set(['application/pdf'])
const DOCX_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const TEXT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/tab-separated-values',
  'application/json',
  'application/x-ndjson',
])

export function isSupportedMimeType(mimeType: string): boolean {
  return (
    PDF_TYPES.has(mimeType) || DOCX_TYPES.has(mimeType) || TEXT_TYPES.has(mimeType)
  )
}

export const SUPPORTED_MIME_LABEL = 'PDF, DOCX, TXT, MD, CSV or JSON'

/**
 * Extracts readable text from an upload.
 *
 * Throws on an unsupported type or an unreadable file rather than returning an
 * empty string: a silently empty document would sit in the library looking
 * usable and contribute nothing to any prompt.
 */
export async function parseDocument(input: {
  buffer: Buffer
  mimeType: string
  fileName: string
}): Promise<ParsedDocument> {
  const { buffer, mimeType, fileName } = input

  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(
      `That file is too large. The limit is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`,
    )
  }

  let raw: string

  if (PDF_TYPES.has(mimeType)) {
    // Imported here, not at module scope. pdf-parse pulls in pdfjs-dist, which
    // probes for browser canvas APIs while it evaluates; a static import drags
    // that probe into every server bundle reaching this module — including the
    // prompt helpers below, which never parse anything — and the failed probe
    // takes the whole route down. Loading on demand keeps it off that graph.
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    try {
      const result = await parser.getText()
      raw = result.text ?? ''
    } finally {
      // pdf-parse holds a worker; leaving it alive leaks one per upload.
      await parser.destroy()
    }
  } else if (DOCX_TYPES.has(mimeType)) {
    const mammoth = (await import('mammoth')).default
    // extractRawText rather than convertToHtml: the agents want the words, and
    // HTML markup would spend prompt budget on tags.
    const result = await mammoth.extractRawText({ buffer })
    raw = result.value
  } else if (TEXT_TYPES.has(mimeType)) {
    raw = new TextDecoder('utf-8').decode(buffer)
  } else {
    throw new Error(
      `"${fileName}" is a ${mimeType} file. Supported types: ${SUPPORTED_MIME_LABEL}.`,
    )
  }

  // PDFs and DOCX arrive with page furniture and run-on whitespace. Collapsing it
  // costs nothing and buys back prompt budget.
  const normalised = raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (normalised.length === 0) {
    throw new Error(
      `"${fileName}" contained no readable text. Scanned PDFs and image-only documents cannot be read.`,
    )
  }

  const truncated = normalised.length > MAX_DOCUMENT_CHARS

  return {
    text: truncated ? normalised.slice(0, MAX_DOCUMENT_CHARS) : normalised,
    charCount: normalised.length,
    truncated,
  }
}

/**
 * Renders documents as prompt context.
 *
 * Each document is fenced and labelled so a model can tell where one ends and the
 * next begins, and so it can attribute a claim to the file it came from. The
 * budget is shared across all documents rather than per document, because what
 * matters is the total prompt cost.
 */
export function documentsContext(
  documents: { name: string; content: string }[],
  totalBudget = 24_000,
): string {
  if (documents.length === 0) return ''

  const perDocument = Math.max(
    1_000,
    Math.floor(totalBudget / documents.length),
  )

  return documents
    .map((document) => {
      const body =
        document.content.length > perDocument
          ? `${document.content.slice(0, perDocument)}\n\n[truncated]`
          : document.content

      return `<document name="${document.name}">\n${body}\n</document>`
    })
    .join('\n\n')
}
