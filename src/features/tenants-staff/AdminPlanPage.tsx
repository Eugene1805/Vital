import { formatDateGmt6 } from '../../design-system/gmt6.ts'
import { StatusBadge } from '../../design-system/StatusBadge.tsx'
import { useMockStore } from '../../mocks/useMockStore.ts'

export function AdminPlanPage() {
  const { currentTenant, accounts } = useMockStore()
  if (!currentTenant) return null

  const activeAccounts = accounts.filter(
    (a) => a.tenantId === currentTenant.id && a.active,
  ).length

  return (
    <div className="space-y-6">
      <div className="border-b border-divider pb-5">
        <p className="font-mono text-xs font-medium text-clinical">CU-17 (Solo lectura en clínica)</p>
        <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">Plan, vigencia y cuotas</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Condiciones comerciales SaaS de {currentTenant.name}. AdminClinica puede consultarlas, pero solo SuperAdmin puede modificarlas.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-divider bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-ink">{currentTenant.plan.name}</h2>
            <StatusBadge tone="positive" label={currentTenant.status} />
          </div>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-ink-muted">Código de plan</dt>
              <dd className="font-mono font-semibold text-ink">{currentTenant.plan.code}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-ink-muted">Ocupación de cuentas activas</dt>
              <dd className="font-mono font-semibold text-ink">
                {activeAccounts} / {currentTenant.plan.maxActiveAccounts}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-ink-muted">Vigencia del plan</dt>
              <dd className="font-mono font-semibold text-ink">
                {formatDateGmt6(currentTenant.plan.validUntilGmt6)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Renovación simulada</dt>
              <dd className="font-semibold text-ink">
                {currentTenant.plan.simulatedRenewalEnabled ? 'Habilitada (simulación)' : 'Desactivada'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-divider bg-surface p-5">
          <h2 className="text-lg font-bold text-ink">Alcance operativo del tenant</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-muted">
            <li>
              <strong className="text-ink">Billing a pacientes:</strong>{' '}
              {currentTenant.usesBilling
                ? 'Habilitado (ciclo independiente en Oleada 4, sin relación con cobros SaaS).'
                : 'No aplica en esta clínica (indicadores económicos mostrarán No aplica).'}
            </li>
            <li>
              <strong className="text-ink">Límite de modificación:</strong> cualquier ampliación de
              cuotas o cambio de plan requiere solicitud a SuperAdmin de Plataforma.
            </li>
            <li>
              <strong className="text-ink">Separación clínica:</strong> este panel comercial no
              expone datos de pacientes ni expedientes.
            </li>
          </ul>
        </div>
      </section>
    </div>
  )
}
