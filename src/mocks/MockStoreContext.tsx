import { useEffect, useState, type ReactNode } from 'react'
import { nowGmt6Iso } from '../design-system/gmt6.ts'
import type {
  AssignableClinicRole,
  ClinicTenant,
  OrgRole,
  PlanCode,
  PolicyDecision,
  SessionState,
  StaffAccount,
  StaffPermissions,
} from '../domain/types.ts'
import {
  canAuthenticate,
  canChangeClinicStatus,
  canCompleteInitialAdmin,
  canCreateClinic,
  canCreateStaff,
  canManageTenantPlan,
  canToggleStaffActive,
  canUpdateAuxiliaryLinks,
  canUpdateStaffRoleAndPermissions,
} from '../guards/policy.ts'
import { INITIAL_ACCOUNTS, INITIAL_TENANTS, PLAN_CATALOG } from './seedData.ts'

const STORAGE_KEY = 'vital_proto_wave1_v1'

interface StoreSnapshot {
  tenants: ClinicTenant[]
  accounts: StaffAccount[]
  session: SessionState | null
}

export interface CreateClinicInput {
  name: string
  slug: string
  planCode: PlanCode
  maxActiveAccounts: number
  validUntilGmt6: string
  usesBilling: boolean
  initialAdminName: string
  initialAdminEmail: string
  initialAdminPassword: string
  simulateIdentityFailure: boolean
}

export interface UpdatePlanInput {
  tenantId: string
  planCode: PlanCode
  maxActiveAccounts: number
  validUntilGmt6: string
  usesBilling: boolean
  simulatedRenewalEnabled: boolean
}

export interface CreateStaffInput {
  fullName: string
  email: string
  demoPassword: string
  role: AssignableClinicRole
  specialty?: string
  licenseCode?: string
  title?: string
  permissions: StaffPermissions
}

export interface UpdateRoleInput {
  accountId: string
  role: OrgRole
  canPrescribe: boolean
  canRegisterPatients: boolean
  canAssignInitialPrimary: boolean
  canUploadStudies: boolean
  licenseCode?: string
  title?: string
}

export interface MockStoreContextValue {
  tenants: ClinicTenant[]
  accounts: StaffAccount[]
  session: SessionState | null
  currentUser: StaffAccount | null
  currentTenant: ClinicTenant | null
  loginClinic: (clinicSlug: string, email: string, password: string) => PolicyDecision
  loginPlatform: (email: string, password: string) => PolicyDecision
  logout: () => void
  impersonateAccount: (accountId: string) => PolicyDecision
  createClinic: (input: CreateClinicInput) => PolicyDecision
  completeInitialAdmin: (tenantId: string, password?: string) => PolicyDecision
  toggleClinicStatus: (
    tenantId: string,
    targetStatus: 'ACTIVA' | 'SUSPENDIDA',
    reason: string,
  ) => PolicyDecision
  updateClinicPlan: (input: UpdatePlanInput) => PolicyDecision
  createStaff: (input: CreateStaffInput) => PolicyDecision
  updateStaffRoleAndPermissions: (input: UpdateRoleInput) => PolicyDecision
  toggleStaffActive: (accountId: string) => PolicyDecision
  updateAuxiliaryLinks: (auxiliaryId: string, specialistIds: string[]) => PolicyDecision
  resetDemoData: () => void
}

import { MockStoreContext } from './mockStoreInstance.ts'

