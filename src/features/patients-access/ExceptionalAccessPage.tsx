import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { formatDateTimeGmt6, nowGmt6Iso } from '../../design-system/gmt6.ts'
import { KeyIcon } from '../../design-system/Icons.tsx'
import { ModalDialog } from '../../design-system/ModalDialog.tsx'
import { StateView, type DataViewMode } from '../../design-system/StateView.tsx'
import { StatusBadge, type BadgeTone } from '../../design-system/StatusBadge.tsx'
import type {
  ExceptionalAccessGrant,
  ExceptionalDurationMonths,
  ExceptionalOperation,
  ExceptionalRequestStatus,
} from '../../domain/types.ts'
import {
  EXCEPTIONAL_OPERATION_LABELS,
  getEffectiveGrantStatus,
  searchPatientsRestricted,
} from '../../guards/objectAccess.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'

const ALL_OPERATIONS = Object.keys(EXCEPTIONAL_OPERATION_LABELS) as ExceptionalOperation[]

function grantTone(status: ExceptionalRequestStatus): BadgeTone {
  switch (status) {
    case 'APROBADA':
      return 'positive'
    case 'PENDIENTE':
      return 'warning'
    case 'RECHAZADA':
    case 'REVOCADA':
      return 'critical'
    case 'VENCIDA':
      return 'neutral'
  }
}

