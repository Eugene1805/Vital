import { Link } from 'react-router'
import { formatDateTimeGmt6 } from '../../design-system/gmt6.ts'
import { FileTextIcon } from '../../design-system/Icons.tsx'
import { StateView } from '../../design-system/StateView.tsx'
import { StatusBadge } from '../../design-system/StatusBadge.tsx'
import { useMockStore } from '../../mocks/useMockStore.ts'

export function OpenNotesPage() {
  const { currentUser, currentTenant, encounters, patients } = useMockStore()
  if (!currentUser || !currentTenant) return null

  // CU-03: Bandeja estrictamente privada por autor; no bloquea nuevas atenciones.
  const myDrafts = encounters
    .filter(
      (e) =>
        e.tenantId === currentTenant.id &&
        e.specialistId === currentUser.id &&
        e.noteStatus === 'BORRADOR',
    )
    .sort((a, b) => b.noteUpdatedAtGmt6.localeCompare(a.noteUpdatedAtGmt6))

  return (
    <div className="space-y-6">
      <div className="border-b border-divider pb-5">
        <p className="font-mono text-xs font-medium text-clinical">CU-03 · BANDEJA PRIVADA</p>
        <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">Notas clínicas abiertas</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Tus notas en estado BORRADOR (visibles únicamente para ti). Tener borradores abiertos no bloquea registrar nuevas atenciones ni finalizarlas.
        </p>
      </div>

      {myDrafts.length === 0 ? (
        <StateView
          mode="empty"
          title="No tienes notas clínicas abiertas"
          message="Todas tus notas de atención han sido cerradas explícitamente."
          action={
            <Link
              to="/clinical/records"
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 text-sm font-semibold text-white hover:bg-clinical-hover"
            >
              Ir a mis expedientes
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {myDrafts.map((enc) => {
            const patient = patients.find((p) => p.id === enc.patientId)
            return (
              <li
                key={enc.id}
                className="flex flex-col gap-4 rounded-lg border border-divider bg-surface p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-clinical">
                      {patient?.patientCode ?? enc.patientId}
                    </span>
                    <span className="font-bold text-ink">{patient?.fullName}</span>
                    <StatusBadge
                      tone={enc.encounterStatus === 'FINALIZADA' ? 'positive' : 'info'}
                      label={`Atención: ${enc.encounterStatus}`}
                    />
                    <StatusBadge
                      tone="warning"
                      icon={<FileTextIcon className="h-3.5 w-3.5 shrink-0" />}
                      label="Nota: BORRADOR"
                    />
                  </div>
                  <p className="text-sm font-medium text-ink">Motivo: {enc.chiefComplaint}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {enc.noteContent || 'Borrador sin texto capturado aún'}
                  </p>
                  <p className="font-mono text-xs text-ink-muted">
                    Última actualización: {formatDateTimeGmt6(enc.noteUpdatedAtGmt6)}
                  </p>
                </div>

                <Link
                  to={`/clinical/records/${enc.recordId}/encounters/${enc.id}`}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-clinical px-4 py-2 text-sm font-semibold text-white hover:bg-clinical-hover"
                >
                  Retomar nota
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
