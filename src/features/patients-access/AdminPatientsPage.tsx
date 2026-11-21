import { useId, useState } from 'react'
import { Link } from 'react-router'
import { formatDateGmt6, nowGmt6Iso } from '../../design-system/gmt6.ts'
import { StateView, type DataViewMode } from '../../design-system/StateView.tsx'
import { StatusBadge } from '../../design-system/StatusBadge.tsx'
import {
  evaluateObjectAccess,
  getActiveGrantForPatient,
  isInAuxiliaryOrdinaryScope,
} from '../../guards/objectAccess.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'

export function AdminPatientsPage() {
  const { currentUser, currentTenant, patients, records, accounts, grants } = useMockStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [assignmentFilter, setAssignmentFilter] = useState<'ALL' | 'ASSIGNED' | 'PENDING'>('ALL')
  const [viewMode, setViewMode] = useState<DataViewMode>('ready')

  const tableHeadingId = useId()

  if (!currentUser || !currentTenant) return null

  const nowIso = nowGmt6Iso()
  const canCreatePatient = evaluateObjectAccess({
    actor: currentUser,
    tenant: currentTenant,
    operation: 'PATIENT_CREATE',
    grants,
    nowIsoGmt6: nowIso,
  }).allowed

  const tenantPatients = patients.filter((p) => p.tenantId === currentTenant.id)
  const visibleEntries = tenantPatients
    .map((patient) => {
      const record = records.find((r) => r.patientId === patient.id)
      const readDecision = evaluateObjectAccess({
        actor: currentUser,
        tenant: currentTenant,
        patient,
        record,
        operation: 'PATIENT_ADMIN_READ',
        grants,
        nowIsoGmt6: nowIso,
      })
      return { patient, record, allowed: readDecision.allowed }
    })
    .filter((entry) => entry.allowed && entry.record)

  const filtered = visibleEntries.filter(({ patient, record }) => {
    if (assignmentFilter === 'ASSIGNED' && !record?.primarySpecialistId) return false
    if (assignmentFilter === 'PENDING' && record?.primarySpecialistId) return false
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      patient.fullName.toLowerCase().includes(q) ||
      patient.patientCode.toLowerCase().includes(q) ||
      patient.phone.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-divider pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-medium text-clinical">CU-01 · CU-02 · CU-10</p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
            Pacientes de {currentTenant.name}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Directorio administrativo filtrado por tu rol y ámbito vigente. Sin acceso a notas ni diagnósticos clínicos.
          </p>
        </div>

        {canCreatePatient ? (
          <Link
            to="/admin/patients/new"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-clinical px-4 py-2.5 text-sm font-semibold text-white hover:bg-clinical-hover"
          >
            Registrar paciente
          </Link>
        ) : null}
      </div>

      {currentUser.role === 'AUXILIAR' ? (
        <div className="flex flex-col gap-3 rounded-lg border border-blue-300 bg-info-bg p-4 text-sm text-info-ink sm:flex-row sm:items-center sm:justify-between">
          <p>
            Solo aparecen pacientes de tus especialistas vinculados (ámbito ordinario), pacientes con
            permiso excepcional vigente o expedientes pendientes de asignación inicial.
          </p>
          <Link
            to="/admin/exceptional-access"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-blue-800 bg-surface px-3.5 py-2 text-xs font-semibold text-info-ink hover:bg-blue-50"
          >
            Solicitar acceso excepcional
          </Link>
        </div>
      ) : null}

      <section className="rounded-lg border border-divider bg-surface p-4">
        <search>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="grid gap-3 md:grid-cols-[1fr_13rem_12rem]"
          >
            <div>
              <label htmlFor="patient-search" className="block text-xs font-semibold text-ink">
                Buscar en tu ámbito permitido
              </label>
              <input
                id="patient-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Código PAT-0101, nombre o teléfono"
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="patient-assign-filter" className="block text-xs font-semibold text-ink">
                Responsable principal
              </label>
              <select
                id="patient-assign-filter"
                value={assignmentFilter}
                onChange={(e) =>
                  setAssignmentFilter(e.target.value as 'ALL' | 'ASSIGNED' | 'PENDING')
                }
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="ALL">Todos</option>
                <option value="ASSIGNED">Asignados</option>
                <option value="PENDING">Pendiente de asignación</option>
              </select>
            </div>

            <div>
              <label htmlFor="patient-view-mode" className="block text-xs font-semibold text-ink">
                Estado de vista
              </label>
              <select
                id="patient-view-mode"
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as DataViewMode)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="ready">Datos disponibles</option>
                <option value="loading">Simular carga</option>
                <option value="error">Simular error</option>
              </select>
            </div>
          </form>
        </search>
      </section>

      {viewMode === 'loading' ? (
        <StateView
          mode="loading"
          title="Consultando fichas administrativas..."
          message="Evaluando ámbito y vínculos vigentes vía política transversal CU-10."
        />
      ) : viewMode === 'error' ? (
        <StateView
          mode="error"
          title="No fue posible consultar el listado de pacientes"
          message="Fallo simulado del servicio administrativo de pacientes."
          onRetry={() => setViewMode('ready')}
        />
      ) : filtered.length === 0 ? (
        <StateView
          mode="empty"
          title="Sin pacientes visibles con estos filtros"
          message="Cambia los filtros o solicita acceso excepcional si necesitas consultar otro paciente de la clínica."
          action={
            currentUser.role === 'AUXILIAR' ? (
              <Link
                to="/admin/exceptional-access"
                className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 text-sm font-semibold text-white hover:bg-clinical-hover"
              >
                Ir a acceso excepcional
              </Link>
            ) : undefined
          }
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
              Listado administrativo de pacientes accesibles
            </caption>
            <thead>
              <tr>
                <th scope="col">Paciente</th>
                <th scope="col">Nacimiento y contacto</th>
                <th scope="col">Estado del expediente (CU-02)</th>
                <th scope="col">Fundamento de ámbito</th>
                <th scope="col">Ficha</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ patient, record }) => {
                if (!record) return null
                const primary = record.primarySpecialistId
                  ? accounts.find((a) => a.id === record.primarySpecialistId)
                  : undefined
                const activeGrant =
                  currentUser.role === 'AUXILIAR'
                    ? getActiveGrantForPatient(currentUser, patient.id, grants, nowIso)
                    : undefined
                const isOrdinary =
                  currentUser.role === 'AUXILIAR' && isInAuxiliaryOrdinaryScope(currentUser, record)

                return (
                  <tr key={patient.id}>
                    <th scope="row" className="text-left">
                      <p className="font-mono text-xs font-semibold text-clinical">
                        {patient.patientCode}
                      </p>
                      <p className="mt-0.5 font-semibold text-ink">{patient.fullName}</p>
                    </th>
                    <td data-label="Nacimiento y contacto">
                      <p className="font-mono text-xs text-ink">
                        {formatDateGmt6(patient.birthDateGmt6)}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-ink-muted">{patient.phone}</p>
                    </td>
                    <td data-label="Estado del expediente">
                      {primary ? (
                        <div className="space-y-1">
                          <StatusBadge tone="positive" label="Asignado" />
                          <p className="text-xs text-ink-muted">Principal: {primary.fullName}</p>
                          {record.treatingSpecialistIds.length > 0 ? (
                            <p className="text-xs text-ink-muted">
                              Tratantes adicionales: {record.treatingSpecialistIds.length}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <StatusBadge tone="warning" label="Pendiente de asignación" />
                      )}
                    </td>
                    <td data-label="Fundamento de ámbito">
                      {currentUser.role === 'ADMIN_CLINICA' ? (
                        <span className="text-xs text-ink-muted">Administración de clínica</span>
                      ) : isOrdinary ? (
                        <StatusBadge tone="positive" label="Ámbito ordinario" />
                      ) : activeGrant ? (
                        <StatusBadge tone="info" label="Acceso excepcional vigente" />
                      ) : (
                        <StatusBadge tone="warning" label="Pendiente asignación inicial" />
                      )}
                    </td>
                    <td data-label="Ficha">
                      <Link
                        to={`/admin/patients/${patient.id}`}
                        className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-slate-100"
                      >
                        Abrir ficha administrativa
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