function loadInitialSnapshot(): StoreSnapshot {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoreSnapshot>
      if (Array.isArray(parsed.tenants) && Array.isArray(parsed.accounts)) {
        return {
          tenants: parsed.tenants,
          accounts: parsed.accounts,
          session: parsed.session ?? null,
        }
      }
    }
  } catch {
    // Si localStorage falla o contiene datos corruptos, usar fixtures limpios.
  }
  return {
    tenants: INITIAL_TENANTS,
    accounts: INITIAL_ACCOUNTS,
    session: null,
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function MockStoreProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<StoreSnapshot>(loadInitialSnapshot)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    } catch {
      // Ignorar errores de cuota de almacenamiento en modo prototipo.
    }
  }, [snapshot])

  const currentUser = snapshot.session
    ? (snapshot.accounts.find((a) => a.id === snapshot.session?.accountId) ?? null)
    : null

  const currentTenant =
    currentUser && currentUser.tenantId
      ? (snapshot.tenants.find((t) => t.id === currentUser.tenantId) ?? null)
      : null

  const loginClinic = (clinicSlug: string, email: string, password: string): PolicyDecision => {
    const normalizedSlug = clinicSlug.trim().toLowerCase()
    const normalizedEmail = email.trim().toLowerCase()
    const tenant = snapshot.tenants.find((t) => t.slug.toLowerCase() === normalizedSlug)
    const account = snapshot.accounts.find(
      (a) =>
        a.email.toLowerCase() === normalizedEmail &&
        a.demoPassword === password &&
        (tenant ? a.tenantId === tenant.id : true),
    )

    const decision = canAuthenticate(account, tenant, 'CLINIC')
    if (!decision.allowed || !account || !tenant) {
      return decision
    }

    setSnapshot((prev) => ({
      ...prev,
      session: {
        accountId: account.id,
        tenantId: tenant.id,
        loggedInAtGmt6: nowGmt6Iso(),
      },
    }))
    return { allowed: true }
  }

  const loginPlatform = (email: string, password: string): PolicyDecision => {
    const normalizedEmail = email.trim().toLowerCase()
    const account = snapshot.accounts.find(
      (a) => a.email.toLowerCase() === normalizedEmail && a.demoPassword === password,
    )
    const decision = canAuthenticate(account, undefined, 'PLATFORM')
    if (!decision.allowed || !account) {
      return decision
    }

    setSnapshot((prev) => ({
      ...prev,
      session: {
        accountId: account.id,
        tenantId: null,
        loggedInAtGmt6: nowGmt6Iso(),
      },
    }))
    return { allowed: true }
  }

  const logout = () => {
    setSnapshot((prev) => ({ ...prev, session: null }))
  }

  const impersonateAccount = (accountId: string): PolicyDecision => {
    const target = snapshot.accounts.find((a) => a.id === accountId)
    if (!target) {
      return { allowed: false, code: 'NOT_FOUND', message: 'Cuenta demo no encontrada.' }
    }
    const tenant = target.tenantId
      ? snapshot.tenants.find((t) => t.id === target.tenantId)
      : undefined
    const scope = target.role === 'SUPER_ADMIN' ? 'PLATFORM' : 'CLINIC'
    const decision = canAuthenticate(target, tenant, scope)
    if (!decision.allowed) {
      return decision
    }

    setSnapshot((prev) => ({
      ...prev,
      session: {
        accountId: target.id,
        tenantId: target.tenantId,
        loggedInAtGmt6: nowGmt6Iso(),
      },
    }))
    return { allowed: true }
  }

  const createClinic = (input: CreateClinicInput): PolicyDecision => {
    const slug = input.slug.trim().toLowerCase()
    const decision = canCreateClinic(currentUser, snapshot.tenants, slug)
    if (!decision.allowed || !currentUser) return decision

    const emailNormalized = input.initialAdminEmail.trim().toLowerCase()
    const duplicateEmail = snapshot.accounts.some(
      (a) => a.email.toLowerCase() === emailNormalized,
    )
    if (duplicateEmail) {
      return {
        allowed: false,
        code: 'DUPLICATE_EMAIL',
        message: 'El correo del administrador inicial ya está en uso en el prototipo.',
      }
    }

    const timestamp = nowGmt6Iso()
    const tenantId = makeId('tenant')
    const initialStatus = input.simulateIdentityFailure ? 'PENDIENTE_ADMIN' : 'ACTIVA'

    const statusHistory: ClinicTenant['statusHistory'] = [
      {
        id: makeId('evt'),
        fromStatus: null,
        toStatus: 'PENDIENTE_ADMIN',
        reason: 'Registro de clínica iniciado.',
        actorName: currentUser.fullName,
        occurredAtGmt6: timestamp,
      },
    ]

    if (!input.simulateIdentityFailure) {
      statusHistory.push({
        id: makeId('evt'),
        fromStatus: 'PENDIENTE_ADMIN',
        toStatus: 'ACTIVA',
        reason: 'Administrador inicial habilitado en Identity.',
        actorName: currentUser.fullName,
        occurredAtGmt6: timestamp,
      })
    } else {
      statusHistory.push({
        id: makeId('evt'),
        fromStatus: 'PENDIENTE_ADMIN',
        toStatus: 'PENDIENTE_ADMIN',
        reason: 'Fallo simulado al aprovisionar cuenta administrativa en Identity (CU-11 A3).',
        actorName: currentUser.fullName,
        occurredAtGmt6: timestamp,
      })
    }

    const newTenant: ClinicTenant = {
      id: tenantId,
      slug,
      name: input.name.trim(),
      status: initialStatus,
      usesBilling: input.usesBilling,
      plan: {
        code: input.planCode,
        name: PLAN_CATALOG[input.planCode].name,
        maxActiveAccounts: input.maxActiveAccounts,
        validUntilGmt6: input.validUntilGmt6,
        simulatedRenewalEnabled: false,
      },
      initialAdminName: input.initialAdminName.trim(),
      initialAdminEmail: emailNormalized,
      createdAtGmt6: timestamp,
      statusHistory,
    }

    const newAdminAccount: StaffAccount | null = input.simulateIdentityFailure
      ? null
      : {
          id: makeId('acc'),
          tenantId,
          fullName: input.initialAdminName.trim(),
          email: emailNormalized,
          demoPassword: input.initialAdminPassword || 'Vital2026!',
          role: 'ADMIN_CLINICA',
          active: true,
          professionalAttribution: null,
          permissions: {
            canPrescribe: false,
            canRegisterPatients: true,
            canAssignInitialPrimary: true,
            canUploadStudies: false,
          },
          linkedSpecialistIds: [],
          createdAtGmt6: timestamp,
          roleAuditLog: [],
        }

    setSnapshot((prev) => ({
      ...prev,
      tenants: [newTenant, ...prev.tenants],
      accounts: newAdminAccount ? [newAdminAccount, ...prev.accounts] : prev.accounts,
    }))
    return { allowed: true }
  }

  const completeInitialAdmin = (tenantId: string, password = 'Vital2026!'): PolicyDecision => {
    const tenant = snapshot.tenants.find((t) => t.id === tenantId)
    const decision = canCompleteInitialAdmin(currentUser, tenant)
    if (!decision.allowed || !currentUser || !tenant) return decision

    const timestamp = nowGmt6Iso()
    const existingAdmin = snapshot.accounts.find(
      (a) => a.tenantId === tenant.id && a.email.toLowerCase() === tenant.initialAdminEmail.toLowerCase(),
    )

    const createdAdmin: StaffAccount | null = existingAdmin
      ? null
      : {
          id: makeId('acc'),
          tenantId: tenant.id,
          fullName: tenant.initialAdminName,
          email: tenant.initialAdminEmail,
          demoPassword: password,
          role: 'ADMIN_CLINICA',
          active: true,
          professionalAttribution: null,
          permissions: {
            canPrescribe: false,
            canRegisterPatients: true,
            canAssignInitialPrimary: true,
            canUploadStudies: false,
          },
          linkedSpecialistIds: [],
          createdAtGmt6: timestamp,
          roleAuditLog: [],
        }

    setSnapshot((prev) => ({
      ...prev,
      tenants: prev.tenants.map((t) =>
        t.id === tenant.id
          ? {
              ...t,
              status: 'ACTIVA',
              statusHistory: [
                ...t.statusHistory,
                {
                  id: makeId('evt'),
                  fromStatus: 'PENDIENTE_ADMIN',
                  toStatus: 'ACTIVA',
                  reason: 'Reintento exitoso: administrador inicial habilitado en Identity.',
                  actorName: currentUser.fullName,
                  occurredAtGmt6: timestamp,
                },
              ],
            }
          : t,
      ),
      accounts: createdAdmin ? [createdAdmin, ...prev.accounts] : prev.accounts,
    }))
    return { allowed: true }
  }

  const toggleClinicStatus = (
    tenantId: string,
    targetStatus: 'ACTIVA' | 'SUSPENDIDA',
    reason: string,
  ): PolicyDecision => {
    const tenant = snapshot.tenants.find((t) => t.id === tenantId)
    const decision = canChangeClinicStatus(currentUser, tenant, targetStatus)
    if (!decision.allowed || !currentUser || !tenant) return decision

    const timestamp = nowGmt6Iso()
    const cleanReason =
      reason.trim() ||
      (targetStatus === 'SUSPENDIDA'
        ? 'Suspensión administrativa desde Platform.'
        : 'Reactivación administrativa desde Platform.')

    setSnapshot((prev) => ({
      ...prev,
      tenants: prev.tenants.map((t) =>
        t.id === tenant.id
          ? {
              ...t,
              status: targetStatus,
              statusHistory: [
                ...t.statusHistory,
                {
                  id: makeId('evt'),
                  fromStatus: t.status,
                  toStatus: targetStatus,
                  reason: cleanReason,
                  actorName: currentUser.fullName,
                  occurredAtGmt6: timestamp,
                },
              ],
            }
          : t,
      ),
    }))
    return { allowed: true }
  }

  const updateClinicPlan = (input: UpdatePlanInput): PolicyDecision => {
    const tenant = snapshot.tenants.find((t) => t.id === input.tenantId)
    const decision = canManageTenantPlan(currentUser, tenant, 'WRITE')
    if (!decision.allowed || !tenant) return decision

    if (input.maxActiveAccounts < 1) {
      return {
        allowed: false,
        code: 'INVALID_QUOTA',
        message: 'La cuota de cuentas activas debe ser al menos 1.',
      }
    }

    setSnapshot((prev) => ({
      ...prev,
      tenants: prev.tenants.map((t) =>
        t.id === tenant.id
          ? {
              ...t,
              usesBilling: input.usesBilling,
              plan: {
                code: input.planCode,
                name: PLAN_CATALOG[input.planCode].name,
                maxActiveAccounts: input.maxActiveAccounts,
                validUntilGmt6: input.validUntilGmt6,
                simulatedRenewalEnabled: input.simulatedRenewalEnabled,
              },
            }
          : t,
      ),
    }))
    return { allowed: true }
  }

  const createStaff = (input: CreateStaffInput): PolicyDecision => {
    if (!currentUser || !currentTenant) {
      return { allowed: false, code: 'UNAUTHORIZED', message: 'Requiere sesión de AdminClinica.' }
    }
    const activeCount = snapshot.accounts.filter(
      (a) => a.tenantId === currentTenant.id && a.active,
    ).length
    const hasAttribution = Boolean(input.licenseCode?.trim() && input.title?.trim())

    const decision = canCreateStaff(
      currentUser,
      currentTenant,
      activeCount,
      input.role,
      hasAttribution,
      input.permissions.canPrescribe,
    )
    if (!decision.allowed) return decision

    const normalizedEmail = input.email.trim().toLowerCase()
    const duplicatedInTenant = snapshot.accounts.some(
      (a) => a.tenantId === currentTenant.id && a.email.toLowerCase() === normalizedEmail,
    )
    if (duplicatedInTenant) {
      return {
        allowed: false,
        code: 'DUPLICATE_STAFF_EMAIL',
        message: 'Ya existe una cuenta con ese correo dentro de esta clínica.',
      }
    }

    const timestamp = nowGmt6Iso()
    const newStaff: StaffAccount = {
      id: makeId('acc'),
      tenantId: currentTenant.id,
      fullName: input.fullName.trim(),
      email: normalizedEmail,
      demoPassword: input.demoPassword || 'Vital2026!',
      role: input.role,
      active: true,
      specialty: input.role === 'ESPECIALISTA' ? input.specialty?.trim() || 'Medicina General' : undefined,
      professionalAttribution:
        input.role === 'ESPECIALISTA' && hasAttribution
          ? {
              licenseCode: input.licenseCode!.trim(),
              title: input.title!.trim(),
              registeredAtGmt6: timestamp,
            }
          : null,
      permissions: {
        canPrescribe: input.role === 'ESPECIALISTA' ? input.permissions.canPrescribe : false,
        canRegisterPatients: input.permissions.canRegisterPatients,
        canAssignInitialPrimary:
          input.role === 'ADMIN_CLINICA' || input.role === 'AUXILIAR'
            ? input.permissions.canAssignInitialPrimary
            : false,
        canUploadStudies: input.role === 'AUXILIAR' ? input.permissions.canUploadStudies : false,
      },
      linkedSpecialistIds: [],
      createdAtGmt6: timestamp,
      roleAuditLog: [],
    }

    setSnapshot((prev) => ({
      ...prev,
      accounts: [newStaff, ...prev.accounts],
    }))
    return { allowed: true }
  }

  const updateStaffRoleAndPermissions = (input: UpdateRoleInput): PolicyDecision => {
    const target = snapshot.accounts.find((a) => a.id === input.accountId)
    const hasNewAttribution = Boolean(input.licenseCode?.trim() && input.title?.trim())
    const hasAttribution = hasNewAttribution || Boolean(target?.professionalAttribution)

    const decision = canUpdateStaffRoleAndPermissions(
      currentUser,
      target,
      input.role,
      input.canPrescribe,
      hasAttribution,
    )
    if (!decision.allowed || !currentUser || !target) return decision

    const timestamp = nowGmt6Iso()
    const nextAttribution =
      input.role === 'ESPECIALISTA' && hasNewAttribution
        ? {
            licenseCode: input.licenseCode!.trim(),
            title: input.title!.trim(),
            registeredAtGmt6: target.professionalAttribution?.registeredAtGmt6 ?? timestamp,
          }
        : input.role === 'ESPECIALISTA'
          ? target.professionalAttribution
          : null

    setSnapshot((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a) => {
        if (a.id !== target.id) return a
        const auditEntry = {
          id: makeId('audit'),
          previousRole: a.role,
          nextRole: input.role,
          previousCanPrescribe: a.permissions.canPrescribe,
          nextCanPrescribe: input.role === 'ESPECIALISTA' ? input.canPrescribe : false,
          actorName: currentUser.fullName,
          occurredAtGmt6: timestamp,
          note: `Actualización de rol y facultades por ${currentUser.fullName}.`,
        }
        return {
          ...a,
          role: input.role,
          professionalAttribution: nextAttribution,
          permissions: {
            canPrescribe: input.role === 'ESPECIALISTA' ? input.canPrescribe : false,
            canRegisterPatients: input.canRegisterPatients,
            canAssignInitialPrimary:
              input.role === 'ADMIN_CLINICA' || input.role === 'AUXILIAR'
                ? input.canAssignInitialPrimary
                : false,
            canUploadStudies: input.role === 'AUXILIAR' ? input.canUploadStudies : false,
          },
          linkedSpecialistIds: input.role === 'AUXILIAR' ? a.linkedSpecialistIds : [],
          roleAuditLog: [auditEntry, ...a.roleAuditLog],
        }
      }),
    }))
    return { allowed: true }
  }

  const toggleStaffActive = (accountId: string): PolicyDecision => {
    const target = snapshot.accounts.find((a) => a.id === accountId)
    const activeCountInTenant = snapshot.accounts.filter(
      (a) => a.tenantId === currentTenant?.id && a.active,
    ).length
    const activeAdminsInTenant = snapshot.accounts.filter(
      (a) => a.tenantId === currentTenant?.id && a.active && a.role === 'ADMIN_CLINICA',
    ).length
    const nextActive = target ? !target.active : false

    const decision = canToggleStaffActive(
      currentUser,
      target,
      currentTenant ?? undefined,
      activeCountInTenant,
      activeAdminsInTenant,
      nextActive,
    )
    if (!decision.allowed || !target) return decision

    setSnapshot((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a) => (a.id === target.id ? { ...a, active: nextActive } : a)),
    }))
    return { allowed: true }
  }

  const updateAuxiliaryLinks = (auxiliaryId: string, specialistIds: string[]): PolicyDecision => {
    const auxiliary = snapshot.accounts.find((a) => a.id === auxiliaryId)
    const decision = canUpdateAuxiliaryLinks(
      currentUser,
      auxiliary,
      specialistIds,
      snapshot.accounts,
    )
    if (!decision.allowed || !auxiliary) return decision

    setSnapshot((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a) =>
        a.id === auxiliary.id ? { ...a, linkedSpecialistIds: [...specialistIds] } : a,
      ),
    }))
    return { allowed: true }
  }

  const resetDemoData = () => {
    const fresh: StoreSnapshot = {
      tenants: INITIAL_TENANTS,
      accounts: INITIAL_ACCOUNTS,
      session: null,
    }
    setSnapshot(fresh)
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Sin acción adicional requerida.
    }
  }

  return (
    <MockStoreContext
      value={{
        tenants: snapshot.tenants,
        accounts: snapshot.accounts,
        session: snapshot.session,
        currentUser,
        currentTenant,
        loginClinic,
        loginPlatform,
        logout,
        impersonateAccount,
        createClinic,
        completeInitialAdmin,
        toggleClinicStatus,
        updateClinicPlan,
        createStaff,
        updateStaffRoleAndPermissions,
        toggleStaffActive,
        updateAuxiliaryLinks,
        resetDemoData,
      }}
    >
      {children}
    </MockStoreContext>
  )
}


