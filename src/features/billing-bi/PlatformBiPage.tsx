import { useState } from 'react'
import { nowGmt6Iso } from '../../design-system/gmt6.ts'
import { evaluatePlatformKpis } from '../../guards/billingBi.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'
import { KpiCard } from './KpiCard.tsx'

export function PlatformBiPage() {
  const { tenants, accounts, appointments, studies } = useMockStore()
  const [periodStart, setPeriodStart] = useState('2026-11-01')
  const [periodEnd, setPeriodEnd] = useState('2026-11-30')
  const [faultIdentity, setFaultIdentity] = useState(false)
  const [faultAgenda, setFaultAgenda] = useState(false)
  const [faultDocument, setFaultDocument] = useState(false)

  const kpis = evaluatePlatformKpis({
    tenants,
    accounts,
    appointments,
    studies,
    periodStartGmt6: periodStart,
    periodEndGmt6: periodEnd,
    evaluatedAtGmt6: nowGmt6Iso(),
    faults: {
      identity: faultIdentity,
      agenda: faultAgenda,
      document: faultDocument,
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-divider pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-medium text-clinical">
            CU-16 · PANEL DE PLATAFORMA (4 KPI GLOBALES)
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
            Indicadores globales SaaS (GMT-6 México)
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Agregados por API Composition sin acceso a notas médicas ni expedientes individuales (`CU-16 A5`). Distingue `0` (`AVAILABLE`), `No disponible` (`UNAVAILABLE`) y `No aplica` (`NOT_APPLICABLE`).
          </p>
        </div>
        <span className="inline-flex rounded-md border border-slate-300 bg-surface px-3 py-1.5 font-mono text-xs font-semibold text-ink">
          Zona horaria fija: GMT-6 (México)
        </span>
      </div>

      <section className="space-y-4 rounded-lg border border-divider bg-surface p-4 text-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="platform-bi-start" className="block text-xs font-semibold text-ink">
              Desde (GMT-6)
            </label>
            <input
              id="platform-bi-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="mt-1 rounded-md border px-3 py-2 font-mono text-sm"
            />
          </div>
          <div>
            <label htmlFor="platform-bi-end" className="block text-xs font-semibold text-ink">
              Hasta (GMT-6)
            </label>
            <input
              id="platform-bi-end"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="mt-1 rounded-md border px-3 py-2 font-mono text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setPeriodStart('2026-11-01')
                setPeriodEnd('2026-11-30')
              }}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-slate-100"
            >
              Noviembre 2026
            </button>
            <button
              type="button"
              onClick={() => {
                setPeriodStart('2025-01-01')
                setPeriodEnd('2025-01-31')
              }}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-ink hover:bg-slate-100"
            >
              Periodo vacío (probar 0)
            </button>
          </div>
        </div>

        <fieldset className="flex flex-wrap gap-4 border-t border-divider pt-3 text-xs">
          <legend className="sr-only">Simulación de indisponibilidad de fuentes BI</legend>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={faultIdentity}
              onChange={(e) => setFaultIdentity(e.target.checked)}
            />
            <span>Simular fallo en Identity</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={faultAgenda}
              onChange={(e) => setFaultAgenda(e.target.checked)}
            />
            <span>Simular fallo en Agenda</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={faultDocument}
              onChange={(e) => setFaultDocument(e.target.checked)}
            />
            <span>Simular fallo en Document</span>
          </label>
        </fieldset>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <KpiCard
          title="Clínicas por estado"
          sourceLabel="Platform"
          envelope={kpis.clinicsByStatus}
          renderData={(data) => (
            <div className="space-y-2 text-sm">
              <p className="font-mono text-3xl font-bold text-ink tabular-nums">{data.total}</p>
              <div className="grid grid-cols-3 gap-2 font-mono text-xs text-ink-muted">
                <p>ACTIVA: {data.activa}</p>
                <p>PENDIENTE: {data.pendienteAdmin}</p>
                <p>SUSPENDIDA: {data.suspendida}</p>
              </div>
            </div>
          )}
        />

        <KpiCard
          title="Ocupación de planes"
          sourceLabel="Platform + Identity"
          envelope={kpis.planOccupancy}
          renderData={(data) => (
            <div className="space-y-2 text-sm">
              <p className="font-mono text-3xl font-bold text-ink tabular-nums">
                {data.occupancyPercent}%
              </p>
              <p className="font-mono text-xs text-ink-muted">
                {data.activeAccounts} cuentas activas / {data.totalQuota} cupos globales
              </p>
            </div>
          )}
        />

        <KpiCard
          title="Actividad de citas"
          sourceLabel="Agenda (GMT-6)"
          envelope={kpis.appointmentActivity}
          renderData={(data) => (
            <div className="space-y-2 text-sm">
              <p className="font-mono text-3xl font-bold text-ink tabular-nums">{data.total}</p>
              <p className="font-mono text-xs text-ink-muted">
                PROGRAMADA: {data.byStatus.PROGRAMADA} · CONFIRMADA: {data.byStatus.CONFIRMADA} · COMPLETADA: {data.byStatus.COMPLETADA} · CANCELADA: {data.byStatus.CANCELADA}
              </p>
            </div>
          )}
        />

        <KpiCard
          title="Consumo documental"
          sourceLabel="Document (GMT-6)"
          envelope={kpis.documentConsumption}
          renderData={(data) => (
            <div className="space-y-2 text-sm">
              <p className="font-mono text-3xl font-bold text-ink tabular-nums">
                {data.totalDocuments} PDF
              </p>
              <p className="font-mono text-xs text-ink-muted">
                Volumen agregado en periodo: {data.totalSizeKb} KB
              </p>
            </div>
          )}
        />
      </div>
    </div>
  )
}
