import type {
  ClinicTenant,
  OrgRole,
  PolicyDecision,
  RouteScope,
  StaffAccount,
  TenantStatus,
} from '../domain/types.ts'

function allow(): PolicyDecision {
  return { allowed: true }
}

function deny(code: string, message: string): PolicyDecision {
  return { allowed: false, code, message }
}

export const ROLE_LABELS: Record<OrgRole, string> = {
  SUPER_ADMIN: 'SuperAdmin de plataforma',
  ADMIN_CLINICA: 'AdminClinica',
  ESPECIALISTA: 'Especialista',
  AUXILIAR: 'Secretaría / Enfermería (Auxiliar)',
}

export const TENANT_STATUS_LABELS: Record<TenantStatus, string> = {
  PENDIENTE_ADMIN: 'PENDIENTE_ADMIN',
  ACTIVA: 'ACTIVA',
  SUSPENDIDA: 'SUSPENDIDA',
}

/** CU-13: Comprueba contexto de tenant, estado operativo de la clínica y vigencia de la cuenta. */
export function canAuthenticate(
  account: StaffAccount | undefined,
  tenant: ClinicTenant | undefined,
  expectedScope: 'PLATFORM' | 'CLINIC',
): PolicyDecision {
  if (!account) {
    return deny('INVALID_CREDENTIALS', 'Credenciales inválidas para el contexto seleccionado.')
  }

  if (expectedScope === 'PLATFORM') {
    if (account.role !== 'SUPER_ADMIN' || account.tenantId !== null) {
      return deny('INVALID_CREDENTIALS', 'Credenciales inválidas para el acceso de plataforma.')
    }
    if (!account.active) {
      return deny('ACCOUNT_DISABLED', 'La cuenta de plataforma está desactivada.')
    }
    return allow()
  }

  if (!tenant) {
    return deny('TENANT_NOT_FOUND', 'No se encontró una clínica con ese identificador.')
  }

  if (account.role === 'SUPER_ADMIN' || account.tenantId !== tenant.id) {
    return deny(
      'TENANT_MISMATCH',
      'Credenciales inválidas para esta clínica. Las cuentas son independientes por clínica.',
    )
  }

  if (tenant.status === 'PENDIENTE_ADMIN') {
    return deny(
      'TENANT_PENDING_ADMIN',
      'La clínica está en estado PENDIENTE_ADMIN hasta completar la habilitación de su administrador inicial.',
    )
  }

  if (tenant.status === 'SUSPENDIDA') {
    return deny(
      'TENANT_SUSPENDED',
      'La clínica está SUSPENDIDA. Los registros históricos permanecen conservados, pero la operación está detenida.',
    )
  }

  if (!account.active) {
    return deny(
      'ACCOUNT_DISABLED',
      'Esta cuenta fue desactivada. Su autoría histórica permanece intacta.',
    )
  }

  return allow()
}

/** CU-11: Solo SuperAdmin puede registrar clínicas y no se permiten slugs duplicados. */
export function canCreateClinic(
  actor: StaffAccount | null,
  existingTenants: ClinicTenant[],
  slug: string,
): PolicyDecision {
  if (!actor || !actor.active || actor.role !== 'SUPER_ADMIN') {
    return deny('FORBIDDEN_PLATFORM_ONLY', 'Solo SuperAdmin puede registrar nuevas clínicas.')
  }
  const normalized = slug.trim().toLowerCase()
  if (!normalized) {
    return deny('INVALID_SLUG', 'El identificador (slug) de la clínica es obligatorio.')
  }
  const duplicated = existingTenants.some((t) => t.slug.toLowerCase() === normalized)
  if (duplicated) {
    return deny('DUPLICATE_CLINIC', `Ya existe una clínica registrada con el identificador "${normalized}".`)
  }
  return allow()
}

