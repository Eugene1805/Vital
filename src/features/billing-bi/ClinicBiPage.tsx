import { useEffect, useState } from 'react'
import { formatDateTimeGmt6, nowGmt6Iso } from '../../design-system/gmt6.ts'
import type {
  AppointmentActivityData,
  ClinicKpiKey,
  CutsStatusData,
  KpiEnvelope,
  RecordedPaymentsData,
} from '../../domain/types.ts'
import { PAYMENT_METHOD_LABELS, evaluateClinicKpis, formatMxn } from '../../guards/billingBi.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'
import { AgendaApiError, createAgendaClient } from '../../services/agendaClient.ts'
import {
  BillingApiError,
  createBillingClient,
  type BillingAdjustmentDto,
} from '../../services/billingClient.ts'
import { KpiCard } from './KpiCard.tsx'

interface LiveClinicBiState {
  key: string
  agendaActivity: KpiEnvelope<ClinicKpiKey, AppointmentActivityData>
  recordedPayments: KpiEnvelope<ClinicKpiKey, RecordedPaymentsData>
  cutsStatus: KpiEnvelope<ClinicKpiKey, CutsStatusData>
  adjustments: BillingAdjustmentDto[]
}

async function fetchLiveClinicBiState(params: {
  key: string
  agendaClient: ReturnType<typeof createAgendaClient>
  billingClient: ReturnType<typeof createBillingClient>
  periodStart: string
  periodEnd: string
  faultAgenda: boolean
  faultBilling: boolean
}): Promise<LiveClinicBiState> {
  const {
    key,
    agendaClient,
    billingClient,
    periodStart,
    periodEnd,
    faultAgenda,
    faultBilling,
  } = params
  const evaluatedAtGmt6 = nowGmt6Iso()
  const from = periodStart || undefined
  const to = periodEnd || undefined

  const agendaPromise: Promise<KpiEnvelope<ClinicKpiKey, AppointmentActivityData>> = faultAgenda
    ? Promise.resolve({
        kpiKey: 'AGENDA_ACTIVITY',
        status: 'UNAVAILABLE',
        data: null,
        evaluatedAtGmt6,
        reason: 'El servicio Agenda no respondió para esta clínica (CU-16 A1).',
      })
    : agendaClient
        .getClinicMetrics(from, to)
        .then((dto) => ({
          kpiKey: 'AGENDA_ACTIVITY' as const,
          status: dto.status,
          data: dto.data,
          evaluatedAtGmt6: dto.evaluatedAtGmt6,
        }))
        .catch((err: unknown) => ({
          kpiKey: 'AGENDA_ACTIVITY' as const,
          status: 'UNAVAILABLE' as const,
          data: null,
          evaluatedAtGmt6,
          reason:
            err instanceof AgendaApiError
              ? err.problem.message
              : 'El servicio Agenda no respondió para esta clínica (CU-16 A1).',
        }))

  const paymentsPromise: Promise<KpiEnvelope<ClinicKpiKey, RecordedPaymentsData>> = faultBilling
    ? Promise.resolve({
        kpiKey: 'RECORDED_PAYMENTS',
        status: 'UNAVAILABLE',
        data: null,
        evaluatedAtGmt6,
        reason: 'El servicio Billing no respondió al consultar cobros registrados (CU-16 A1).',
      })
    : billingClient.getClinicPaymentsMetric(from, to).catch((err: unknown) => ({
        kpiKey: 'RECORDED_PAYMENTS' as const,
        status: 'UNAVAILABLE' as const,
        data: null,
        evaluatedAtGmt6,
        reason:
          err instanceof BillingApiError
            ? err.problem.message
            : 'El servicio Billing no respondió al consultar cobros registrados (CU-16 A1).',
      }))

  const cutsPromise: Promise<KpiEnvelope<ClinicKpiKey, CutsStatusData>> = faultBilling
    ? Promise.resolve({
        kpiKey: 'CUTS_STATUS',
        status: 'UNAVAILABLE',
        data: null,
        evaluatedAtGmt6,
        reason: 'El servicio Billing no respondió al consultar estado de cortes (CU-16 A1).',
      })
    : billingClient.getClinicCutsMetric(from, to).catch((err: unknown) => ({
        kpiKey: 'CUTS_STATUS' as const,
        status: 'UNAVAILABLE' as const,
        data: null,
        evaluatedAtGmt6,
        reason:
          err instanceof BillingApiError
            ? err.problem.message
            : 'El servicio Billing no respondió al consultar estado de cortes (CU-16 A1).',
      }))

  const adjustmentsPromise: Promise<BillingAdjustmentDto[]> = faultBilling
    ? Promise.resolve([])
    : billingClient
        .listAdjustments()
        .then((res) => res.items)
        .catch(() => [])

  const [agendaActivity, recordedPayments, cutsStatus, adjustments] = await Promise.all([
    agendaPromise,
    paymentsPromise,
    cutsPromise,
    adjustmentsPromise,
  ])

  return {
    key,
    agendaActivity,
    recordedPayments,
    cutsStatus,
    adjustments,
  }
}

