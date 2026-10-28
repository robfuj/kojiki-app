export type Health = 'blocked' | 'needs_you' | 'at_risk' | 'on_track'

export const HEALTH_ORDER: Health[] = ['needs_you', 'on_track', 'at_risk', 'blocked']

export const HEALTH_LABELS: Record<Health, string> = {
  needs_you: 'Needs you',
  on_track: 'On track',
  at_risk: 'At risk',
  blocked: 'Blocked',
}

interface HealthInput {
  progress: number
  status: string
  timeframe: string | null
  needsYouCount: number
  blockedCount: number
}

/** Progress may trail time elapsed by this many points before a goal reads as at risk. */
const AT_RISK_SLACK = 15

/** Parses "Q3 2026", "H1 2026" or "2026" into a date window; anything else returns null. */
export function parseTimeframe(timeframe: string | null): { start: Date; end: Date } | null {
  if (!timeframe) return null
  const text = timeframe.trim().toUpperCase()
  const quarter = text.match(/^Q([1-4])\s*(\d{4})$/)
  if (quarter) {
    const q = Number(quarter[1]) - 1
    const year = Number(quarter[2])
    return { start: new Date(year, q * 3, 1), end: new Date(year, q * 3 + 3, 1) }
  }
  const half = text.match(/^H([12])\s*(\d{4})$/)
  if (half) {
    const h = Number(half[1]) - 1
    const year = Number(half[2])
    return { start: new Date(year, h * 6, 1), end: new Date(year, h * 6 + 6, 1) }
  }
  const year = text.match(/^(?:FY\s*)?(\d{4})$/)
  if (year) {
    const y = Number(year[1])
    return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) }
  }
  return null
}

export function healthOf(input: HealthInput, now: Date = new Date()): Health {
  if (input.blockedCount > 0) return 'blocked'
  if (input.needsYouCount > 0) return 'needs_you'
  if (input.progress >= 100 || input.status === 'complete') return 'on_track'

  const window = parseTimeframe(input.timeframe)
  if (window) {
    const span = window.end.getTime() - window.start.getTime()
    const elapsed = Math.min(1, Math.max(0, (now.getTime() - window.start.getTime()) / span))
    return input.progress + AT_RISK_SLACK < elapsed * 100 ? 'at_risk' : 'on_track'
  }
  return input.status === 'at_risk' || input.status === 'blocked' ? 'at_risk' : 'on_track'
}
