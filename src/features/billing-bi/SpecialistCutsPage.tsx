import { useState, type FormEvent } from 'react'
import { formatDateTimeGmt6 } from '../../design-system/gmt6.ts'
import { ModalDialog } from '../../design-system/ModalDialog.tsx'
import { StatusBadge, type BadgeTone } from '../../design-system/StatusBadge.tsx'
import type { SpecialistCut, SpecialistCutStatus } from '../../domain/types.ts'
import { PAYMENT_METHOD_LABELS, formatMxn } from '../../guards/billingBi.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'

function cutStatusTone(status: SpecialistCutStatus): BadgeTone {
  switch (status) {
    case 'PREPARADO':
      return 'info'
    case 'OBSERVADO':
      return 'warning'
    case 'CONFIRMADO':
      return 'positive'
  }
}

export function SpecialistCutsPage() {
  const {
    currentUser,
    currentTenant,
    cuts,
    payments,
    confirmSpecialistCut,
    observeSpecialistCut,
  } = useMockStore()

  const [statusFilter, setStatusFilter] = useState<'ALL' | SpecialistCutStatus>('ALL')
  const [banner, setBanner] = useState<{ tone: 'positive' | 'critical'; text: string } | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<SpecialistCut | null>(null)
  const [observeTarget, setObserveTarget] = useState<SpecialistCut | null>(null)
  const [observeComment, setObserveComment] = useState('')
  const [observeError, setObserveError] = useState<string | null>(null)

  if (!currentUser || !currentTenant) return null

  if (!currentTenant.usesBilling) {
    return (
      <div className="space-y-6">
        <div className="border-b border-divider pb-5">
          <p className="font-mono text-xs font-medium text-clinical">CU-23 · MIS CORTES</p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">Mis cortes económicos</h1>
        </div>
        <div className="rounded-lg border border-blue-300 bg-info-bg p-6 text-info-ink">
          <StatusBadge tone="info" label="No aplica" />
          <p className="mt-2 text-sm">
            {currentTenant.name} no utiliza el módulo de Billing. Tus consultas y atenciones clínicas (`CU-03`) continúan operando sin cortes económicos.
          </p>
        </div>
      </div>
    )
  }

  const myCuts = cuts
    .filter((c) => c.tenantId === currentTenant.id && c.specialistId === currentUser.id)
    .filter((c) => statusFilter === 'ALL' || c.status === statusFilter)
    .sort((a, b) => b.updatedAtGmt6.localeCompare(a.updatedAtGmt6))

  const handleConfirmSubmit = () => {
    if (!confirmTarget) return
    const decision = confirmSpecialistCut(confirmTarget.id)
    setConfirmTarget(null)
    setBanner(
      decision.allowed
        ? {
            tone: 'positive',
            text: 'Corte confirmado (CONFIRMADO). Se registró tu constancia administrativa del corte.',
          }
        : { tone: 'critical', text: decision.message },
    )
  }

  const handleObserveSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!observeTarget) return
    setObserveError(null)
    const decision = observeSpecialistCut(observeTarget.id, observeComment)
    if (!decision.allowed) {
      setObserveError(decision.message)
      return
    }
    setObserveTarget(null)
    setObserveComment('')
    setBanner({
      tone: 'positive',
      text: 'Discrepancia enviada a Secretaría (estado OBSERVADO). El corte volverá a PREPARADO tras su corrección trazable.',
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-divider pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-medium text-clinical">
            CU-23 · PC-05 · CONFIRMACIÓN DE CORTE
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
            Mis cortes por periodo (GMT-6)
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Revisa únicamente los cortes dirigidos a tu cuenta ({currentUser.fullName}). Confirmar valida el registro económico administrativo, sin implicar conciliación bancaria ni custodia de efectivo.
          </p>
        </div>

        <div>
          <label htmlFor="cuts-status-filter" className="block text-xs font-semibold text-ink">
            Filtrar estado
          </label>
          <select
            id="cuts-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | SpecialistCutStatus)}
            className="mt-1 rounded-md border px-3 py-2 text-sm"
          >
            <option value="ALL">Todos ({cuts.filter((c) => c.specialistId === currentUser.id).length})</option>
            <option value="PREPARADO">Pendientes (PREPARADO)</option>
            <option value="OBSERVADO">Observados (OBSERVADO)</option>
            <option value="CONFIRMADO">Confirmados (CONFIRMADO)</option>
          </select>
        </div>
      </div>

      {banner ? (
        <div
          role={banner.tone === 'critical' ? 'alert' : 'status'}
          className={`flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm font-medium ${
            banner.tone === 'critical'
              ? 'border-red-300 bg-critical-bg text-critical-ink'
              : 'border-green-300 bg-positive-bg text-positive-ink'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="min-h-11 rounded px-2 text-xs font-semibold underline"
          >
            Ocultar
          </button>
        </div>
      ) : null}

      {myCuts.length === 0 ? (
        <div className="rounded-lg border border-divider bg-surface p-6 text-sm text-ink-muted">
          No hay cortes registrados para tu cuenta con el filtro seleccionado.
        </div>
      ) : (
        <ul className="space-y-4">
          {myCuts.map((cut) => {
            const cutPayments = payments.filter((p) => cut.paymentIds.includes(p.id))
            return (
              <li
                key={cut.id}
                className="rounded-lg border border-divider bg-surface p-5 shadow-sm text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-ink">{cut.folio}</span>
                      <StatusBadge tone={cutStatusTone(cut.status)} label={cut.status} />
                    </div>
                    <p className="mt-1 font-mono text-xs text-ink-muted">
                      Periodo: {cut.periodStartGmt6} a {cut.periodEndGmt6} (GMT-6) · Preparado por{' '}
                      {cut.preparedByName}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs text-ink-muted">Total registrado</p>
                    <p className="font-mono text-xl font-bold text-ink tabular-nums">
                      {formatMxn(cut.totalMxn)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded border border-divider bg-slate-50 p-3">
                    <p className="text-xs text-ink-muted">Efectivo</p>
                    <p className="mt-0.5 font-mono font-bold tabular-nums">
                      {formatMxn(cut.totalsByMethod.EFECTIVO)}
                    </p>
                  </div>
                  <div className="rounded border border-divider bg-slate-50 p-3">
                    <p className="text-xs text-ink-muted">Tarjeta</p>
                    <p className="mt-0.5 font-mono font-bold tabular-nums">
                      {formatMxn(cut.totalsByMethod.TARJETA)}
                    </p>
                  </div>
                  <div className="rounded border border-divider bg-slate-50 p-3">
                    <p className="text-xs text-ink-muted">Transferencia</p>
                    <p className="mt-0.5 font-mono font-bold tabular-nums">
                      {formatMxn(cut.totalsByMethod.TRANSFERENCIA)}
                    </p>
                  </div>
                </div>

                {cutPayments.length > 0 ? (
                  <div className="mt-3 rounded border border-divider bg-slate-50 p-3 text-xs">
                    <p className="font-bold text-ink">Cobros incluidos ({cutPayments.length}):</p>
                    <ul className="mt-1 space-y-1 font-mono">
                      {cutPayments.map((p) => (
                        <li key={p.id}>
                          {p.folio} · {PAYMENT_METHOD_LABELS[p.method]} · {formatMxn(p.amountMxn)} (
                          {formatDateTimeGmt6(p.paidAtGmt6)})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {cut.history.length > 0 ? (
                  <div className="mt-3 space-y-1 text-xs text-ink-muted">
                    <p className="font-semibold text-ink">Trazabilidad del corte:</p>
                    {cut.history.map((evt) => (
                      <p key={evt.id}>
                        <span className="font-mono">{formatDateTimeGmt6(evt.occurredAtGmt6)}</span> [{evt.status}] {evt.actorName}: {evt.note}
                      </p>
                    ))}
                  </div>
                ) : null}

                {cut.status === 'PREPARADO' ? (
                  <div className="mt-4 flex flex-wrap gap-3 border-t border-divider pt-3">
                    <button
                      type="button"
                      onClick={() => setConfirmTarget(cut)}
                      className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 text-xs font-semibold text-white hover:bg-clinical-hover"
                    >
                      Confirmar corte registrado
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setObserveTarget(cut)
                        setObserveComment('')
                        setObserveError(null)
                      }}
                      className="inline-flex min-h-11 items-center rounded-md border border-amber-700 bg-warning-bg px-4 py-2 text-xs font-semibold text-warning-ink hover:bg-amber-100"
                    >
                      Reportar discrepancia (Observar)
                    </button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <ModalDialog
        open={Boolean(confirmTarget)}
        title={`Confirmar recepción del corte ${confirmTarget?.folio ?? ''} (CU-23)`}
        description="Esta acción confirma el registro económico administrativo mostrado y lo vuelve inmutable."
        onClose={() => setConfirmTarget(null)}
      >
        <div className="space-y-4 text-sm">
          <p className="text-ink-muted">
            Importe total a confirmar:{' '}
            <strong className="font-mono text-ink">
              {confirmTarget ? formatMxn(confirmTarget.totalMxn) : ''}
            </strong>
            . Confirmar no certifica depósitos ni conciliación bancaria física.
          </p>
          <div className="flex justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setConfirmTarget(null)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmSubmit}
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
            >
              Confirmar corte
            </button>
          </div>
        </div>
      </ModalDialog>

      <ModalDialog
        open={Boolean(observeTarget)}
        title={`Reportar discrepancia en ${observeTarget?.folio ?? ''} (PC-05)`}
        description="El comentario obligatorio guía a Secretaría para corregir el corte y reenviarlo a PREPARADO."
        onClose={() => setObserveTarget(null)}
      >
        <form onSubmit={handleObserveSubmit} noValidate className="space-y-4 text-sm">
          <div>
            <label htmlFor="obs-cut-comment" className="block font-semibold text-ink">
              Comentario de discrepancia (obligatorio)
            </label>
            <textarea
              id="obs-cut-comment"
              rows={3}
              value={observeComment}
              onChange={(e) => setObserveComment(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="Ej. Falta revisar el folio COB-2026-0001 o corregir fechas."
            />
          </div>
          {observeError ? (
            <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-critical-ink">
              {observeError}
            </p>
          ) : null}
          <div className="flex justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setObserveTarget(null)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-amber-700 px-4 py-2 font-semibold text-white hover:bg-amber-800"
            >
              Marcar como OBSERVADO
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  )
}
