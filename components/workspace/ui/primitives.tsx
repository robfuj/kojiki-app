'use client'

import { useLocale } from '@/components/i18n/locale-provider'
import { cn } from '@/lib/utils'
import {
  Building2,
  Coins,
  Megaphone,
  Package,
  Scale,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

export type PillTone = 'progress' | 'review' | 'approved' | 'idle'

const TONE_CLASS: Record<PillTone, string> = {
  progress: 'border-status-progress/30 bg-status-progress-soft text-status-progress',
  review: 'border-status-review/30 bg-status-review-soft text-status-review',
  approved: 'border-status-approved/30 bg-status-approved-soft text-status-approved',
  idle: 'border-border bg-status-idle-soft text-status-idle',
}

/** The small dotted pill every table and card uses for work state. */
export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: PillTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        TONE_CLASS[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  )
}

/** Maps any stored status string onto one of the four work-state tones. */
export function toneForStatus(status: string | null | undefined): PillTone {
  switch (status) {
    case 'accepted':
    case 'approved':
    case 'complete':
    case 'PASS':
    case 'reabsorbed':
      return 'approved'
    case 'pending':
    case 'proposed':
    case 'FAIL':
    case 'blocked':
    case 'escalated':
      return 'review'
    case 'in_progress':
    case 'running':
    case 'dispatched':
    case 'working':
      return 'progress'
    default:
      return 'idle'
  }
}

/** The thin green progress rule used on every card and header. */
export function ProgressBar({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className="h-full rounded-full bg-seal transition-[width] duration-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

/** Departments read as functions; each gets a stable glyph from its key. */
export function departmentIcon(specialistKey: string): LucideIcon {
  const key = specialistKey.toLowerCase()
  if (key.includes('market')) return Megaphone
  if (key.includes('sales') || key.includes('revenue')) return TrendingUp
  if (key.includes('financ') || key.includes('account')) return Coins
  if (key.includes('operat') || key.includes('supply')) return Package
  if (key.includes('legal') || key.includes('compliance')) return Scale
  if (key.includes('engin') || key.includes('techn') || key.includes('product'))
    return Wrench
  return Building2
}

/** Locale-aware "2h ago" for table rows, without pulling in a date library. */
export function useRelativeTime() {
  const { locale } = useLocale()

  return (date: Date | string): string => {
    const then = typeof date === 'string' ? new Date(date) : date
    const seconds = (then.getTime() - Date.now()) / 1000
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    const abs = Math.abs(seconds)
    if (abs < 60) return rtf.format(Math.round(seconds), 'second')
    if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute')
    if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour')
    if (abs < 604800) return rtf.format(Math.round(seconds / 86400), 'day')
    return rtf.format(Math.round(seconds / 604800), 'week')
  }
}

/** The tiny uppercase label that opens every section. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p
      className={cn(
        'text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase',
        className,
      )}
    >
      {children}
    </p>
  )
}

/** The white hairline card everything sits in. */
export function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border border-border bg-card', className)}>
      {children}
    </div>
  )
}

/** Initials circle for people and agents. */
export function AvatarCircle({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full bg-sumi-soft text-[11px] font-semibold text-sumi',
        className,
      )}
    >
      {initials || '·'}
    </span>
  )
}
