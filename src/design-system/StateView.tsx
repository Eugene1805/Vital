import type { ReactNode } from 'react'
import { AlertTriangleIcon, RefreshIcon } from './Icons.tsx'

export type DataViewMode = 'ready' | 'loading' | 'error'

interface StateViewProps {
  mode: 'loading' | 'empty' | 'error'
  title: string
  message: string
  action?: ReactNode
  onRetry?: () => void
}

/** Estados explícitos de carga, vacío y error para vistas de datos. */
export function StateView({ mode, title, message, action, onRetry }: StateViewProps) {
  if (mode === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-divider bg-surface p-8 text-center"
      >
        <p className="text-base font-semibold text-ink">{title}</p>
        <p className="mt-1 text-sm text-ink-muted">{message}</p>
      </div>
    )
  }

  if (mode === 'error') {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-300 bg-critical-bg p-6 text-critical-ink"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="text-base font-bold">{title}</p>
              <p className="mt-1 text-sm">{message}</p>
            </div>
          </div>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-700 bg-surface px-4 py-2 text-sm font-semibold text-critical-ink hover:bg-red-50"
            >
              <RefreshIcon className="h-4 w-4" />
              <span>Reintentar</span>
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-divider bg-surface p-8 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-muted">{message}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}
