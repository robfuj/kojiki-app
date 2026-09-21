/**
 * A bare polyline of progress samples. No axes, no grid: the shape of the climb
 * is the whole point, and the card around it carries the numbers.
 */
export function Sparkline({
  values,
  className,
}: {
  values: number[]
  className?: string
}) {
  if (values.length < 2) return null

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100
      const y = 26 - (Math.max(0, Math.min(100, value)) / 100) * 24
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const last = points.split(' ').at(-1)?.split(',') ?? []

  return (
    <svg
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {last.length === 2 && (
        <circle cx={last[0]} cy={last[1]} r="2" fill="currentColor" />
      )}
    </svg>
  )
}
