import { formatDateTimeGmt6 } from '../../design-system/gmt6.ts'
import { RxIcon } from '../../design-system/Icons.tsx'
import { StatusBadge } from '../../design-system/StatusBadge.tsx'
import { useMockStore } from '../../mocks/useMockStore.ts'

export function ClinicalWorkspacePage() {
  const { currentUser, currentTenant, accounts } = useMockStore()
  if (!currentUser || !currentTenant) return null

  const linkedAuxiliaries = accounts.filter(
    (a) =>
      a.tenantId === currentTenant.id &&
      a.role === 'AUXILIAR' &&
      a.active &&
      a.linkedSpecialistIds.includes(currentUser.id),
  )

  return (
    <div className="space-y-6">
      <div className="border-b border-divider pb-5">
        <p className="font-mono text-xs font-medium text-clinical">CU-10 · CU-13 · CU-14</p>
        <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
          Espacio clínico del especialista
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Sesión profesional de {currentUser.fullName} en {currentTenant.name} (ruta aislada de la vista administrativa).
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-divider bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-ink">Habilitación profesional y prescripción</h2>
            <StatusBadge
              tone={currentUser.permissions.canPrescribe ? 'positive' : 'warning'}
              icon={<RxIcon className="h-3.5 w-3.5 shrink-0" />}
              label={
                currentUser.permissions.canPrescribe
                  ? 'Emisión de recetas habilitada'
                  : 'Emisión de recetas bloqueada'
              }
            />
          </div>

          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-ink-muted">Especialidad</dt>
              <dd className="font-semibold text-ink">{currentUser.specialty ?? 'General'}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-ink-muted">Cédula / atribución ficticia</dt>
              <dd className="font-mono font-semibold text-ink">
                {currentUser.professionalAttribution?.licenseCode ?? 'No registrada'}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-ink-muted">Título registrado</dt>
              <dd className="text-right font-medium text-ink">
                {currentUser.professionalAttribution?.title ?? 'Sin registro'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Registro administrativo de pacientes (CU-01)</dt>
              <dd className="font-semibold text-ink">
                {currentUser.permissions.canRegisterPatients
                  ? 'Autorizado (sin acceso clínico automático)'
                  : 'No habilitado'}
              </dd>
            </div>
          </dl>

          {!currentUser.permissions.canPrescribe ? (
            <p className="mt-4 rounded-md border border-amber-300 bg-warning-bg p-3 text-xs text-warning-ink">
              Para emitir recetas (CU-07), AdminClinica debe registrar tu atribución profesional
              ficticia y activar la facultad en Personal y roles (CU-14).
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-divider bg-surface p-5">
          <h2 className="text-lg font-bold text-ink">
            Personal auxiliar vinculado ({linkedAuxiliaries.length})
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Auxiliares que comparten ámbito ordinario sobre tus pacientes vigentes (sin lectura clínica general).
          </p>
          {linkedAuxiliaries.length === 0 ? (
            <p className="mt-4 rounded-md border border-divider bg-slate-50 p-3 text-sm text-ink-muted">
              No hay personal auxiliar vinculado a tu cuenta actualmente.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {linkedAuxiliaries.map((aux) => (
                <li
                  key={aux.id}
                  className="rounded-md border border-divider bg-slate-50 px-3 py-2 text-sm"
                >
                  <p className="font-semibold text-ink">{aux.fullName}</p>
                  <p className="font-mono text-xs text-ink-muted">{aux.email}</p>
                </li>
              ))}
            </ul>
          )}

          {currentUser.roleAuditLog.length > 0 ? (
            <div className="mt-4 border-t border-divider pt-3">
              <p className="text-xs font-semibold text-ink">Último cambio de rol/facultad</p>
              <p className="mt-1 font-mono text-xs text-ink-muted">
                {formatDateTimeGmt6(currentUser.roleAuditLog[0].occurredAtGmt6)}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">{currentUser.roleAuditLog[0].note}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-teal-300 bg-teal-50 p-4 text-sm text-teal-950">
        <strong>Base lista para Oleadas 2 y 3:</strong> en las siguientes oleadas se conectará aquí
        el listado de expedientes con vínculo vigente (CU-10 gRPC), la atención clínica con notas
        abiertas/cerradas (CU-03), estudios PDF (CU-04), receta farmacológica (CU-07) y cortes (CU-23).
      </section>
    </div>
  )
}
