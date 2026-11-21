import { Link } from 'react-router'
import { StatusBadge } from '../../design-system/StatusBadge.tsx'
import { useMockStore } from '../../mocks/useMockStore.ts'

export function AuxiliaryWorkspacePage() {
  const { currentUser, currentTenant, accounts } = useMockStore()
  if (!currentUser || !currentTenant) return null

  const linkedSpecialists = currentUser.linkedSpecialistIds
    .map((id) => accounts.find((a) => a.id === id && a.tenantId === currentTenant.id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  return (
    <div className="space-y-6">
      <div className="border-b border-divider pb-5">
        <p className="font-mono text-xs font-medium text-clinical">CU-10 · CU-12 · CU-13</p>
        <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
          Ámbito operativo auxiliar
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Sesión administrativa de {currentUser.fullName} en {currentTenant.name}. Sin acceso general a notas o diagnósticos clínicos.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-divider bg-surface p-5">
          <h2 className="text-lg font-bold text-ink">Facultades administrativas habilitadas</h2>
          <ul className="mt-3 space-y-2.5 text-sm">
            <li className="flex items-center justify-between gap-2">
              <span>Registrar pacientes de la clínica (CU-01)</span>
              <StatusBadge
                tone={currentUser.permissions.canRegisterPatients ? 'positive' : 'neutral'}
                label={currentUser.permissions.canRegisterPatients ? 'Habilitado' : 'No habilitado'}
              />
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>Asignar responsable inicial (CU-02)</span>
              <StatusBadge
                tone={currentUser.permissions.canAssignInitialPrimary ? 'positive' : 'neutral'}
                label={
                  currentUser.permissions.canAssignInitialPrimary ? 'Habilitado' : 'No habilitado'
                }
              />
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>Cargar estudios PDF en ámbito (CU-04)</span>
              <StatusBadge
                tone={currentUser.permissions.canUploadStudies ? 'positive' : 'neutral'}
                label={currentUser.permissions.canUploadStudies ? 'Habilitado' : 'No habilitado'}
              />
            </li>
          </ul>
        </div>

        <div className="rounded-lg border border-divider bg-surface p-5">
          <h2 className="text-lg font-bold text-ink">
            Especialistas vinculados vigentes ({linkedSpecialists.length})
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Solo los pacientes con alguno de estos especialistas como principal o tratante vigente integran tu ámbito ordinario (CU-10).
          </p>
          {linkedSpecialists.length === 0 ? (
            <p className="mt-4 rounded-md border border-divider bg-slate-50 p-3 text-sm text-ink-muted">
              No tienes especialistas vinculados actualmente. Un AdminClinica debe asignarlos en
              Personal y roles.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {linkedSpecialists.map((spec) => (
                <li
                  key={spec.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-divider bg-slate-50 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-semibold text-ink">{spec.fullName}</p>
                    <p className="text-xs text-ink-muted">{spec.specialty ?? 'General'}</p>
                  </div>
                  <StatusBadge
                    tone={spec.active ? 'positive' : 'neutral'}
                    label={spec.active ? 'Vínculo activo' : 'Especialista desactivado'}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-blue-300 bg-info-bg p-4 text-sm text-info-ink">
        <p>
          <strong>Operación disponible:</strong> gestiona la{' '}
          <Link to="/admin/appointments" className="font-semibold underline">
            Agenda clínica (CU-18)
          </Link>
          , consulta tu listado acotado y captura preparaciones preliminares (CU-19) en{' '}
          <Link to="/admin/patients" className="font-semibold underline">
            Pacientes
          </Link>
          , opera{' '}
          <Link to="/admin/billing" className="font-semibold underline">
            Billing y cortes (CU-20 a CU-22)
          </Link>{' '}
          o solicita permisos temporales en{' '}
          <Link to="/admin/exceptional-access" className="font-semibold underline">
            Acceso excepcional
          </Link>
          . Las 4 oleadas del prototipo frontend están habilitadas.
        </p>
      </section>
    </div>
  )
}
