import { useId, useRef, useState, type FormEvent } from 'react'
import { formatDateGmt6, formatDateTimeGmt6 } from '../../design-system/gmt6.ts'
import { ModalDialog } from '../../design-system/ModalDialog.tsx'
import { StateView, type DataViewMode } from '../../design-system/StateView.tsx'
import { StatusBadge, type BadgeTone } from '../../design-system/StatusBadge.tsx'
import type { ClinicTenant, PlanCode, TenantStatus } from '../../domain/types.ts'
import { PLAN_CATALOG } from '../../mocks/seedData.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'

type ActiveModal =
  | { type: 'create' }
  | { type: 'completeAdmin'; tenant: ClinicTenant }
  | { type: 'toggleStatus'; tenant: ClinicTenant; targetStatus: 'ACTIVA' | 'SUSPENDIDA' }
  | { type: 'plan'; tenant: ClinicTenant }
  | { type: 'history'; tenant: ClinicTenant }
  | null

function statusTone(status: TenantStatus): BadgeTone {
  switch (status) {
    case 'ACTIVA':
      return 'positive'
    case 'PENDIENTE_ADMIN':
      return 'warning'
    case 'SUSPENDIDA':
      return 'critical'
  }
}

function toSlugSuggestion(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function PlatformClinicsPage() {
  const {
    tenants,
    accounts,
    createClinic,
    completeInitialAdmin,
    toggleClinicStatus,
    updateClinicPlan,
  } = useMockStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | TenantStatus>('ALL')
  const [viewMode, setViewMode] = useState<DataViewMode>('ready')
  const [bannerMessage, setBannerMessage] = useState<{ tone: 'positive' | 'critical'; text: string } | null>(null)
  const [modal, setModal] = useState<ActiveModal>(null)

  const tableHeadingId = useId()

  // Estado del formulario de alta (CU-11)
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newPlanCode, setNewPlanCode] = useState<PlanCode>('CLINICA')
  const [newQuota, setNewQuota] = useState('8')
  const [newValidUntil, setNewValidUntil] = useState('2027-06-30')
  const [newUsesBilling, setNewUsesBilling] = useState(true)
  const [newAdminName, setNewAdminName] = useState('')
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [newAdminPassword, setNewAdminPassword] = useState('Vital2026!')
  const [simulateIdentityFailure, setSimulateIdentityFailure] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const createNameRef = useRef<HTMLInputElement>(null)

  // Estado del modal de suspensión / reactivación (CU-15)
  const [statusReason, setStatusReason] = useState('')
  const [statusError, setStatusError] = useState<string | null>(null)

  // Estado del modal de plan (CU-17)
  const [editPlanCode, setEditPlanCode] = useState<PlanCode>('CLINICA')
  const [editQuota, setEditQuota] = useState('8')
  const [editValidUntil, setEditValidUntil] = useState('2027-06-30')
  const [editUsesBilling, setEditUsesBilling] = useState(true)
  const [editSimulatedRenewal, setEditSimulatedRenewal] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)

  const activeCountsByTenant = new Map<string, number>()
  for (const account of accounts) {
    if (account.tenantId && account.active) {
      activeCountsByTenant.set(
        account.tenantId,
        (activeCountsByTenant.get(account.tenantId) ?? 0) + 1,
      )
    }
  }

  const totalActivas = tenants.filter((t) => t.status === 'ACTIVA').length
  const totalPendientes = tenants.filter((t) => t.status === 'PENDIENTE_ADMIN').length
  const totalSuspendidas = tenants.filter((t) => t.status === 'SUSPENDIDA').length

  const filteredTenants = tenants.filter((tenant) => {
    if (statusFilter !== 'ALL' && tenant.status !== statusFilter) return false
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      tenant.name.toLowerCase().includes(q) ||
      tenant.slug.toLowerCase().includes(q) ||
      tenant.initialAdminEmail.toLowerCase().includes(q)
    )
  })

  const openCreateModal = () => {
    setNewName('')
    setNewSlug('')
    setNewPlanCode('CLINICA')
    setNewQuota(String(PLAN_CATALOG.CLINICA.defaultQuota))
    setNewValidUntil('2027-06-30')
    setNewUsesBilling(true)
    setNewAdminName('')
    setNewAdminEmail('')
    setNewAdminPassword('Vital2026!')
    setSimulateIdentityFailure(false)
    setCreateError(null)
    setModal({ type: 'create' })
  }

  const openPlanModal = (tenant: ClinicTenant) => {
    setEditPlanCode(tenant.plan.code)
    setEditQuota(String(tenant.plan.maxActiveAccounts))
    setEditValidUntil(tenant.plan.validUntilGmt6)
    setEditUsesBilling(tenant.usesBilling)
    setEditSimulatedRenewal(tenant.plan.simulatedRenewalEnabled)
    setPlanError(null)
    setModal({ type: 'plan', tenant })
  }

  const handleCreateSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setCreateError(null)

    const quotaNumber = Number(newQuota)
    if (!newName.trim() || !newSlug.trim() || !newAdminName.trim() || !newAdminEmail.trim()) {
      setCreateError('Completa nombre de clínica, slug y datos del administrador inicial.')
      createNameRef.current?.focus()
      return
    }
    if (!Number.isInteger(quotaNumber) || quotaNumber < 1) {
      setCreateError('La cuota de cuentas activas debe ser un número entero igual o mayor a 1.')
      return
    }

    const decision = createClinic({
      name: newName,
      slug: newSlug,
      planCode: newPlanCode,
      maxActiveAccounts: quotaNumber,
      validUntilGmt6: newValidUntil,
      usesBilling: newUsesBilling,
      initialAdminName: newAdminName,
      initialAdminEmail: newAdminEmail,
      initialAdminPassword: newAdminPassword,
      simulateIdentityFailure,
    })

    if (!decision.allowed) {
      setCreateError(decision.message)
      return
    }

    setModal(null)
    setBannerMessage({
      tone: 'positive',
      text: simulateIdentityFailure
        ? `Clínica "${newName.trim()}" registrada en estado PENDIENTE_ADMIN para recuperación.`
        : `Clínica "${newName.trim()}" registrada y habilitada en estado ACTIVA.`,
    })
  }

  const handleCompleteAdmin = () => {
    if (modal?.type !== 'completeAdmin') return
    const decision = completeInitialAdmin(modal.tenant.id)
    if (!decision.allowed) {
      setBannerMessage({ tone: 'critical', text: decision.message })
      setModal(null)
      return
    }
    const name = modal.tenant.name
    setModal(null)
    setBannerMessage({
      tone: 'positive',
      text: `Se completó la habilitación del administrador inicial para "${name}". Estado actualizado a ACTIVA.`,
    })
  }

  const handleToggleStatusSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (modal?.type !== 'toggleStatus') return
    setStatusError(null)

    const decision = toggleClinicStatus(modal.tenant.id, modal.targetStatus, statusReason)
    if (!decision.allowed) {
      setStatusError(decision.message)
      return
    }

    const name = modal.tenant.name
    const nextStatus = modal.targetStatus
    setModal(null)
    setBannerMessage({
      tone: 'positive',
      text: `Estado de "${name}" actualizado a ${nextStatus} sin eliminar registros.`,
    })
  }

  const handlePlanSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (modal?.type !== 'plan') return
    setPlanError(null)

    const quotaNumber = Number(editQuota)
    if (!Number.isInteger(quotaNumber) || quotaNumber < 1) {
      setPlanError('La cuota máxima debe ser un número entero positivo.')
      return
    }
    if (!editValidUntil) {
      setPlanError('Selecciona una vigencia válida en GMT-6.')
      return
    }

    const decision = updateClinicPlan({
      tenantId: modal.tenant.id,
      planCode: editPlanCode,
      maxActiveAccounts: quotaNumber,
      validUntilGmt6: editValidUntil,
      usesBilling: editUsesBilling,
      simulatedRenewalEnabled: editSimulatedRenewal,
    })
    if (!decision.allowed) {
      setPlanError(decision.message)
      return
    }

    const name = modal.tenant.name
    setModal(null)
    setBannerMessage({
      tone: 'positive',
      text: `Plan, cuotas y vigencia actualizados para "${name}".`,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-divider pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-medium text-platform">CU-11 · CU-15 · CU-17</p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
            Clínicas (tenants) y planes SaaS
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Alta con aprovisionamiento de administrador inicial, suspensión sin borrado y gestión de cuotas (GMT-6).
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-platform px-4 py-2.5 text-sm font-semibold text-white hover:bg-platform-hover"
        >
          Registrar clínica
        </button>
      </div>

      <section aria-label="Resumen de clínicas por estado" className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-divider bg-surface p-4">
          <p className="text-xs font-semibold text-ink-muted">Clínicas activas</p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink">{totalActivas}</p>
        </div>
        <div className="rounded-lg border border-divider bg-surface p-4">
          <p className="text-xs font-semibold text-ink-muted">Pendiente de administrador</p>
          <p className="mt-1 font-mono text-2xl font-bold text-warning-ink">{totalPendientes}</p>
        </div>
        <div className="rounded-lg border border-divider bg-surface p-4">
          <p className="text-xs font-semibold text-ink-muted">Clínicas suspendidas</p>
          <p className="mt-1 font-mono text-2xl font-bold text-critical-ink">{totalSuspendidas}</p>
        </div>
      </section>

      {bannerMessage ? (
        <div
          role={bannerMessage.tone === 'critical' ? 'alert' : 'status'}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm font-medium ${
            bannerMessage.tone === 'critical'
              ? 'border-red-300 bg-critical-bg text-critical-ink'
              : 'border-green-300 bg-positive-bg text-positive-ink'
          }`}
        >
          <span>{bannerMessage.text}</span>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="min-h-11 rounded px-2 text-xs font-semibold underline"
          >
            Ocultar aviso
          </button>
        </div>
      ) : null}

      <section className="rounded-lg border border-divider bg-surface p-4">
        <search>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="grid gap-3 md:grid-cols-[1fr_13rem_13rem]"
          >
            <div>
              <label htmlFor="tenant-search" className="block text-xs font-semibold text-ink">
                Buscar clínica o slug
              </label>
              <input
                id="tenant-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nombre, slug o correo de administrador"
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="tenant-status-filter" className="block text-xs font-semibold text-ink">
                Estado del tenant
              </label>
              <select
                id="tenant-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | TenantStatus)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="ALL">Todos los estados</option>
                <option value="ACTIVA">ACTIVA</option>
                <option value="PENDIENTE_ADMIN">PENDIENTE_ADMIN</option>
                <option value="SUSPENDIDA">SUSPENDIDA</option>
              </select>
            </div>

            <div>
              <label htmlFor="tenant-view-mode" className="block text-xs font-semibold text-ink">
                Estado de vista (pruebas)
              </label>
              <select
                id="tenant-view-mode"
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as DataViewMode)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="ready">Datos disponibles</option>
                <option value="loading">Simular carga</option>
                <option value="error">Simular error de servicio</option>
              </select>
            </div>
          </form>
        </search>
      </section>

      {viewMode === 'loading' ? (
        <StateView
          mode="loading"
          title="Consultando registro global de clínicas..."
          message="Obteniendo metadatos de tenants y cuotas desde Platform e Identity (GMT-6)."
        />
      ) : viewMode === 'error' ? (
        <StateView
          mode="error"
          title="No fue posible consultar el servicio de Plataforma"
          message="Fallo simulado de respuesta al listar clínicas. Ningún dato clínico fue afectado."
          onRetry={() => setViewMode('ready')}
        />
      ) : filteredTenants.length === 0 ? (
        <StateView
          mode="empty"
          title="No hay clínicas que coincidan con el filtro"
          message="Ajusta los criterios de búsqueda o registra una nueva clínica."
          action={
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setStatusFilter('ALL')
              }}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-100"
            >
              Limpiar filtros
            </button>
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
              Listado de clínicas registradas en Plataforma SaaS
            </caption>
            <thead>
              <tr>
                <th scope="col">Clínica y slug</th>
                <th scope="col">Estado</th>
                <th scope="col">Admin inicial</th>
                <th scope="col">Plan, cuota y vigencia</th>
                <th scope="col">Acciones administrativas</th>
              </tr>
            </thead>
            <tbody>
              {filteredTenants.map((tenant) => {
                const activeCount = activeCountsByTenant.get(tenant.id) ?? 0
                return (
                  <tr key={tenant.id}>
                    <th scope="row" className="text-left">
                      <p className="font-semibold text-ink">{tenant.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-ink-muted">{tenant.slug}</p>
                    </th>
                    <td data-label="Estado">
                      <StatusBadge tone={statusTone(tenant.status)} label={tenant.status} />
                    </td>
                    <td data-label="Admin inicial">
                      <p className="text-sm font-medium text-ink">{tenant.initialAdminName}</p>
                      <p className="font-mono text-xs text-ink-muted">{tenant.initialAdminEmail}</p>
                    </td>
                    <td data-label="Plan, cuota y vigencia">
                      <p className="text-sm font-semibold text-ink">
                        {tenant.plan.name}{' '}
                        <span className="font-mono text-xs font-normal text-ink-muted">
                          ({activeCount}/{tenant.plan.maxActiveAccounts} activas)
                        </span>
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-ink-muted">
                        Vigencia: {formatDateGmt6(tenant.plan.validUntilGmt6)}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        Billing pacientes: {tenant.usesBilling ? 'Habilitado' : 'No aplica'}
                      </p>
                    </td>
                    <td data-label="Acciones">
                      <div className="flex flex-wrap gap-2">
                        {tenant.status === 'PENDIENTE_ADMIN' ? (
                          <button
                            type="button"
                            onClick={() => setModal({ type: 'completeAdmin', tenant })}
                            className="inline-flex min-h-11 items-center rounded-md bg-platform px-3 py-1.5 text-xs font-semibold text-white hover:bg-platform-hover"
                          >
                            Completar habilitación admin
                          </button>
                        ) : null}

                        {tenant.status === 'ACTIVA' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setStatusReason('')
                              setStatusError(null)
                              setModal({ type: 'toggleStatus', tenant, targetStatus: 'SUSPENDIDA' })
                            }}
                            className="inline-flex min-h-11 items-center rounded-md border border-red-700 bg-surface px-3 py-1.5 text-xs font-semibold text-critical-ink hover:bg-red-50"
                          >
                            Suspender
                          </button>
                        ) : null}

                        {tenant.status === 'SUSPENDIDA' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setStatusReason('')
                              setStatusError(null)
                              setModal({ type: 'toggleStatus', tenant, targetStatus: 'ACTIVA' })
                            }}
                            className="inline-flex min-h-11 items-center rounded-md bg-clinical px-3 py-1.5 text-xs font-semibold text-white hover:bg-clinical-hover"
                          >
                            Reactivar
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => openPlanModal(tenant)}
                          className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
                        >
                          Plan y cuotas
                        </button>

                        <button
                          type="button"
                          onClick={() => setModal({ type: 'history', tenant })}
                          className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
                        >
                          Historial
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal CU-11: Alta de clínica + administrador inicial */}
      <ModalDialog
        open={modal?.type === 'create'}
        title="Registrar nueva clínica (CU-11)"
        description="Crea el tenant y aprovisiona su administrador inicial sin acceso clínico para SuperAdmin."
        onClose={() => setModal(null)}
        closeOnBackdrop={false}
      >
        <form onSubmit={handleCreateSubmit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="new-clinic-name" className="block text-sm font-semibold text-ink">
                Nombre de la clínica <span aria-hidden="true">*</span>
              </label>
              <input
                ref={createNameRef}
                id="new-clinic-name"
                type="text"
                value={newName}
                onChange={(e) => {
                  const value = e.target.value
                  setNewName(value)
                  if (!newSlug || newSlug === toSlugSuggestion(newName)) {
                    setNewSlug(toSlugSuggestion(value))
                  }
                }}
                required
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Clínica San Agustín"
              />
            </div>

            <div>
              <label htmlFor="new-clinic-slug" className="block text-sm font-semibold text-ink">
                Identificador (slug) <span aria-hidden="true">*</span>
              </label>
              <input
                id="new-clinic-slug"
                type="text"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm"
                placeholder="clinica-san-agustin"
              />
            </div>
          </div>

          <fieldset className="rounded-md border border-divider p-3.5">
            <legend className="px-1 text-xs font-semibold text-ink">
              Plan SaaS y vigencia (CU-17)
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="new-plan-code" className="block text-xs font-semibold text-ink">
                  Plan
                </label>
                <select
                  id="new-plan-code"
                  value={newPlanCode}
                  onChange={(e) => {
                    const code = e.target.value as PlanCode
                    setNewPlanCode(code)
                    setNewQuota(String(PLAN_CATALOG[code].defaultQuota))
                  }}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="BASICO">Plan Básico</option>
                  <option value="CLINICA">Plan Clínica</option>
                  <option value="HOSPITAL">Plan Hospital</option>
                </select>
              </div>
              <div>
                <label htmlFor="new-plan-quota" className="block text-xs font-semibold text-ink">
                  Cuota cuentas activas
                </label>
                <input
                  id="new-plan-quota"
                  type="text"
                  inputMode="numeric"
                  value={newQuota}
                  onChange={(e) => setNewQuota(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label htmlFor="new-plan-valid" className="block text-xs font-semibold text-ink">
                  Vigencia (GMT-6)
                </label>
                <input
                  id="new-plan-valid"
                  type="date"
                  value={newValidUntil}
                  onChange={(e) => setNewValidUntil(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm"
                />
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={newUsesBilling}
                onChange={(e) => setNewUsesBilling(e.target.checked)}
              />
              <span>La clínica utilizará módulo opcional de Billing a pacientes</span>
            </label>
          </fieldset>

          <fieldset className="rounded-md border border-divider p-3.5">
            <legend className="px-1 text-xs font-semibold text-ink">
              Administrador inicial de la clínica (AdminClinica)
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="new-admin-name" className="block text-xs font-semibold text-ink">
                  Nombre completo <span aria-hidden="true">*</span>
                </label>
                <input
                  id="new-admin-name"
                  type="text"
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Lic. Sofía Navarro"
                />
              </div>
              <div>
                <label htmlFor="new-admin-email" className="block text-xs font-semibold text-ink">
                  Correo institucional <span aria-hidden="true">*</span>
                </label>
                <input
                  id="new-admin-email"
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  spellCheck={false}
                  required
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="admin@sanagustin.vital.demo"
                />
              </div>
            </div>
            <div className="mt-3">
              <label htmlFor="new-admin-pass" className="block text-xs font-semibold text-ink">
                Contraseña inicial ficticia
              </label>
              <input
                id="new-admin-pass"
                type="text"
                value={newAdminPassword}
                onChange={(e) => setNewAdminPassword(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm"
              />
            </div>

            <label className="mt-3 flex items-start gap-2.5 rounded-md border border-amber-300 bg-warning-bg p-2.5 text-xs text-warning-ink">
              <input
                type="checkbox"
                checked={simulateIdentityFailure}
                onChange={(e) => setSimulateIdentityFailure(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Simular fallo parcial en Identity (CU-11 A3): guarda la clínica en estado
                PENDIENTE_ADMIN para probar recuperación posterior.
              </span>
            </label>
          </fieldset>

          {createError ? (
            <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-sm font-medium text-critical-ink">
              {createError}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setModal(null)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-platform px-4 py-2 text-sm font-semibold text-white hover:bg-platform-hover"
            >
              Confirmar registro
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal CU-11 A3: Completar habilitación de administrador inicial */}
      <ModalDialog
        open={modal?.type === 'completeAdmin'}
        title="Completar habilitación de administrador (CU-11 A3)"
        description="Reintenta el aprovisionamiento en Identity para pasar la clínica de PENDIENTE_ADMIN a ACTIVA."
        onClose={() => setModal(null)}
      >
        {modal?.type === 'completeAdmin' ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border border-divider bg-slate-50 p-3.5">
              <p className="font-semibold text-ink">{modal.tenant.name}</p>
              <p className="font-mono text-xs text-ink-muted">{modal.tenant.slug}</p>
              <p className="mt-2 text-xs text-ink-muted">
                Administrador previsto:{' '}
                <span className="font-semibold text-ink">{modal.tenant.initialAdminName}</span> (
                <span className="font-mono">{modal.tenant.initialAdminEmail}</span>)
              </p>
            </div>
            <p className="text-ink-muted">
              Al completar este paso se creará la cuenta inicial de AdminClinica con contraseña demo{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">Vital2026!</code>{' '}
              y la clínica pasará a estado <strong>ACTIVA</strong>.
            </p>
            <div className="flex flex-wrap justify-end gap-3 border-t border-divider pt-4">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCompleteAdmin}
                className="inline-flex min-h-11 items-center rounded-md bg-platform px-4 py-2 text-sm font-semibold text-white hover:bg-platform-hover"
              >
                Reintentar y habilitar administrador
              </button>
            </div>
          </div>
        ) : null}
      </ModalDialog>

      {/* Modal CU-15: Suspender o reactivar clínica */}
      <ModalDialog
        open={modal?.type === 'toggleStatus'}
        title={
          modal?.type === 'toggleStatus' && modal.targetStatus === 'SUSPENDIDA'
            ? 'Suspender clínica (CU-15)'
            : 'Reactivar clínica (CU-15)'
        }
        description="Modifica el estado operativo sin eliminar pacientes, expedientes ni historiales."
        onClose={() => setModal(null)}
      >
        {modal?.type === 'toggleStatus' ? (
          <form onSubmit={handleToggleStatusSubmit} className="space-y-4 text-sm">
            <div className="rounded-md border border-divider bg-slate-50 p-3.5">
              <p className="font-semibold text-ink">{modal.tenant.name}</p>
              <p className="mt-1 text-xs text-ink-muted">
                Transición solicitada: <strong>{modal.tenant.status}</strong> hacia{' '}
                <strong>{modal.targetStatus}</strong>
              </p>
            </div>

            <div className="rounded-md border border-blue-300 bg-info-bg p-3 text-xs text-info-ink">
              {modal.targetStatus === 'SUSPENDIDA'
                ? 'Las cuentas de esta clínica no podrán iniciar sesión ni operar rutas protegidas mientras esté suspendida. Ningún registro clínico será eliminado.'
                : 'Al reactivar, las cuentas previamente activas recuperan su operación sujeta a sus permisos individuales (CU-10).'}
            </div>

            <div>
              <label htmlFor="status-change-reason" className="block text-sm font-semibold text-ink">
                Motivo administrativo (opcional en prototipo, recomendado)
              </label>
              <textarea
                id="status-change-reason"
                rows={3}
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Ej. Falta de renovación simulada del plan SaaS."
              />
            </div>

            {statusError ? (
              <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-sm font-medium text-critical-ink">
                {statusError}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3 border-t border-divider pt-4">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={`inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm font-semibold text-white ${
                  modal.targetStatus === 'SUSPENDIDA'
                    ? 'bg-red-700 hover:bg-red-800'
                    : 'bg-clinical hover:bg-clinical-hover'
                }`}
              >
                {modal.targetStatus === 'SUSPENDIDA' ? 'Confirmar suspensión' : 'Confirmar reactivación'}
              </button>
            </div>
          </form>
        ) : null}
      </ModalDialog>

      {/* Modal CU-17: Plan, cuotas y vigencia */}
      <ModalDialog
        open={modal?.type === 'plan'}
        title="Gestionar plan, vigencia y cuotas (CU-17)"
        description="Configuración comercial SaaS de la clínica. Independiente de Billing a pacientes y sin pasarela real."
        onClose={() => setModal(null)}
      >
        {modal?.type === 'plan' ? (
          <form onSubmit={handlePlanSubmit} className="space-y-4 text-sm">
            <div className="rounded-md border border-divider bg-slate-50 p-3">
              <p className="font-semibold text-ink">{modal.tenant.name}</p>
              <p className="font-mono text-xs text-ink-muted">
                Cuentas activas actuales: {activeCountsByTenant.get(modal.tenant.id) ?? 0}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="edit-plan-code" className="block text-sm font-semibold text-ink">
                  Plan contratado / simulado
                </label>
                <select
                  id="edit-plan-code"
                  value={editPlanCode}
                  onChange={(e) => setEditPlanCode(e.target.value as PlanCode)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="BASICO">Plan Básico</option>
                  <option value="CLINICA">Plan Clínica</option>
                  <option value="HOSPITAL">Plan Hospital</option>
                </select>
              </div>
              <div>
                <label htmlFor="edit-plan-quota" className="block text-sm font-semibold text-ink">
                  Cuota máxima de cuentas activas
                </label>
                <input
                  id="edit-plan-quota"
                  type="text"
                  inputMode="numeric"
                  value={editQuota}
                  onChange={(e) => setEditQuota(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="edit-plan-valid" className="block text-sm font-semibold text-ink">
                Vigencia del plan (GMT-6)
              </label>
              <input
                id="edit-plan-valid"
                type="date"
                value={editValidUntil}
                onChange={(e) => setEditValidUntil(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm"
              />
            </div>

            <div className="space-y-2 rounded-md border border-divider p-3">
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={editUsesBilling}
                  onChange={(e) => setEditUsesBilling(e.target.checked)}
                />
                <span>Clínica habilitada para Billing de pacientes (CU-20 a CU-23)</span>
              </label>
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={editSimulatedRenewal}
                  onChange={(e) => setEditSimulatedRenewal(e.target.checked)}
                />
                <span>Renovación simulada opcional habilitada (sin cobro SaaS real)</span>
              </label>
            </div>

            {planError ? (
              <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-sm font-medium text-critical-ink">
                {planError}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3 border-t border-divider pt-4">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-md bg-platform px-4 py-2 text-sm font-semibold text-white hover:bg-platform-hover"
              >
                Guardar condiciones
              </button>
            </div>
          </form>
        ) : null}
      </ModalDialog>

      {/* Modal historial de estados */}
      <ModalDialog
        open={modal?.type === 'history'}
        title="Bitácora de estados del tenant (GMT-6)"
        description={modal?.type === 'history' ? `${modal.tenant.name} (${modal.tenant.slug})` : undefined}
        onClose={() => setModal(null)}
      >
        {modal?.type === 'history' ? (
          <ol className="space-y-3">
            {modal.tenant.statusHistory.map((evt) => (
              <li key={evt.id} className="rounded-md border border-divider bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge tone={statusTone(evt.toStatus)} label={evt.toStatus} />
                  <span className="font-mono text-xs text-ink-muted">
                    {formatDateTimeGmt6(evt.occurredAtGmt6)}
                  </span>
                </div>
                <p className="mt-2 text-ink">{evt.reason}</p>
                <p className="mt-1 text-xs text-ink-muted">Registrado por: {evt.actorName}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </ModalDialog>
    </div>
  )
}
