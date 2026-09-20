interface SparklineProps {
  /** Progress samples, oldest first, each 0-100. */
  points: number[]
  className?: string
}

/**
 * Progress over time, drawn from objective_progress_history samples. Fewer than
 * two samples renders a dashed baseline: a new objective has no trend yet, and
 * inventing one would be a lie. Decorative — the numbers live in the card text.
 */
export function Sparkline({ points, className }: SparklineProps) {
  const width = 120
  const height = 28

  const coords = points.map((value, index) => {
    const x = points.length === 1 ? width : (index / (points.length - 1)) * width
    const clamped = Math.max(0, Math.min(100, value))
    const y = height - 2 - (clamped / 100) * (height - 4)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {points.length < 2 ? (
        <line
          x1="0"
          y1={height - 2}
          x2={width}
          y2={height - 2}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          opacity="0.4"
        />
      ) : (
        <polyline
          points={coords.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}
