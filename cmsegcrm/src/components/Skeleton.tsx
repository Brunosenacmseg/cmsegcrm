'use client'

interface SkeletonProps {
  width?: number | string
  height?: number | string
  rounded?: number | string
  className?: string
  style?: React.CSSProperties
}

export function Skeleton({ width = '100%', height = 16, rounded = 6, style }: SkeletonProps) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width,
        height,
        borderRadius: rounded,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%)',
        backgroundSize: '200% 100%',
        animation: 'cm-skeleton 1.2s ease-in-out infinite',
        ...style,
      }}
    />
  )
}

export function SkeletonCard({ height = 120 }: { height?: number }) {
  return (
    <div
      aria-hidden
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 14,
        height,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <Skeleton width="60%" height={14} />
      <Skeleton width="40%" height={11} />
      <div style={{ flex: 1 }} />
      <Skeleton width="80%" height={11} />
    </div>
  )
}

// CSS keyframes injetada no <head> uma única vez por sessão.
if (typeof document !== 'undefined' && !document.getElementById('cm-skeleton-style')) {
  const s = document.createElement('style')
  s.id = 'cm-skeleton-style'
  s.textContent = `@keyframes cm-skeleton{0%{background-position:200% 0}100%{background-position:-200% 0}}`
  document.head.appendChild(s)
}
