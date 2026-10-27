'use client'

import { lazy, Suspense } from 'react'
import type { MarbledFluidOrbProps } from '@/components/workspace/ui/marbled-fluid-orb-gl'

export type { MarbledFluidOrbProps }

// three.js is ~2.4 MB in dev; loading it lazily keeps it off the workspace's
// critical path. The CSS marble matches the GL orb's no-WebGL fallback.
const MarbledFluidOrbGL = lazy(() =>
  import('@/components/workspace/ui/marbled-fluid-orb-gl').then((m) => ({
    default: m.MarbledFluidOrb,
  })),
)

function StaticMarble({ className = '', size = 40 }: MarbledFluidOrbProps) {
  return (
    <div
      className={`shrink-0 rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background:
          'radial-gradient(circle at 32% 30%, #fffdf8 0%, #ffaf88 34%, #ff4b6e 62%, #b965d8 100%)',
      }}
      aria-hidden="true"
    />
  )
}

export function MarbledFluidOrb(props: MarbledFluidOrbProps) {
  return (
    <Suspense fallback={<StaticMarble {...props} />}>
      <MarbledFluidOrbGL {...props} />
    </Suspense>
  )
}
