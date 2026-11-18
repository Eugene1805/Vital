import { useId, useState, type FormEvent } from 'react'
import { formatDateTimeGmt6 } from '../../design-system/gmt6.ts'
import { ModalDialog } from '../../design-system/ModalDialog.tsx'
import { RxIcon } from '../../design-system/Icons.tsx'
import { StateView, type DataViewMode } from '../../design-system/StateView.tsx'
import { StatusBadge } from '../../design-system/StatusBadge.tsx'
import type { AssignableClinicRole, OrgRole, StaffAccount } from '../../domain/types.ts'
import { ROLE_LABELS, canUpdateStaffRoleAndPermissions } from '../../guards/policy.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'

type StaffModal =
  | { type: 'create' }
  | { type: 'roles'; account: StaffAccount }
  | { type: 'links'; account: StaffAccount }
  | { type: 'toggleActive'; account: StaffAccount }
  | null

export function AdminStaffPage() {
  const {
    currentUser,
    currentTenant,
    accounts,
    createStaff,
    updateStaffRoleAndPermissions,
    toggleStaffActive,
    updateAuxiliaryLinks,
  } = useMockStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'ALL' | AssignableClinicRole>('ALL')
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [viewMode, setViewMode] = useState<DataViewMode>('ready')
  const [banner, setBanner] = useState<{ tone: 'positive' | 'critical'; text: string } | null>(null)
  const [modal, setModal] = useState<StaffModal>(null)

  const tableHeadingId = useId()

  // Estado modal alta (CU-12)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [demoPassword, setDemoPassword] = useState('Vital2026!')
  const [role, setRole] = useState<AssignableClinicRole>('ESPECIALISTA')
  const [specialty, setSpecialty] = useState('Medicina General')
  const [licenseCode, setLicenseCode] = useState('')
  const [licenseTitle, setLicenseTitle] = useState('')
  const [canPrescribe, setCanPrescribe] = useState(false)
  const [canRegisterPatients, setCanRegisterPatients] = useState(true)
  const [canAssignInitialPrimary, setCanAssignInitialPrimary] = useState(false)
  const [canUploadStudies, setCanUploadStudies] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Estado modal roles y facultades (CU-14)
  const [editRole, setEditRole] = useState<AssignableClinicRole>('ESPECIALISTA')
  const [editCanPrescribe, setEditCanPrescribe] = useState(false)
  const [editCanRegisterPatients, setEditCanRegisterPatients] = useState(false)
  const [editCanAssignPrimary, setEditCanAssignPrimary] = useState(false)
  const [editCanUploadStudies, setEditCanUploadStudies] = useState(false)
  const [editLicenseCode, setEditLicenseCode] = useState('')
  const [editLicenseTitle, setEditLicenseTitle] = useState('')
  const [roleError, setRoleError] = useState<string | null>(null)
  const [escalationTestResult, setEscalationTestResult] = useState<string | null>(null)

  // Estado modal vínculos de auxiliar (CU-12)
  const [selectedSpecialistIds, setSelectedSpecialistIds] = useState<string[]>([])
  const [linksError, setLinksError] = useState<string | null>(null)

  // Estado modal desactivar / reactivar
  const [toggleError, setToggleError] = useState<string | null>(null)

  if (!currentTenant) return null

  const tenantAccounts = accounts.filter((a) => a.tenantId === currentTenant.id)
  const activeAccounts = tenantAccounts.filter((a) => a.active)
  const activeSpecialists = activeAccounts.filter((a) => a.role === 'ESPECIALISTA')
  const quotaMax = currentTenant.plan.maxActiveAccounts
  const quotaReached = activeAccounts.length >= quotaMax

  const filteredAccounts = tenantAccounts.filter((acc) => {
    if (roleFilter !== 'ALL' && acc.role !== roleFilter) return false
    if (activeFilter === 'ACTIVE' && !acc.active) return false
    if (activeFilter === 'INACTIVE' && acc.active) return false
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      acc.fullName.toLowerCase().includes(q) ||
      acc.email.toLowerCase().includes(q) ||
      (acc.specialty ?? '').toLowerCase().includes(q)
    )
  })

  const openCreateModal = () => {
    setFullName('')
    setEmail('')
    setDemoPassword('Vital2026!')
    setRole('ESPECIALISTA')
    setSpecialty('Medicina General')
    setLicenseCode('')
    setLicenseTitle('')
    setCanPrescribe(false)
    setCanRegisterPatients(true)
    setCanAssignInitialPrimary(false)
    setCanUploadStudies(false)
    setCreateError(null)
    setModal({ type: 'create' })
  }

  const openRoleModal = (account: StaffAccount) => {
    if (account.role === 'SUPER_ADMIN') return
    setEditRole(account.role)
    setEditCanPrescribe(account.permissions.canPrescribe)
    setEditCanRegisterPatients(account.permissions.canRegisterPatients)
    setEditCanAssignPrimary(account.permissions.canAssignInitialPrimary)
    setEditCanUploadStudies(account.permissions.canUploadStudies)
    setEditLicenseCode(account.professionalAttribution?.licenseCode ?? '')
    setEditLicenseTitle(account.professionalAttribution?.title ?? '')
    setRoleError(null)
    setEscalationTestResult(null)
    setModal({ type: 'roles', account })
  }

  const openLinksModal = (account: StaffAccount) => {
    setSelectedSpecialistIds(account.linkedSpecialistIds)
    setLinksError(null)
    setModal({ type: 'links', account })
  }

  const handleCreateSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setCreateError(null)

    if (!fullName.trim() || !email.trim()) {
      setCreateError('Nombre completo y correo institucional son obligatorios.')
      return
    }

    const decision = createStaff({
      fullName,
      email,
      demoPassword,
      role,
      specialty,
      licenseCode,
      title: licenseTitle,
      permissions: {
        canPrescribe,
        canRegisterPatients,
        canAssignInitialPrimary,
        canUploadStudies,
      },
    })

    if (!decision.allowed) {
      setCreateError(decision.message)
      return
    }

    setModal(null)
    setBanner({
      tone: 'positive',
      text: `Cuenta "${fullName.trim()}" registrada dentro de ${currentTenant.name}.`,
    })
  }

  const handleRoleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (modal?.type !== 'roles') return
    setRoleError(null)

    const decision = updateStaffRoleAndPermissions({
      accountId: modal.account.id,
      role: editRole,
      canPrescribe: editCanPrescribe,
      canRegisterPatients: editCanRegisterPatients,
      canAssignInitialPrimary: editCanAssignPrimary,
      canUploadStudies: editCanUploadStudies,
      licenseCode: editLicenseCode,
      title: editLicenseTitle,
    })

    if (!decision.allowed) {
      setRoleError(decision.message)
      return
    }

    const targetName = modal.account.fullName
    setModal(null)
    setBanner({
      tone: 'positive',
      text: `Rol y facultades organizacionales actualizados para ${targetName} (con auditoría GMT-6).`,
    })
  }

  const handleTestSuperAdminEscalation = () => {
    if (modal?.type !== 'roles') return
    const decision = canUpdateStaffRoleAndPermissions(
      currentUser,
      modal.account,
      'SUPER_ADMIN' as OrgRole,
      false,
      false,
    )
    if (!decision.allowed) {
      setEscalationTestResult(`Bloqueo confirmado (${decision.code}): ${decision.message}`)
    }
  }

  const handleLinksSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (modal?.type !== 'links') return
    setLinksError(null)

    const decision = updateAuxiliaryLinks(modal.account.id, selectedSpecialistIds)
    if (!decision.allowed) {
      setLinksError(decision.message)
      return
    }

    const name = modal.account.fullName
    setModal(null)
    setBanner({
      tone: 'positive',
      text: `Especialistas vinculados actualizados para ${name}.`,
    })
  }

  const handleToggleActiveConfirm = () => {
    if (modal?.type !== 'toggleActive') return
    setToggleError(null)
    const decision = toggleStaffActive(modal.account.id)
    if (!decision.allowed) {
      setToggleError(decision.message)
      return
    }
    const name = modal.account.fullName
    const wasActive = modal.account.active
    setModal(null)
    setBanner({
      tone: 'positive',
      text: wasActive
        ? `Cuenta de ${name} desactivada. Su autoría histórica y registros permanecen intactos.`
        : `Cuenta de ${name} reactivada dentro de la cuota del plan.`,
    })
  }

  const hasNewCreateAttribution = Boolean(licenseCode.trim() && licenseTitle.trim())
  const hasEffectiveEditAttribution = Boolean(
    (editLicenseCode.trim() && editLicenseTitle.trim()) ||
      (modal?.type === 'roles' && modal.account.professionalAttribution),
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-divider pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-medium text-clinical">CU-12 · CU-14 · CU-17</p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
            Personal, roles y vínculos auxiliares
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Cuentas independientes de {currentTenant.name}. AdminClinica solo concede perfiles predefinidos dentro de su autoridad.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-clinical px-4 py-2.5 text-sm font-semibold text-white hover:bg-clinical-hover"
        >
          Agregar integrante
        </button>
      </div>

      {/* Cuota del plan (CU-17 A2) */}
      <section
        aria-label="Ocupación de cuota del plan"
        className={`rounded-lg border p-4 ${
          quotaReached ? 'border-amber-300 bg-warning-bg' : 'border-divider bg-surface'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-ink">
              Ocupación de cuentas activas: {activeAccounts.length} de {quotaMax} (
              {currentTenant.plan.name})
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {quotaReached
                ? 'Cuota alcanzada (CU-17 A2): desactiva una cuenta o solicita ampliación a SuperAdmin. No existen cargos automáticos por sobrecupo.'
                : 'Las cuentas desactivadas conservan su autoría clínica histórica y liberan cupo para nuevas altas.'}
            </p>
          </div>
          <StatusBadge
            tone={quotaReached ? 'warning' : 'positive'}
            label={quotaReached ? 'Cuota completa' : `${quotaMax - activeAccounts.length} disponibles`}
          />
        </div>
      </section>

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
        <search>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="grid gap-3 md:grid-cols-[1fr_12rem_11rem_12rem]"
          >
            <div>
              <label htmlFor="staff-search" className="block text-xs font-semibold text-ink">
                Buscar integrante
              </label>
              <input
                id="staff-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nombre, correo o especialidad"
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="staff-role-filter" className="block text-xs font-semibold text-ink">
                Rol predefinido
              </label>
              <select
                id="staff-role-filter"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as 'ALL' | AssignableClinicRole)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="ALL">Todos los roles</option>
                <option value="ADMIN_CLINICA">AdminClinica</option>
                <option value="ESPECIALISTA">Especialista</option>
                <option value="AUXILIAR">Auxiliar</option>
              </select>
            </div>

            <div>
              <label htmlFor="staff-active-filter" className="block text-xs font-semibold text-ink">
                Estado de cuenta
              </label>
              <select
                id="staff-active-filter"
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="ALL">Todas</option>
                <option value="ACTIVE">Activas</option>
                <option value="INACTIVE">Desactivadas</option>
              </select>
            </div>

            <div>
              <label htmlFor="staff-view-mode" className="block text-xs font-semibold text-ink">
                Estado de vista
              </label>
              <select
                id="staff-view-mode"
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
          title="Cargando personal de la clínica..."
          message="Consultando cuentas, roles predefinidos y vínculos organizativos vigentes."
        />
      ) : viewMode === 'error' ? (
        <StateView
          mode="error"
          title="Error al consultar el directorio de personal"
          message="Fallo simulado de comunicación con Identity dentro del tenant."
          onRetry={() => setViewMode('ready')}
        />
      ) : filteredAccounts.length === 0 ? (
        <StateView
          mode="empty"
          title="Sin cuentas que coincidan con los filtros"
          message="Modifica la búsqueda o registra un nuevo integrante dentro del cupo disponible."
          action={
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setRoleFilter('ALL')
                setActiveFilter('ALL')
              }}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-100"
            >
              Restablecer filtros
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
              Personal y cuentas de {currentTenant.name}
            </caption>
            <thead>
              <tr>
                <th scope="col">Integrante</th>
                <th scope="col">Rol y especialidad</th>
                <th scope="col">Estado</th>
                <th scope="col">Atribución y vínculos</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((acc) => {
                const linkedNames = acc.linkedSpecialistIds
                  .map((id) => tenantAccounts.find((s) => s.id === id)?.fullName)
                  .filter(Boolean)

                return (
                  <tr key={acc.id}>
                    <th scope="row" className="text-left">
                      <p className="font-semibold text-ink">{acc.fullName}</p>
                      <p className="mt-0.5 font-mono text-xs text-ink-muted">{acc.email}</p>
                    </th>
                    <td data-label="Rol y especialidad">
                      <p className="text-sm font-semibold text-ink">{ROLE_LABELS[acc.role]}</p>
                      {acc.specialty ? (
                        <p className="mt-0.5 text-xs text-ink-muted">
                          Especialidad: {acc.specialty}
                        </p>
                      ) : null}
                    </td>
                    <td data-label="Estado">
                      <StatusBadge
                        tone={acc.active ? 'positive' : 'neutral'}
                        label={acc.active ? 'Activa' : 'Desactivada'}
                      />
                    </td>
                    <td data-label="Atribución y vínculos">
                      {acc.role === 'ESPECIALISTA' ? (
                        <div className="space-y-1 text-xs">
                          <p className="font-mono text-ink">
                            {acc.professionalAttribution
                              ? `${acc.professionalAttribution.licenseCode} (${acc.professionalAttribution.title})`
                              : 'Sin atribución profesional registrada'}
                          </p>
                          <StatusBadge
                            tone={acc.permissions.canPrescribe ? 'info' : 'neutral'}
                            icon={<RxIcon className="h-3.5 w-3.5 shrink-0" />}
                            label={
                              acc.permissions.canPrescribe
                                ? 'Prescripción habilitada'
                                : 'Sin permiso de prescripción'
                            }
                          />
                        </div>
                      ) : acc.role === 'AUXILIAR' ? (
                        <div className="space-y-1 text-xs">
                          <p className="font-semibold text-ink">
                            Especialistas vinculados ({linkedNames.length}):
                          </p>
                          <p className="text-ink-muted">
                            {linkedNames.length > 0
                              ? linkedNames.join(', ')
                              : 'Ninguno asignado (sin ámbito ordinario)'}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-ink-muted">
                          Administración operativa del tenant
                        </p>
                      )}
                    </td>
                    <td data-label="Acciones">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openRoleModal(acc)}
                          className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
                        >
                          Rol y facultades
                        </button>
                        {acc.role === 'AUXILIAR' ? (
                          <button
                            type="button"
                            onClick={() => openLinksModal(acc)}
                            className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
                          >
                            Especialistas vinculados
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setToggleError(null)
                            setModal({ type: 'toggleActive', account: acc })
                          }}
                          className={`inline-flex min-h-11 items-center rounded-md border px-3 py-1.5 text-xs font-semibold ${
                            acc.active
                              ? 'border-red-700 bg-surface text-critical-ink hover:bg-red-50'
                              : 'border-teal-700 bg-surface text-clinical hover:bg-teal-50'
                          }`}
                        >
                          {acc.active ? 'Desactivar' : 'Reactivar'}
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

      {/* Modal CU-12: Alta de personal */}
      <ModalDialog
        open={modal?.type === 'create'}
        title="Agregar integrante al personal (CU-12)"
        description={`Cuenta exclusiva para ${currentTenant.name}, sin identidad global compartida.`}
        onClose={() => setModal(null)}
        closeOnBackdrop={false}
      >
        <form onSubmit={handleCreateSubmit} noValidate className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="staff-fullname" className="block font-semibold text-ink">
                Nombre completo <span aria-hidden="true">*</span>
              </label>
              <input
                id="staff-fullname"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="mt-1 w-full rounded-md border px-3 py-2"
                placeholder="Dr. Alejandro Ruiz"
              />
            </div>
            <div>
              <label htmlFor="staff-email" className="block font-semibold text-ink">
                Correo institucional <span aria-hidden="true">*</span>
              </label>
              <input
                id="staff-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                spellCheck={false}
                required
                className="mt-1 w-full rounded-md border px-3 py-2"
                placeholder="alejandro.ruiz@norte.vital.demo"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="staff-role" className="block font-semibold text-ink">
                Rol predefinido (catálogo cerrado)
              </label>
              <select
                id="staff-role"
                value={role}
                onChange={(e) => {
                  const next = e.target.value as AssignableClinicRole
                  setRole(next)
                  if (next !== 'ESPECIALISTA') setCanPrescribe(false)
                }}
                className="mt-1 w-full rounded-md border px-3 py-2"
              >
                <option value="ESPECIALISTA">Especialista</option>
                <option value="AUXILIAR">Secretaría / Enfermería (Auxiliar)</option>
                <option value="ADMIN_CLINICA">AdminClinica</option>
              </select>
              <p className="mt-1 text-xs text-ink-muted">
                SuperAdmin no forma parte de los roles asignables por la clínica (CU-14).
              </p>
            </div>
            <div>
              <label htmlFor="staff-pass" className="block font-semibold text-ink">
                Contraseña demo
              </label>
              <input
                id="staff-pass"
                type="text"
                value={demoPassword}
                onChange={(e) => setDemoPassword(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
              />
            </div>
          </div>

          {role === 'ESPECIALISTA' ? (
            <fieldset className="space-y-3 rounded-md border border-divider p-3.5">
              <legend className="px-1 text-xs font-semibold text-ink">
                Especialidad y atribución profesional ficticia
              </legend>
              <div>
                <label htmlFor="staff-specialty" className="block text-xs font-semibold text-ink">
                  Especialidad (agrupación de vistas)
                </label>
                <input
                  id="staff-specialty"
                  type="text"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="staff-license" className="block text-xs font-semibold text-ink">
                    Cédula / atribución ficticia
                  </label>
                  <input
                    id="staff-license"
                    type="text"
                    value={licenseCode}
                    onChange={(e) => {
                      const val = e.target.value
                      setLicenseCode(val)
                      if (!val.trim()) setCanPrescribe(false)
                    }}
                    className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
                    placeholder="CED-FICT-8840"
                  />
                </div>
                <div>
                  <label htmlFor="staff-title" className="block text-xs font-semibold text-ink">
                    Título o respaldo registrado
                  </label>
                  <input
                    id="staff-title"
                    type="text"
                    value={licenseTitle}
                    onChange={(e) => {
                      const val = e.target.value
                      setLicenseTitle(val)
                      if (!val.trim()) setCanPrescribe(false)
                    }}
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    placeholder="Médico Cirujano"
                  />
                </div>
              </div>
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={canPrescribe}
                  disabled={!hasNewCreateAttribution}
                  onChange={(e) => setCanPrescribe(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Habilitar emisión de prescripciones farmacológicas (CU-07).{' '}
                  <span className="text-xs text-ink-muted">
                    {hasNewCreateAttribution
                      ? 'Comprobación administrativa ficticia lista.'
                      : 'Bloqueado hasta capturar cédula y título ficticios.'}
                  </span>
                </span>
              </label>
            </fieldset>
          ) : null}

          <fieldset className="space-y-2 rounded-md border border-divider p-3.5">
            <legend className="px-1 text-xs font-semibold text-ink">
              Facultades administrativas operativas (no otorgan lectura clínica general)
            </legend>
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={canRegisterPatients}
                onChange={(e) => setCanRegisterPatients(e.target.checked)}
              />
              <span>Registrar pacientes de la clínica (CU-01)</span>
            </label>
            {role === 'ADMIN_CLINICA' || role === 'AUXILIAR' ? (
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={canAssignInitialPrimary}
                  onChange={(e) => setCanAssignInitialPrimary(e.target.checked)}
                />
                <span>Asignar responsable principal inicial en alta (CU-02)</span>
              </label>
            ) : null}
            {role === 'AUXILIAR' ? (
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={canUploadStudies}
                  onChange={(e) => setCanUploadStudies(e.target.checked)}
                />
                <span>Cargar estudios PDF dentro de ámbito autorizado (CU-04)</span>
              </label>
            ) : null}
          </fieldset>

          {createError ? (
            <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 font-medium text-critical-ink">
              {createError}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setModal(null)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
            >
              Crear cuenta
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal CU-14: Rol y facultades organizacionales */}
      <ModalDialog
        open={modal?.type === 'roles'}
        title="Rol y facultades organizacionales (CU-14)"
        description={modal?.type === 'roles' ? modal.account.fullName : undefined}
        onClose={() => setModal(null)}
      >
        {modal?.type === 'roles' ? (
          <form onSubmit={handleRoleSubmit} className="space-y-4 text-sm">
            <div className="rounded-md border border-blue-300 bg-info-bg p-3 text-xs text-info-ink">
              <strong>Separación de autoridad (CU-14):</strong> AdminClinica puede conceder
              facultades médicas administrativas aunque no ejerza medicina personalmente, pero nunca
              puede conceder el rol SuperAdmin ni otorgar acceso clínico por paciente (CU-10).
            </div>

            <div>
              <label htmlFor="edit-staff-role" className="block font-semibold text-ink">
                Perfil organizacional predefinido
              </label>
              <select
                id="edit-staff-role"
                value={editRole}
                onChange={(e) => {
                  const next = e.target.value as AssignableClinicRole
                  setEditRole(next)
                  if (next !== 'ESPECIALISTA') setEditCanPrescribe(false)
                }}
                className="mt-1 w-full rounded-md border px-3 py-2"
              >
                <option value="ADMIN_CLINICA">AdminClinica</option>
                <option value="ESPECIALISTA">Especialista</option>
                <option value="AUXILIAR">Secretaría / Enfermería (Auxiliar)</option>
              </select>
            </div>

            {editRole === 'ESPECIALISTA' ? (
              <fieldset className="space-y-3 rounded-md border border-divider p-3.5">
                <legend className="px-1 text-xs font-semibold text-ink">
                  Atribución profesional y habilitación de prescripción
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="edit-license-code" className="block text-xs font-semibold text-ink">
                      Cédula / atribución ficticia
                    </label>
                    <input
                      id="edit-license-code"
                      type="text"
                      value={editLicenseCode}
                      onChange={(e) => setEditLicenseCode(e.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-license-title" className="block text-xs font-semibold text-ink">
                      Título registrado
                    </label>
                    <input
                      id="edit-license-title"
                      type="text"
                      value={editLicenseTitle}
                      onChange={(e) => setEditLicenseTitle(e.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2"
                    />
                  </div>
                </div>

                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={editCanPrescribe}
                    disabled={!hasEffectiveEditAttribution}
                    onChange={(e) => setEditCanPrescribe(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Habilitar emisión de prescripciones (CU-07).{' '}
                    <span className="text-xs text-ink-muted">
                      {hasEffectiveEditAttribution
                        ? 'Atribución verificada administrativamente (sin certificación legal).'
                        : 'Requiere registrar cédula y título ficticios antes de habilitar.'}
                    </span>
                  </span>
                </label>
              </fieldset>
            ) : null}

            <fieldset className="space-y-2 rounded-md border border-divider p-3.5">
              <legend className="px-1 text-xs font-semibold text-ink">
                Facultades administrativas en la clínica
              </legend>
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={editCanRegisterPatients}
                  onChange={(e) => setEditCanRegisterPatients(e.target.checked)}
                />
                <span>Registrar pacientes (CU-01)</span>
              </label>
              {editRole === 'ADMIN_CLINICA' || editRole === 'AUXILIAR' ? (
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={editCanAssignPrimary}
                    onChange={(e) => setEditCanAssignPrimary(e.target.checked)}
                  />
                  <span>Establecer responsable principal inicial (CU-02)</span>
                </label>
              ) : null}
              {editRole === 'AUXILIAR' ? (
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={editCanUploadStudies}
                    onChange={(e) => setEditCanUploadStudies(e.target.checked)}
                  />
                  <span>Cargar estudios PDF autorizados (CU-04)</span>
                </label>
              ) : null}
            </fieldset>

            <div className="rounded-md border border-slate-300 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink">
                  Verificación de límite de delegación (CU-14 A1)
                </span>
                <button
                  type="button"
                  onClick={handleTestSuperAdminEscalation}
                  className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
                >
                  Probar asignar SuperAdmin
                </button>
              </div>
              {escalationTestResult ? (
                <p role="status" className="mt-2 text-xs font-medium text-critical-ink">
                  {escalationTestResult}
                </p>
              ) : null}
            </div>

            {modal.account.roleAuditLog.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-ink">Auditoría reciente de cambios (GMT-6)</p>
                <ul className="mt-1.5 space-y-1.5">
                  {modal.account.roleAuditLog.slice(0, 3).map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-ink-muted"
                    >
                      <span className="font-mono">{formatDateTimeGmt6(entry.occurredAtGmt6)}</span>{' '}
                      {entry.previousRole} a {entry.nextRole}. {entry.note}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {roleError ? (
              <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 font-medium text-critical-ink">
                {roleError}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3 border-t border-divider pt-4">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
              >
                Aplicar cambios con auditoría
              </button>
            </div>
          </form>
        ) : null}
      </ModalDialog>

      {/* Modal CU-12: Especialistas vinculados al auxiliar */}
      <ModalDialog
        open={modal?.type === 'links'}
        title="Especialistas vinculados al auxiliar (CU-12)"
        description={modal?.type === 'links' ? modal.account.fullName : undefined}
        onClose={() => setModal(null)}
      >
        {modal?.type === 'links' ? (
          <form onSubmit={handleLinksSubmit} className="space-y-4 text-sm">
            <p className="text-ink-muted">
              Un paciente entra al ámbito ordinario de este auxiliar únicamente si alguno de los
              especialistas aquí vinculados figura como responsable principal o tratante vigente del
              paciente (CU-10).
            </p>

            {activeSpecialists.length === 0 ? (
              <p className="rounded-md border border-divider bg-slate-50 p-3 text-ink-muted">
                No hay especialistas activos en la clínica para vincular.
              </p>
            ) : (
              <fieldset className="space-y-2 rounded-md border border-divider p-3.5">
                <legend className="px-1 text-xs font-semibold text-ink">
                  Especialistas activos de {currentTenant.name}
                </legend>
                {activeSpecialists.map((spec) => {
                  const checked = selectedSpecialistIds.includes(spec.id)
                  return (
                    <label key={spec.id} className="flex items-start gap-2.5 py-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSpecialistIds((prev) => [...prev, spec.id])
                          } else {
                            setSelectedSpecialistIds((prev) => prev.filter((id) => id !== spec.id))
                          }
                        }}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-semibold text-ink">{spec.fullName}</span>{' '}
                        <span className="text-xs text-ink-muted">
                          ({spec.specialty ?? 'General'})
                        </span>
                      </span>
                    </label>
                  )
                })}
              </fieldset>
            )}

            {linksError ? (
              <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 font-medium text-critical-ink">
                {linksError}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3 border-t border-divider pt-4">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
              >
                Guardar vínculos
              </button>
            </div>
          </form>
        ) : null}
      </ModalDialog>

      {/* Modal CU-12 A2: Desactivar o reactivar cuenta */}
      <ModalDialog
        open={modal?.type === 'toggleActive'}
        title={
          modal?.type === 'toggleActive' && modal.account.active
            ? 'Desactivar cuenta de personal (CU-12)'
            : 'Reactivar cuenta de personal (CU-12)'
        }
        onClose={() => setModal(null)}
      >
        {modal?.type === 'toggleActive' ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border border-divider bg-slate-50 p-3.5">
              <p className="font-semibold text-ink">{modal.account.fullName}</p>
              <p className="font-mono text-xs text-ink-muted">{modal.account.email}</p>
            </div>
            <p className="text-ink-muted">
              {modal.account.active
                ? 'La desactivación revoca el inicio de sesión y libera un cupo del plan, pero conserva intactos expedientes, notas cerradas, recetas y autoría histórica. Los borradores abiertos de un especialista desactivado permanecen en espera de política excepcional [PENDIENTE DETALLE].'
                : 'Al reactivar la cuenta se consumirá un lugar de la cuota del plan vigente.'}
            </p>
            {toggleError ? (
              <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 font-medium text-critical-ink">
                {toggleError}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-3 border-t border-divider pt-4">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleToggleActiveConfirm}
                className={`inline-flex min-h-11 items-center rounded-md px-4 py-2 font-semibold text-white ${
                  modal.account.active
                    ? 'bg-red-700 hover:bg-red-800'
                    : 'bg-clinical hover:bg-clinical-hover'
                }`}
              >
                {modal.account.active ? 'Confirmar desactivación' : 'Confirmar reactivación'}
              </button>
            </div>
          </div>
        ) : null}
      </ModalDialog>
    </div>
  )
}
