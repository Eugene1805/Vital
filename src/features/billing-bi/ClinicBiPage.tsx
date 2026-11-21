import { useState } from 'react'
import { nowGmt6Iso } from '../../design-system/gmt6.ts'
import { PAYMENT_METHOD_LABELS, evaluateClinicKpis, formatMxn } from '../../guards/billingBi.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'
import { KpiCard } from './KpiCard.tsx'

export function ClinicBiPage() {
  const { currentTenant, appointments, encounters, payments, cuts } = useMockStore()
  const [periodStart, setPeriodStart] = useState('2026-11-01')
  const [periodEnd, setPeriodEnd] = useState('2026-11-30')
  const [faultAgenda, setFaultAgenda] = useState(false)
  const [faultClinical, setFaultClinical] = useState(false)
  const [faultBilling, setFaultBilling] = useState(false)

  if (!currentTenant) return null

  const kpis = evaluateClinicKpis({
    tenant: currentTenant,
    appointments,
    encounters,
    payments,
    cuts,
    periodStartGmt6: periodStart,
    periodEndGmt6: periodEnd,
    evaluatedAtGmt6: nowGmt6Iso(),
    faults: {
      agenda: faultAgenda,
      clinical: faultClinical,
      billing: faultBilling,
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-divider pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-medium text-clinical">
            CU-16 · PANEL DE CLÍNICA ({currentTenant.slug})
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
            Indicadores de {currentTenant.name} (GMT-6)
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Alcance estricto al tenant actual sin exponer datos de otras clínicas ni texto de notas médicas (`CU-16`).
          </p>
        </div>
        <span className="inline-flex rounded-md border border-slate-300 bg-surface px-3 py-1.5 font-mono text-xs font-semibold text-ink">
          Zona horaria fija: GMT-6 (México)
        </span>
      </div>

      <section className="space-y-4 rounded-lg border border-divider bg-surface p-4 text-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="clinic-bi-start" className="block text-xs font-semibold text-ink">
              Desde (GMT-6)
            </label>
            <input
              id="clinic-bi-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="mt-1 rounded-md border px-3 py-2 font-mono text-sm"
            />
          </div>
          <div>
            <label htmlFor="clinic-bi-end" className="block text-xs font-semibold text-ink">
              Hasta (GMT-6)
            </label>
            <input
              id="clinic-bi-end"
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
          <legend className="sr-only">Simulación de indisponibilidad de fuentes de clínica</legend>
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
              checked={faultClinical}
              onChange={(e) => setFaultClinical(e.target.checked)}
            />
            <span>Simular fallo en Clinical</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={faultBilling}
              onChange={(e) => setFaultBilling(e.target.checked)}
            />
            <span>Simular fallo en Billing</span>
          </label>
        </fieldset>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <KpiCard
          title="Actividad de agenda"
          sourceLabel="Agenda (GMT-6)"
          envelope={kpis.agendaActivity}
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
          title="Consultas realizadas"
          sourceLabel="Clinical (GMT-6)"
          hint="Contabiliza atenciones FINALIZADA aunque su nota siga en BORRADOR (CU-16)."
          envelope={kpis.completedConsultations}
          renderData={(data) => (
            <div className="space-y-2 text-sm">
              <p className="font-mono text-3xl font-bold text-ink tabular-nums">{data.total}</p>
              {data.bySpecialist.length > 0 ? (
                <ul className="space-y-0.5 font-mono text-xs text-ink-muted">
                  {data.bySpecialist.map((s) => (
                    <li key={s.specialistName}>
                      {s.specialistName}: {s.count}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-muted">Sin atenciones finalizadas en el periodo.</p>
              )}
            </div>
          )}
        />

        <KpiCard
          title="Cobros registrados"
          sourceLabel="Billing (GMT-6)"
          envelope={kpis.recordedPayments}
          renderData={(data) => (
            <div className="space-y-2 text-sm">
              <p className="font-mono text-2xl font-bold text-ink tabular-nums">
                {formatMxn(data.totalMxn)}
              </p>
              <p className="font-mono text-xs text-ink-muted">
                {data.paymentCount} cobro(s) | {PAYMENT_METHOD_LABELS.EFECTIVO}:{' '}
                {formatMxn(data.byMethod.EFECTIVO)} | {PAYMENT_METHOD_LABELS.TARJETA}:{' '}
                {formatMxn(data.byMethod.TARJETA)} | {PAYMENT_METHOD_LABELS.TRANSFERENCIA}:{' '}
                {formatMxn(data.byMethod.TRANSFERENCIA)}
              </p>
            </div>
          )}
        />

        <KpiCard
          title="Estado de cortes"
          sourceLabel="Billing (GMT-6)"
          envelope={kpis.cutsStatus}
          renderData={(data) => (
            <div className="space-y-2 text-sm">
              <p className="font-mono text-3xl font-bold text-ink tabular-nums">
                {data.totalCuts} corte(s)
              </p>
              <p className="font-mono text-xs text-ink-muted">
                PREPARADO: {data.preparadoCount} · OBSERVADO: {data.observadoCount} (
                {formatMxn(data.observedAmountMxn)}) · CONFIRMADO: {data.confirmadoCount} (
                {formatMxn(data.confirmedAmountMxn)})
              </p>
            </div>
          )}
        />
      </div>
    </div>
  )
}
