import { betterAuth } from 'better-auth'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

function resolveBaseURL() {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  if (process.env.V0_RUNTIME_URL) return process.env.V0_RUNTIME_URL
  return 'http://localhost:3000'
}

function resolveTrustedOrigins() {
  if (process.env.NODE_ENV === 'development') {
    return [
      'http://localhost:3000',
      process.env.V0_RUNTIME_URL,
      process.env.V0_DEV_APP_URL,
      process.env.V0_BUILD_URL,
      process.env.V0_SANDBOX_URL,
    ].filter((origin): origin is string => Boolean(origin))
  }

  return [
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null,
  ].filter((origin): origin is string => Boolean(origin))
}

export const auth = betterAuth({
  baseURL: resolveBaseURL(),
  trustedOrigins: resolveTrustedOrigins(),
  database: pool,
  emailAndPassword: {
    enabled: true,
  },
  // The v0 preview renders this app inside a cross-site iframe. Without these
  // attributes the browser drops the session cookie and the user appears
  // permanently logged out.
  ...(process.env.NODE_ENV === 'development'
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }
    : {}),
})