/** CU-11 A3: Reintentar habilitación del administrador inicial solo aplica en estado PENDIENTE_ADMIN. */
export function canCompleteInitialAdmin(
  actor: StaffAccount | null,
  tenant: ClinicTenant | undefined,
): PolicyDecision {
  if (!actor || !actor.active || actor.role !== 'SUPER_ADMIN') {
    return deny('FORBIDDEN_PLATFORM_ONLY', 'Solo SuperAdmin puede completar la habilitación inicial.')
  }
  if (!tenant) {
    return deny('TENANT_NOT_FOUND', 'La clínica indicada no existe.')
  }
  if (tenant.status !== 'PENDIENTE_ADMIN') {
    return deny(
      'INVALID_STATE',
      `Solo las clínicas en estado PENDIENTE_ADMIN permiten completar su habilitación inicial (estado actual: ${tenant.status}).`,
    )
  }
  return allow()
}

/** CU-15: Solo SuperAdmin cambia entre ACTIVA y SUSPENDIDA; bloquea cambios desde PENDIENTE_ADMIN o redundantes. */
export function canChangeClinicStatus(
  actor: StaffAccount | null,
  tenant: ClinicTenant | undefined,
  targetStatus: 'ACTIVA' | 'SUSPENDIDA',
): PolicyDecision {
  if (!actor || !actor.active || actor.role !== 'SUPER_ADMIN') {
    return deny('FORBIDDEN_PLATFORM_ONLY', 'Solo SuperAdmin puede suspender o reactivar clínicas.')
  }
  if (!tenant) {
    return deny('TENANT_NOT_FOUND', 'La clínica indicada no existe.')
  }
  if (tenant.status === 'PENDIENTE_ADMIN') {
    return deny(
      'INVALID_STATE_PENDING_ADMIN',
      'Una clínica en PENDIENTE_ADMIN no puede suspenderse ni reactivarse; primero debe completarse la habilitación de su administrador inicial.',
    )
  }
  if (tenant.status === targetStatus) {
    return deny('REDUNDANT_STATE', `La clínica ya se encuentra en estado ${targetStatus}.`)
  }
  return allow()
}

/** CU-17: Solo SuperAdmin modifica plan, vigencia y cuotas; AdminClinica solo puede consultar su propio tenant. */
export function canManageTenantPlan(
  actor: StaffAccount | null,
  tenant: ClinicTenant | undefined,
  action: 'READ' | 'WRITE',
): PolicyDecision {
  if (!actor || !actor.active) {
    return deny('UNAUTHORIZED', 'Sesión inactiva o no autorizada.')
  }
  if (!tenant) {
    return deny('TENANT_NOT_FOUND', 'La clínica indicada no existe.')
  }
  if (action === 'WRITE') {
    if (actor.role !== 'SUPER_ADMIN') {
      return deny(
        'FORBIDDEN_PLAN_WRITE',
        'Solo SuperAdmin puede modificar el plan, vigencia o cuotas globales de la clínica.',
      )
    }
    return allow()
  }
  if (actor.role === 'SUPER_ADMIN') {
    return allow()
  }
  if (actor.role === 'ADMIN_CLINICA' && actor.tenantId === tenant.id) {
    return allow()
  }
  return deny('FORBIDDEN_PLAN_READ', 'No tienes permiso para consultar el plan de esta clínica.')
}