export function ClinicBiPage() {
  const {
    currentTenant,
    authMode,
    agendaApiUrl,
    billingApiUrl,
    appointments,
    encounters,
    payments,
    cuts,
  } = useMockStore()

  const [agendaClient] = useState(() => createAgendaClient(agendaApiUrl))
  const [billingClient] = useState(() => createBillingClient(billingApiUrl))

  const [periodStart, setPeriodStart] = useState('2026-11-01')
  const [periodEnd, setPeriodEnd] = useState('2026-11-30')
  const [faultAgenda, setFaultAgenda] = useState(false)
  const [faultClinical, setFaultClinical] = useState(false)
  const [faultBilling, setFaultBilling] = useState(false)

  const [liveBiState, setLiveBiState] = useState<LiveClinicBiState | null>(null)

  const isLive = authMode === 'identity'
  const liveKey =
    isLive && currentTenant
      ? `${currentTenant.id}:${periodStart}:${periodEnd}:${faultAgenda}:${faultBilling}`
      : ''

  useEffect(() => {
    if (!liveKey) return
    let cancelled = false

    void fetchLiveClinicBiState({
      key: liveKey,
      agendaClient,
      billingClient,
      periodStart,
      periodEnd,
      faultAgenda,
      faultBilling,
    }).then((next) => {
      if (!cancelled) {
        setLiveBiState(next)
      }
    })

    return () => {
      cancelled = true
    }
  }, [agendaClient, billingClient, faultAgenda, faultBilling, liveKey, periodEnd, periodStart])

  if (!currentTenant) return null

  const mockKpis = evaluateClinicKpis({
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

  const activeLive = isLive && liveBiState && liveBiState.key === liveKey ? liveBiState : null
  const kpis =
    isLive && activeLive
      ? {
          agendaActivity: activeLive.agendaActivity,
          completedConsultations: mockKpis.completedConsultations,
          recordedPayments: activeLive.recordedPayments,
          cutsStatus: activeLive.cutsStatus,
        }
      : mockKpis

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

      {isLive ? (
        <div className="rounded-md border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs text-teal-950">
          KPIs <strong className="font-mono">AGENDA_ACTIVITY</strong> ({agendaApiUrl}),{' '}
          <strong className="font-mono">RECORDED_PAYMENTS</strong> y{' '}
          <strong className="font-mono">CUTS_STATUS</strong> ({billingApiUrl}) consultados en vivo sin netear ajustes vinculados (D-BI-03).
        </div>
      ) : null}

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
          sourceLabel={isLive ? 'Clinical (prototipo local GMT-6)' : 'Clinical (GMT-6)'}
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
          hint="Métrica base ordinaria sobre PatientPayment sin netear ajustes vinculados (D-BI-03)."
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
          hint="Métrica base ordinaria sobre SpecialistCut sin netear ajustes vinculados (D-BI-03)."
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

      {isLive && activeLive && activeLive.adjustments.length > 0 ? (
        <section className="rounded-lg border border-divider bg-surface p-4 text-xs">
          <h2 className="text-sm font-bold text-ink">
            Ajustes compensatorios vinculados (fuera del cálculo base KPI · D-BI-03)
          </h2>
          <ul className="mt-2 space-y-1.5">
            {activeLive.adjustments.map((adj) => (
              <li
                key={adj.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-divider bg-slate-50 px-3 py-2"
              >
                <span>
                  <strong className="font-mono">{adj.folio}</strong> [{adj.targetType}] · {adj.reason} ({adj.actorName} · {formatDateTimeGmt6(adj.createdAtGmt6)})
                </span>
                <span className="font-mono font-bold tabular-nums">
                  {adj.deltaMxn > 0 ? `+${formatMxn(adj.deltaMxn)}` : formatMxn(adj.deltaMxn)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