export function ExceptionalAccessPage() {
  const {
    currentUser,
    currentTenant,
    patients,
    grants,
    requestExceptionalAccess,
    resolveExceptionalAccess,
    revokeExceptionalAccess,
  } = useMockStore()

  const [viewMode, setViewMode] = useState<DataViewMode>('ready')
  const [statusFilter, setStatusFilter] = useState<'ALL' | ExceptionalRequestStatus>('ALL')
  const [banner, setBanner] = useState<{ tone: 'positive' | 'critical'; text: string } | null>(null)

  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [selectedOps, setSelectedOps] = useState<ExceptionalOperation[]>([
    'VIEW_ADMIN_SUMMARY',
    'PREPARE_PATIENT',
  ])
  const [reason, setReason] = useState('')
  const [requestedMonths, setRequestedMonths] = useState<ExceptionalDurationMonths>(3)
  const [requestError, setRequestError] = useState<string | null>(null)

  const [resolveTarget, setResolveTarget] = useState<ExceptionalAccessGrant | null>(null)
  const [resolveDecision, setResolveDecision] = useState<'APROBAR' | 'RECHAZAR'>('APROBAR')
  const [approvedOps, setApprovedOps] = useState<ExceptionalOperation[]>([])
  const [approvedMonths, setApprovedMonths] = useState(1)
  const [resolutionNote, setResolutionNote] = useState('')
  const [resolveError, setResolveError] = useState<string | null>(null)

  const tableHeadingId = useId()

  if (!currentUser || !currentTenant) return null

  const nowIso = nowGmt6Iso()
  const isAdmin = currentUser.role === 'ADMIN_CLINICA'

  const tenantGrants = grants.filter((g) => {
    if (g.tenantId !== currentTenant.id) return false
    if (!isAdmin && g.requesterAccountId !== currentUser.id) return false
    const effective = getEffectiveGrantStatus(g, nowIso)
    if (statusFilter !== 'ALL' && effective !== statusFilter) return false
    return true
  })

  const searchResult = searchPatientsRestricted(searchQuery, currentUser, patients)

  const openRequestModal = () => {
    setSearchQuery('')
    setSelectedPatientId('')
    setSelectedOps(['VIEW_ADMIN_SUMMARY', 'PREPARE_PATIENT'])
    setReason('')
    setRequestedMonths(3)
    setRequestError(null)
    setRequestModalOpen(true)
  }

  const openResolveModal = (grant: ExceptionalAccessGrant) => {
    setResolveTarget(grant)
    setResolveDecision('APROBAR')
    setApprovedOps([...grant.requestedOperations])
    setApprovedMonths(grant.requestedMonths)
    setResolutionNote('')
    setResolveError(null)
  }

  const handleRequestSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setRequestError(null)
    if (!selectedPatientId) {
      setRequestError('Busca y selecciona un paciente mediante código exacto o mínimo 4 caracteres.')
      return
    }
    const decision = requestExceptionalAccess({
      patientId: selectedPatientId,
      operations: selectedOps,
      reason,
      requestedMonths,
    })
    if (!decision.allowed) {
      setRequestError(decision.message)
      return
    }
    setRequestModalOpen(false)
    setBanner({
      tone: 'positive',
      text: 'Solicitud excepcional enviada. Permanecerá pendiente hasta que AdminClinica la resuelva.',
    })
  }

  const handleResolveSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!resolveTarget) return
    setResolveError(null)

    const decision = resolveExceptionalAccess(
      resolveTarget.id,
      resolveDecision,
      approvedOps,
      approvedMonths,
      resolutionNote,
    )
    if (!decision.allowed) {
      setResolveError(decision.message)
      return
    }

    const code = resolveTarget.patientCode
    setResolveTarget(null)
    setBanner({
      tone: 'positive',
      text:
        resolveDecision === 'APROBAR'
          ? `Permiso excepcional aprobado para ${code} por ${approvedMonths} mes(es) en GMT-6.`
          : `Solicitud excepcional rechazada para ${code}.`,
    })
  }

  const handleRevoke = (grant: ExceptionalAccessGrant) => {
    const decision = revokeExceptionalAccess(grant.id)
    if (!decision.allowed) {
      setBanner({ tone: 'critical', text: decision.message })
      return
    }
    setBanner({
      tone: 'positive',
      text: `Permiso excepcional revocado para ${grant.patientCode}. El auxiliar perdió acceso inmediato.`,
    })
  }

  const durationOptionsForResolve = resolveTarget
    ? Array.from({ length: resolveTarget.requestedMonths }, (_, idx) => idx + 1)
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-divider pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-medium text-clinical">
            PROCESO CANDIDATO SIN ID · PC-01 · PC-03
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
            Acceso auxiliar excepcional por paciente
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {isAdmin
              ? 'Bandeja de resolución y revocación de permisos temporales para pacientes fuera del ámbito ordinario.'
              : 'Solicita acceso temporal acotado a operaciones concretas de un paciente fuera de tu ámbito ordinario.'}
          </p>
        </div>

        {!isAdmin ? (
          <button
            type="button"
            onClick={openRequestModal}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-clinical px-4 py-2.5 text-sm font-semibold text-white hover:bg-clinical-hover"
          >
            <KeyIcon className="h-4 w-4" />
            <span>Solicitar acceso excepcional</span>
          </button>
        ) : null}
      </div>

      {banner ? (
        <div
          role={banner.tone === 'critical' ? 'alert' : 'status'}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm font-medium ${
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
            Ocultar aviso
          </button>
        </div>
      ) : null}

      <section className="rounded-lg border border-divider bg-surface p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="grant-status-filter" className="block text-xs font-semibold text-ink">
              Filtrar por estado efectivo (GMT-6)
            </label>
            <select
              id="grant-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | ExceptionalRequestStatus)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="ALL">Todos los estados</option>
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="APROBADA">APROBADA (vigente)</option>
              <option value="RECHAZADA">RECHAZADA</option>
              <option value="REVOCADA">REVOCADA</option>
              <option value="VENCIDA">VENCIDA</option>
            </select>
          </div>
          <div>
            <label htmlFor="grant-view-mode" className="block text-xs font-semibold text-ink">
              Estado de vista
            </label>
            <select
              id="grant-view-mode"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as DataViewMode)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="ready">Datos disponibles</option>
              <option value="loading">Simular carga</option>
              <option value="error">Simular error</option>
            </select>
          </div>
        </div>
      </section>

      {viewMode === 'loading' ? (
        <StateView
          mode="loading"
          title="Consultando solicitudes y permisos excepcionales..."
          message="Validando vigencias en horario fijo GMT-6."
        />
      ) : viewMode === 'error' ? (
        <StateView
          mode="error"
          title="No fue posible consultar los permisos excepcionales"
          message="Fallo simulado de comunicación con el servicio de autorizaciones."
          onRetry={() => setViewMode('ready')}
        />
      ) : tenantGrants.length === 0 ? (
        <StateView
          mode="empty"
          title="Sin solicitudes o permisos registrados"
          message="Cambia el filtro de estado o crea una nueva solicitud cuando necesites atender a un paciente fuera de tu ámbito."
        />
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-labelledby={tableHeadingId}
          className="table-wrapper rounded-lg border border-divider bg-surface"
        >
          <table className="vital-table">
            <caption id={tableHeadingId} className="sr-only">
              Solicitudes y permisos excepcionales de la clínica
            </caption>
            <thead>
              <tr>
                <th scope="col">Paciente y solicitante</th>
                <th scope="col">Estado</th>
                <th scope="col">Operaciones (solicitadas vs aprobadas)</th>
                <th scope="col">Vigencia y auditoría (GMT-6)</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tenantGrants.map((grant) => {
                const effectiveStatus = getEffectiveGrantStatus(grant, nowIso)
                return (
                  <tr key={grant.id}>
                    <th scope="row" className="text-left">
                      <p className="font-mono text-xs font-semibold text-clinical">
                        {grant.patientCode}
                      </p>
                      <p className="mt-0.5 font-semibold text-ink">
                        {grant.patientFullName}{' '}
                        <span className="font-mono text-xs font-normal text-ink-muted">
                          ({grant.patientBirthYear})
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        Solicitante: {grant.requesterName}
                      </p>
                    </th>
                    <td data-label="Estado">
                      <StatusBadge tone={grantTone(effectiveStatus)} label={effectiveStatus} />
                    </td>
                    <td data-label="Operaciones">
                      <p className="text-xs text-ink">
                        <strong>Motivo:</strong> {grant.reason}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        <strong>Solicitadas:</strong>{' '}
                        {grant.requestedOperations.map((op) => EXCEPTIONAL_OPERATION_LABELS[op]).join('; ')}
                      </p>
                      {grant.approvedOperations.length > 0 ? (
                        <p className="mt-1 text-xs font-medium text-positive-ink">
                          <strong>Concedidas:</strong>{' '}
                          {grant.approvedOperations.map((op) => EXCEPTIONAL_OPERATION_LABELS[op]).join('; ')}
                        </p>
                      ) : null}
                    </td>
                    <td data-label="Vigencia y auditoría">
                      <p className="font-mono text-xs text-ink">
                        Solicitada: {grant.requestedMonths} mes(es)
                      </p>
                      {grant.approvedMonths ? (
                        <p className="font-mono text-xs font-semibold text-positive-ink">
                          Aprobada: {grant.approvedMonths} mes(es)
                        </p>
                      ) : null}
                      {grant.expiresAtGmt6 ? (
                        <p className="mt-0.5 font-mono text-xs text-ink-muted">
                          Vence: {formatDateTimeGmt6(grant.expiresAtGmt6)}
                        </p>
                      ) : null}
                      {grant.resolvedByName && grant.resolvedAtGmt6 ? (
                        <p className="mt-1 text-xs text-ink-muted">
                          Resolvió {grant.resolvedByName} el{' '}
                          {formatDateTimeGmt6(grant.resolvedAtGmt6)}
                        </p>
                      ) : null}
                    </td>
                    <td data-label="Acciones">
                      <div className="flex flex-wrap gap-2">
                        {isAdmin && effectiveStatus === 'PENDIENTE' ? (
                          <button
                            type="button"
                            onClick={() => openResolveModal(grant)}
                            className="inline-flex min-h-11 items-center rounded-md bg-clinical px-3 py-1.5 text-xs font-semibold text-white hover:bg-clinical-hover"
                          >
                            Resolver solicitud
                          </button>
                        ) : null}

                        {isAdmin && effectiveStatus === 'APROBADA' ? (
                          <button
                            type="button"
                            onClick={() => handleRevoke(grant)}
                            className="inline-flex min-h-11 items-center rounded-md border border-red-700 bg-surface px-3 py-1.5 text-xs font-semibold text-critical-ink hover:bg-red-50"
                          >
                            Revocar permiso
                          </button>
                        ) : null}

                        {!isAdmin && effectiveStatus === 'APROBADA' ? (
                          <Link
                            to={`/admin/patients/${grant.patientId}`}
                            className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
                          >
                            Abrir ficha permitida
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Auxiliar: Solicitar acceso excepcional con buscador restringido PC-03 */}
      <ModalDialog
        open={requestModalOpen}
        title="Solicitar acceso auxiliar excepcional (PC-01 · PC-03)"
        description="Solo para un paciente fuera de tu ámbito ordinario. Nunca otorga lectura clínica general."
        onClose={() => setRequestModalOpen(false)}
        closeOnBackdrop={false}
      >
        <form onSubmit={handleRequestSubmit} className="space-y-4 text-sm">
          <div className="rounded-md border border-divider bg-slate-50 p-3.5">
            <label htmlFor="restricted-patient-search" className="block font-semibold text-ink">
              Buscar paciente (código exacto o mínimo 4 caracteres)
            </label>
            <input
              id="restricted-patient-search"
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setSelectedPatientId('')
              }}
              placeholder="Ej. PAT-0102 o Carlos"
              className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-ink-muted">
              Por seguridad (PC-03), solo muestra `patientCode`, `fullName` y `birthYear`.
            </p>

            <div className="mt-3">
              {!searchResult.valid ? (
                <p className="text-xs font-medium text-ink-muted">
                  Escribe al menos 4 caracteres de nombre o un código exacto (ej. PAT-0102) para consultar.
                </p>
              ) : searchResult.results.length === 0 ? (
                <p className="text-xs font-medium text-ink-muted">
                  No se encontraron coincidencias en tu clínica.
                </p>
              ) : (
                <fieldset className="space-y-2">
                  <legend className="text-xs font-semibold text-ink">
                    Selecciona un paciente (una solicitud por paciente)
                  </legend>
                  {searchResult.results.map((hit) => (
                    <label
                      key={hit.patientId}
                      className="flex items-center gap-2.5 rounded border border-divider bg-surface px-3 py-2"
                    >
                      <input
                        type="radio"
                        name="selected-patient"
                        value={hit.patientId}
                        checked={selectedPatientId === hit.patientId}
                        onChange={() => setSelectedPatientId(hit.patientId)}
                      />
                      <span className="font-mono text-xs font-semibold text-clinical">
                        {hit.patientCode}
                      </span>
                      <span className="font-semibold text-ink">{hit.fullName}</span>
                      <span className="font-mono text-xs text-ink-muted">({hit.birthYear})</span>
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
          </div>

          <fieldset className="space-y-2 rounded-md border border-divider p-3.5">
            <legend className="px-1 text-xs font-semibold text-ink">
              Operaciones específicas solicitadas
            </legend>
            {ALL_OPERATIONS.map((op) => {
              const checked = selectedOps.includes(op)
              return (
                <label key={op} className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedOps((prev) => [...prev, op])
                      else setSelectedOps((prev) => prev.filter((item) => item !== op))
                    }}
                    className="mt-0.5"
                  />
                  <span>{EXCEPTIONAL_OPERATION_LABELS[op]}</span>
                </label>
              )
            })}
          </fieldset>

          <div>
            <label htmlFor="exceptional-reason" className="block font-semibold text-ink">
              Motivo obligatorio <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="exceptional-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Justifica por qué necesitas atender temporalmente a este paciente."
            />
          </div>

          <fieldset className="rounded-md border border-divider p-3.5">
            <legend className="px-1 text-xs font-semibold text-ink">
              Vigencia solicitada (GMT-6)
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([1, 3, 6, 12] as const).map((months) => (
                <label
                  key={months}
                  className="flex min-h-11 items-center gap-2 rounded border border-slate-300 px-3 py-1.5"
                >
                  <input
                    type="radio"
                    name="requested-months"
                    value={months}
                    checked={requestedMonths === months}
                    onChange={() => setRequestedMonths(months)}
                  />
                  <span>{months === 1 ? '1 mes' : `${months} meses`}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {requestError ? (
            <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 font-medium text-critical-ink">
              {requestError}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setRequestModalOpen(false)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
            >
              Enviar solicitud
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal AdminClinica: Resolver solicitud permitiendo reducir alcance/vigencia */}
      <ModalDialog
        open={Boolean(resolveTarget)}
        title="Resolver solicitud excepcional (AdminClinica)"
        description={
          resolveTarget
            ? `${resolveTarget.requesterName} solicita acceso a ${resolveTarget.patientCode} (${resolveTarget.patientFullName})`
            : undefined
        }
        onClose={() => setResolveTarget(null)}
      >
        {resolveTarget ? (
          <form onSubmit={handleResolveSubmit} className="space-y-4 text-sm">
            <div className="rounded-md border border-divider bg-slate-50 p-3 text-xs">
              <p>
                <strong>Motivo reportado:</strong> {resolveTarget.reason}
              </p>
              <p className="mt-1">
                <strong>Vigencia solicitada:</strong> {resolveTarget.requestedMonths} mes(es)
              </p>
            </div>

            <fieldset className="flex gap-4">
              <legend className="mb-1 text-xs font-semibold text-ink">Decisión</legend>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name="resolve-decision"
                  value="APROBAR"
                  checked={resolveDecision === 'APROBAR'}
                  onChange={() => setResolveDecision('APROBAR')}
                />
                <span className="font-semibold text-positive-ink">Aprobar (igual o menor alcance)</span>
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name="resolve-decision"
                  value="RECHAZAR"
                  checked={resolveDecision === 'RECHAZAR'}
                  onChange={() => setResolveDecision('RECHAZAR')}
                />
                <span className="font-semibold text-critical-ink">Rechazar</span>
              </label>
            </fieldset>

            {resolveDecision === 'APROBAR' ? (
              <>
                <fieldset className="space-y-2 rounded-md border border-divider p-3.5">
                  <legend className="px-1 text-xs font-semibold text-ink">
                    Operaciones concedidas (puedes restringir las solicitadas)
                  </legend>
                  {resolveTarget.requestedOperations.map((op) => {
                    const checked = approvedOps.includes(op)
                    return (
                      <label key={op} className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) setApprovedOps((prev) => [...prev, op])
                            else setApprovedOps((prev) => prev.filter((item) => item !== op))
                          }}
                          className="mt-0.5"
                        />
                        <span>{EXCEPTIONAL_OPERATION_LABELS[op]}</span>
                      </label>
                    )
                  })}
                </fieldset>

                <div>
                  <label htmlFor="approved-months-select" className="block font-semibold text-ink">
                    Vigencia aprobada (máximo {resolveTarget.requestedMonths} meses)
                  </label>
                  <select
                    id="approved-months-select"
                    value={approvedMonths}
                    onChange={(e) => setApprovedMonths(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  >
                    {durationOptionsForResolve.map((m) => (
                      <option key={m} value={m}>
                        {m === 1 ? '1 mes' : `${m} meses`}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}

            <div>
              <label htmlFor="resolution-note" className="block font-semibold text-ink">
                Observación de resolución (opcional)
              </label>
              <input
                id="resolution-note"
                type="text"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Ej. Reducido a 3 meses y solo carga de estudio."
              />
            </div>

            {resolveError ? (
              <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 font-medium text-critical-ink">
                {resolveError}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3 border-t border-divider pt-4">
              <button
                type="button"
                onClick={() => setResolveTarget(null)}
                className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
              >
                Confirmar resolución
              </button>
            </div>
          </form>
        ) : null}
      </ModalDialog>
    </div>
  )
}
