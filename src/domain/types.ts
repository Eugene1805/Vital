export type TenantStatus = 'PENDIENTE_ADMIN' | 'ACTIVA' | 'SUSPENDIDA'

export type PlanCode = 'BASICO' | 'CLINICA' | 'HOSPITAL'

export type OrgRole =
  | 'SUPER_ADMIN'
  | 'ADMIN_CLINICA'
  | 'ESPECIALISTA'
  | 'AUXILIAR'

export type AssignableClinicRole = Exclude<OrgRole, 'SUPER_ADMIN'>

export type RouteScope =
  | 'PLATFORM'
  | 'CLINIC_ADMIN'
  | 'CLINIC_AUXILIAR'
  | 'CLINIC_CLINICAL'

export interface TenantStatusEvent {
  id: string
  fromStatus: TenantStatus | null
  toStatus: TenantStatus
  reason: string
  actorName: string
  occurredAtGmt6: string
}

export interface ClinicPlan {
  code: PlanCode
  name: string
  maxActiveAccounts: number
  validUntilGmt6: string
  simulatedRenewalEnabled: boolean
}

export interface ClinicTenant {
  id: string
  slug: string
  name: string
  status: TenantStatus
  usesBilling: boolean
  plan: ClinicPlan
  initialAdminName: string
  initialAdminEmail: string
  createdAtGmt6: string
  statusHistory: TenantStatusEvent[]
}

export interface ProfessionalAttribution {
  licenseCode: string
  title: string
  registeredAtGmt6: string
}

export interface StaffPermissions {
  canPrescribe: boolean
  canRegisterPatients: boolean
  canAssignInitialPrimary: boolean
  canUploadStudies: boolean
}

export interface RoleAuditEntry {
  id: string
  previousRole: OrgRole
  nextRole: OrgRole
  previousCanPrescribe: boolean
  nextCanPrescribe: boolean
  actorName: string
  occurredAtGmt6: string
  note: string
}

export interface StaffAccount {
  id: string
  tenantId: string | null
  fullName: string
  email: string
  demoPassword: string
  role: OrgRole
  active: boolean
  specialty?: string
  professionalAttribution: ProfessionalAttribution | null
  permissions: StaffPermissions
  linkedSpecialistIds: string[]
  createdAtGmt6: string
  roleAuditLog: RoleAuditEntry[]
}

export interface SessionState {
  accountId: string
  tenantId: string | null
  loggedInAtGmt6: string
}

export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; code: string; message: string }
