import { cn } from '@/lib/utils'
import { STATUS_DOT, type AgentStatus } from './agent-status'

interface AgentFaceProps {
  status: AgentStatus
  tint: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = {
  sm: { face: 'size-7', eye: 'size-1', gap: 'gap-1.5', dot: 'size-2.5' },
  md: { face: 'size-14', eye: 'size-1.5', gap: 'gap-3', dot: 'size-3.5' },
  lg: { face: 'size-24', eye: 'size-2.5', gap: 'gap-5', dot: 'size-5' },
}

/** A simple drawn face: tinted circle, two eyes, a status dot. Decorative — the name and status are always written beside it. */
export function AgentFace({ status, tint, size = 'md' }: AgentFaceProps) {
  const s = SIZES[size]
  return (
    <span className="relative inline-flex shrink-0" aria-hidden="true">
      {status === 'working' && (
        <span className={cn('absolute inset-0 rounded-full motion-safe:animate-ping opacity-30', tint)} />
      )}
      <span
        className={cn(
          'relative flex items-center justify-center rounded-full ring-1 ring-border',
          s.face,
          s.gap,
          tint,
          status === 'idle' && 'opacity-70',
        )}
      >
        <span className={cn('rounded-full bg-current', s.eye)} />
        <span className={cn('rounded-full bg-current', s.eye)} />
      </span>
      <span
        className={cn(
          'absolute right-0 bottom-0 rounded-full ring-2 ring-card',
          s.dot,
          STATUS_DOT[status],
        )}
      />
    </span>
  )
}
