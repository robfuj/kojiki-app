import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * Encryption at rest for provider API keys.
 *
 * A provider key is the one piece of user data in this app that is directly
 * spendable: whoever holds it can run up a bill. Storing it in plaintext would
 * mean a single database read exposes it, so it is sealed with AES-256-GCM
 * before it is written and only ever decrypted inside the server runtime, at the
 * moment a model call is constructed.
 *
 * The key is derived from BETTER_AUTH_SECRET, which the app already requires.
 * GCM is used rather than CBC because it authenticates as well as encrypts, so a
 * tampered ciphertext fails loudly instead of decrypting to garbage.
 */

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const KEY_LENGTH = 32

function deriveKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET is required to store provider credentials')
  }
  // A fixed salt is acceptable here because the input secret is already
  // high-entropy and unique per deployment; scrypt is used for key stretching.
  return scryptSync(secret, 'kojiki-provider-keys', KEY_LENGTH)
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  // iv:ciphertext:tag, all base64, so the whole value fits one text column.
  return [iv, encrypted, tag].map((part) => part.toString('base64')).join(':')
}

export function decryptSecret(payload: string): string {
  const [ivPart, dataPart, tagPart] = payload.split(':')
  if (!ivPart || !dataPart || !tagPart) {
    throw new Error('Malformed encrypted secret')
  }

  const decipher = createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(ivPart, 'base64'))
  decipher.setAuthTag(Buffer.from(tagPart, 'base64'))

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

/**
 * The only form of a key that may leave the server: enough to recognise which
 * key is connected, never enough to use it.
 */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) return '****'
  return `****${plaintext.slice(-4)}`
}
