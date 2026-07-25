import { useEffect, useState } from 'react'
import { checkHealth } from '../api/client'

export function BackendStatus({ className = '' }: { className?: string }) {
  const [state, setState] = useState<'checking' | 'up' | 'down'>('checking')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { healthy } = await checkHealth()
      if (!cancelled) setState(healthy ? 'up' : 'down')
    })()
    const id = window.setInterval(async () => {
      const { healthy } = await checkHealth()
      if (!cancelled) setState(healthy ? 'up' : 'down')
    }, 15_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const label =
    state === 'checking'
      ? 'API…'
      : state === 'up'
        ? 'API live'
        : 'API offline'

  const color =
    state === 'up'
      ? 'text-green-400 border-green-400/25 bg-green-400/10'
      : state === 'down'
        ? 'text-mist border-line bg-ink-soft/60'
        : 'text-ember border-ember/20 bg-ember/10'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${color} ${className}`}
      title={
        state === 'up'
          ? 'GET /health ok — /v1 routes may still be incomplete'
          : 'Cannot reach FastAPI on :8000 (demo mode still works)'
      }
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          state === 'up'
            ? 'bg-green-400'
            : state === 'down'
              ? 'bg-mist/50'
              : 'bg-ember animate-pulse'
        }`}
      />
      {label}
    </span>
  )
}