/** CU-12, CU-14 y CU-17 A2: Valida alta de personal dentro del tenant, cuota y límites de delegación. */
export function canCreateStaff(
  actor: StaffAccount | null,
  tenant: ClinicTenant | undefined,
  activeAccountsInTenant: number,
  requestedRole: OrgRole,
  hasAttribution: boolean,
  requestedCanPrescribe: boolean,
): PolicyDecision {
  if (!actor || !actor.active || actor.role !== 'ADMIN_CLINICA' || !tenant || actor.tenantId !== tenant.id) {
    return deny('FORBIDDEN_ADMIN_CLINICA', 'Solo un AdminClinica activo de este tenant puede registrar personal.')
  }
  if (tenant.status !== 'ACTIVA') {
    return deny('TENANT_NOT_ACTIVE', 'No se puede registrar personal mientras la clínica no esté ACTIVA.')
  }
  if (requestedRole === 'SUPER_ADMIN') {
    return deny(
      'PRIVILEGE_ESCALATION_BLOCKED',
      'AdminClinica no puede asignar el rol SuperAdmin ni privilegios superiores a su autoridad (CU-14).',
    )
  }
  if (activeAccountsInTenant >= tenant.plan.maxActiveAccounts) {
    return deny(
      'QUOTA_REACHED',
      `Cuota del plan alcanzada (${activeAccountsInTenant}/${tenant.plan.maxActiveAccounts} cuentas activas). Solicita ajuste de plan a SuperAdmin.`,
    )
  }
  if (requestedCanPrescribe && (requestedRole !== 'ESPECIALISTA' || !hasAttribution)) {
    return deny(
      'ATTRIBUTION_REQUIRED',
      'Solo se puede habilitar la emisión de prescripciones a un Especialista con atribución profesional registrada (CU-14).',
    )
  }
  return allow()
}

/** CU-14: Modificación de rol predefinido y habilitación de prescripción sin escalación de privilegios. */
export function canUpdateStaffRoleAndPermissions(
  actor: StaffAccount | null,
  target: StaffAccount | undefined,
  nextRole: OrgRole,
  nextCanPrescribe: boolean,
  hasAttribution: boolean,
): PolicyDecision {
  if (!actor || !actor.active || actor.role !== 'ADMIN_CLINICA') {
    return deny('FORBIDDEN_ADMIN_CLINICA', 'Solo AdminClinica puede modificar roles organizacionales.')
  }
  if (!target || target.tenantId !== actor.tenantId) {
    return deny('TENANT_ISOLATION', 'La cuenta seleccionada no pertenece a tu clínica.')
  }
  if (nextRole === 'SUPER_ADMIN') {
    return deny(
      'PRIVILEGE_ESCALATION_BLOCKED',
      'AdminClinica no puede conceder el rol SuperAdmin ni privilegios superiores a su propia autoridad (CU-14).',
    )
  }
  if (nextCanPrescribe && (nextRole !== 'ESPECIALISTA' || !hasAttribution)) {
    return deny(
      'ATTRIBUTION_REQUIRED',
      'Habilitar emisión de prescripciones exige perfil Especialista y atribución profesional registrada (CU-14).',
    )
  }
  return allow()
}

/** CU-12 + CU-17 A2: Activar o desactivar personal protegiendo la continuidad del último AdminClinica activo. */
export function canToggleStaffActive(
  actor: StaffAccount | null,
  target: StaffAccount | undefined,
  tenant: ClinicTenant | undefined,
  activeCountInTenant: number,
  activeAdminsInTenant: number,
  nextActive: boolean,
): PolicyDecision {
  if (!actor || !actor.active || actor.role !== 'ADMIN_CLINICA' || !tenant || actor.tenantId !== tenant.id) {
    return deny('FORBIDDEN_ADMIN_CLINICA', 'Solo un AdminClinica activo puede cambiar el estado de su personal.')
  }
  if (!target || target.tenantId !== tenant.id) {
    return deny('TENANT_ISOLATION', 'La cuenta indicada no pertenece a esta clínica.')
  }
  if (!nextActive && target.role === 'ADMIN_CLINICA' && activeAdminsInTenant <= 1) {
    return deny(
      'LAST_ADMIN_PROTECTED',
      'Debe permanecer al menos un AdminClinica activo en la clínica para mantener la administración operativa.',
    )
  }
  if (nextActive && activeCountInTenant >= tenant.plan.maxActiveAccounts) {
    return deny(
      'QUOTA_REACHED',
      `No es posible reactivar la cuenta: se alcanzó la cuota del plan (${activeCountInTenant}/${tenant.plan.maxActiveAccounts}).`,
    )
  }
  return allow()
}

