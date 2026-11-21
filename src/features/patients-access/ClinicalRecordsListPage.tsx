import { useId, useState } from 'react'
import { Link } from 'react-router'
import { formatDateGmt6, nowGmt6Iso } from '../../design-system/gmt6.ts'
import { StateView, type DataViewMode } from '../../design-system/StateView.tsx'
import { StatusBadge } from '../../design-system/StatusBadge.tsx'
import { evaluateObjectAccess } from '../../guards/objectAccess.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'

export function ClinicalRecordsListPage() {
  const { currentUser, currentTenant, patients, records, grants } = useMockStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<DataViewMode>('ready')
  const tableHeadingId = useId()

  if (!currentUser || !currentTenant) return null

  const nowIso = nowGmt6Iso()

  const authorizedEntries = records
    .filter((rec) => rec.tenantId === currentTenant.id)
    .map((record) => {
      const patient = patients.find((p) => p.id === record.patientId)
      const access = evaluateObjectAccess({
        actor: currentUser,
        tenant: currentTenant,
        patient,
        record,
        operation: 'CLINICAL_RECORD_READ',
        grants,
        nowIsoGmt6: nowIso,
      })
      return { record, patient, allowed: access.allowed }
    })
    .filter((entry) => entry.allowed && entry.patient)

  const filtered = authorizedEntries.filter(({ patient }) => {
    const q = searchQuery.trim().toLowerCase()
    if (!q || !patient) return true
    return (
      patient.fullName.toLowerCase().includes(q) ||
      patient.patientCode.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-divider pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-medium text-clinical">CU-08 · CU-10</p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
            Expedientes con vínculo clínico vigente
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Solo aparecen expedientes donde eres responsable principal o tratante autorizado en {currentTenant.name}.
          </p>
        </div>
        {currentUser.permissions.canRegisterPatients ? (
          <Link
            to="/admin/patients/new"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-100"
          >
            Registrar paciente nuevo
          </Link>
        ) : null}
      </div>

      <section className="rounded-lg border border-divider bg-surface p-4">
        <search>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="grid gap-3 md:grid-cols-[1fr_13rem]"
          >
            <div>
              <label htmlFor="clinical-record-search" className="block text-xs font-semibold text-ink">
                Buscar expediente autorizado
              </label>
              <input
                id="clinical-record-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Código o nombre del paciente"
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="clinical-view-mode" className="block text-xs font-semibold text-ink">
                Estado de vista
              </label>
              <select
                id="clinical-view-mode"
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
          title="Consultando expedientes autorizados..."
          message="Verificando vínculos vigentes de especialista vía CU-10."
        />
      ) : viewMode === 'error' ? (
        <StateView
          mode="error"
          title="Error al consultar el Espacio Clínico"
          message="Fallo simulado del servicio clínico."
          onRetry={() => setViewMode('ready')}
        />
      ) : filtered.length === 0 ? (
        <StateView
          mode="empty"
          title="No tienes expedientes asignados que coincidan"
          message="Un expediente pendiente de asignación o registrado sin vínculo vigente no aparece en tu Espacio Clínico."
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
              Expedientes clínicos con acceso vigente para {currentUser.fullName}
            </caption>
            <thead>
              <tr>
                <th scope="col">Paciente</th>
                <th scope="col">Tu vínculo vigente</th>
                <th scope="col">Alertas críticas</th>
                <th scope="col">Notas cerradas</th>
                <th scope="col">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ record, patient }) => {
                if (!patient) return null
                const isPrimary = record.primarySpecialistId === currentUser.id
                const closedCount = record.notesPreview.filter((n) => n.status === 'CERRADA').length
                return (
                  <tr key={record.id}>
                    <th scope="row" className="text-left">
                      <p className="font-mono text-xs font-semibold text-clinical">
                        {patient.patientCode}
                      </p>
                      <p className="mt-0.5 font-semibold text-ink">{patient.fullName}</p>
                      <p className="mt-0.5 font-mono text-xs text-ink-muted">
                        Nacimiento: {formatDateGmt6(patient.birthDateGmt6)}
                      </p>
                    </th>
                    <td data-label="Vínculo vigente">
                      <StatusBadge
                        tone={isPrimary ? 'positive' : 'info'}
                        label={isPrimary ? 'Responsable principal' : 'Tratante adicional'}
                      />
                    </td>
                    <td data-label="Alertas críticas">
                      <p className="text-xs text-ink">{record.criticalAllergies.join(', ')}</p>
                    </td>
                    <td data-label="Notas cerradas">
                      <span className="font-mono text-sm font-semibold text-ink">{closedCount}</span>
                    </td>
                    <td data-label="Acción">
                      <Link
                        to={`/clinical/records/${record.id}`}
                        className="inline-flex min-h-11 items-center rounded-md bg-clinical px-3.5 py-2 text-xs font-semibold text-white hover:bg-clinical-hover"
                      >
                        Abrir Espacio Clínico
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
