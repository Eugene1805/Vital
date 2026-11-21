import type { ReactNode } from 'react'
import { formatDateTimeGmt6 } from '../../design-system/gmt6.ts'
import { StatusBadge } from '../../design-system/StatusBadge.tsx'
import type { KpiEnvelope } from '../../domain/types.ts'

interface KpiCardProps<TData> {
  title: string
  sourceLabel: string
  hint?: string
  envelope: KpiEnvelope<string, TData>
  renderData: (data: TData) => ReactNode
}

export function KpiCard<TData>({
  title,
  sourceLabel,
  hint,
  envelope,
  renderData,
}: KpiCardProps<TData>) {
  return (
    <article className="flex flex-col justify-between rounded-lg border border-divider bg-surface p-5 shadow-sm">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-divider pb-3">
          <div>
            <p className="font-mono text-xs font-semibold text-ink-muted">{sourceLabel}</p>
            <h2 className="mt-0.5 text-base font-bold text-ink">{title}</h2>
          </div>
          {envelope.status === 'AVAILABLE' ? (
            <StatusBadge tone="positive" label="AVAILABLE" />
          ) : envelope.status === 'NOT_APPLICABLE' ? (
            <StatusBadge tone="info" label="No aplica" />
          ) : (
            <StatusBadge tone="critical" label="No disponible" />
          )}
        </div>

        <div className="mt-4">
          {envelope.status === 'AVAILABLE' && envelope.data !== null ? (
            renderData(envelope.data)
          ) : envelope.status === 'NOT_APPLICABLE' ? (
            <div className="rounded-md border border-blue-200 bg-info-bg/50 p-3 text-sm text-info-ink">
              <p className="font-bold">No aplica (`NOT_APPLICABLE`)</p>
              <p className="mt-1 text-xs">
                {envelope.reason ?? 'El módulo económico no está habilitado para esta clínica (no equivale a 0).'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-red-200 bg-critical-bg/60 p-3 text-sm text-critical-ink">
              <p className="font-bold">No disponible (`UNAVAILABLE`)</p>
              <p className="mt-1 text-xs">
                {envelope.reason ?? 'La fuente agregada no respondió; no se sustituye por cero.'}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-ink-muted">
        {hint ? <p className="mb-1">{hint}</p> : null}
        <p className="font-mono">Evaluado: {formatDateTimeGmt6(envelope.evaluatedAtGmt6)}</p>
      </div>
    </article>
  )
}