/** CU-12: Vincular auxiliares únicamente con especialistas activos del mismo tenant. */
export function canUpdateAuxiliaryLinks(
  actor: StaffAccount | null,
  auxiliary: StaffAccount | undefined,
  specialistIds: string[],
  allAccounts: StaffAccount[],
): PolicyDecision {
  if (!actor || !actor.active || actor.role !== 'ADMIN_CLINICA') {
    return deny('FORBIDDEN_ADMIN_CLINICA', 'Solo AdminClinica puede modificar vínculos organizativos.')
  }
  if (!auxiliary || auxiliary.tenantId !== actor.tenantId || auxiliary.role !== 'AUXILIAR') {
    return deny('INVALID_AUXILIARY', 'La cuenta seleccionada no corresponde a un auxiliar de tu clínica.')
  }
  for (const id of specialistIds) {
    const spec = allAccounts.find((a) => a.id === id)
    if (!spec || spec.tenantId !== actor.tenantId || spec.role !== 'ESPECIALISTA' || !spec.active) {
      return deny(
        'INVALID_LINKED_SPECIALIST',
        'Todos los especialistas vinculados deben ser cuentas Especialista activas dentro de la misma clínica.',
      )
    }
  }
  return allow()
}

/** CU-10: Evaluación transversal de acceso por ruta y contexto de tenant. */
export function evaluateRouteAccess(
  actor: StaffAccount | null,
  tenant: ClinicTenant | null,
  scope: RouteScope,
): PolicyDecision {
  if (!actor) {
    return deny('UNAUTHENTICATED', 'Debes iniciar sesión para acceder a esta vista.')
  }
  if (!actor.active) {
    return deny('ACCOUNT_DISABLED', 'Tu cuenta se encuentra desactivada.')
  }

  if (scope === 'PLATFORM') {
    return actor.role === 'SUPER_ADMIN'
      ? allow()
      : deny('FORBIDDEN_SCOPE', 'Esta sección pertenece a la administración global de Plataforma SaaS.')
  }

  if (actor.role === 'SUPER_ADMIN') {
    return deny(
      'FORBIDDEN_TENANT_CONTENT',
      'Por separación multitenant (CU-10/CU-11), SuperAdmin no accede a operación interna ni contenido clínico de una clínica.',
    )
  }

  if (!tenant || actor.tenantId !== tenant.id) {
    return deny('TENANT_ISOLATION', 'Contexto de clínica inválido para tu cuenta.')
  }

  if (tenant.status !== 'ACTIVA') {
    return deny(
      'TENANT_INACTIVE',
      `La clínica se encuentra en estado ${tenant.status}; las operaciones del tenant están bloqueadas.`,
    )
  }

  if (scope === 'CLINIC_ADMIN') {
    return actor.role === 'ADMIN_CLINICA'
      ? allow()
      : deny('FORBIDDEN_ROLE', 'Esta sección administrativa está restringida al rol AdminClinica.')
  }

  if (scope === 'CLINIC_AUXILIAR') {
    return actor.role === 'AUXILIAR'
      ? allow()
      : deny('FORBIDDEN_ROLE', 'Esta vista operativa corresponde al personal auxiliar (Secretaría / Enfermería).')
  }

  if (scope === 'CLINIC_CLINICAL') {
    return actor.role === 'ESPECIALISTA'
      ? allow()
      : deny(
          'FORBIDDEN_CLINICAL_SPACE',
          'El Espacio Clínico está separado de la administración y restringido a Especialistas autorizados (CU-10).',
        )
  }

  return deny('FORBIDDEN_SCOPE', 'Acceso no autorizado.')
}

/** Devuelve la ruta de inicio autorizada para cada rol. */
export function defaultRouteForRole(role: OrgRole): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return '/platform/clinics'
    case 'ADMIN_CLINICA':
      return '/admin/staff'
    case 'AUXILIAR':
      return '/admin/workspace'
    case 'ESPECIALISTA':
      return '/clinical/workspace'
  }
}
