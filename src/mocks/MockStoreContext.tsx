import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { addMonthsGmt6Iso, nowGmt6Iso } from '../design-system/gmt6.ts'
import {
  clearIdentityTokens,
  createIdentityClient,
  getIdentityApiUrl,
  getInitialAuthMode,
  IdentityApiError,
  loadIdentityTenantSummary,
  loadIdentityTokens,
  saveAuthModeOverride,
  saveIdentityTenantSummary,
  type IdentityAccountProfileDto,
  type IdentityAuthMode,
  type IdentityStaffDirectoryResponse,
  type IdentityTenantSummaryDto,
} from '../services/identityClient.ts'
import { getAgendaApiUrl } from '../services/agendaClient.ts'
import { getBillingApiUrl } from '../services/billingClient.ts'
import type {
  Appointment,
  AppointmentStatus,
  AssignableClinicRole,
  ChargeLineItem,
  ClinicScheduleConfig,
  ClinicalEncounter,
  ClinicalHistoryCategory,
  ClinicalHistoryEntry,
  ClinicalIndication,
  ClinicalRecord,
  ClinicalStudyDocument,
  ClinicTenant,
  EncounterChargeSheet,
  ExceptionalAccessGrant,
  ExceptionalDurationMonths,
  ExceptionalOperation,
  HistoryProvenance,
  OrgRole,
  PatientAdminRecord,
  PatientPayment,
  PaymentMethod,
  PlanCode,
  PolicyDecision,
  PreliminaryPreparation,
  PreliminaryVitals,
  Prescription,
  PrescriptionItem,
  SchedulePolicyDecision,
  ScheduleTimeSlot,
  SessionState,
  SpecialistCut,
  SpecialistScheduleConfig,
  SpecialistScheduleException,
  StaffAccount,
  StaffPermissions,
} from '../domain/types.ts'
import {
  calculateChargeItemsTotal,
  canEditChargeSheet,
  canMarkChargeSheetReviewed,
  canPrepareCut,
  canRecordFullPayment,
  canReopenChargeSheet,
  canResolveSpecialistCut,
  canReviseCut,
  formatMxn,
  summarizePaymentsByMethod,
} from '../guards/billingBi.ts'
import {
  canAppendClosedNoteAddendum,
  canAppendPreparationAddendum,
  canCancelPrescription,
  canCreatePreparation,
  canEditOrCloseNote,
  canEditPreparation,
  canFinalizeEncounter,
  canIssuePrescription,
  canScheduleAppointment,
  canTransitionAppointmentStatus,
  canUploadStudyPdf,
} from '../guards/clinicalFlow.ts'
import {
  canCreateExceptionalRequest,
  canResolveExceptionalRequest,
  canRevokeExceptionalGrant,
  evaluateObjectAccess,
} from '../guards/objectAccess.ts'
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
import {
  computeMockAvailability,
  resolveEffectiveDayScheduleMock,
  validateAppointmentFitsScheduleMock,
  validateScheduleChangeAgainstAppointmentsMock,
  validateWeeklySlotsMock,
} from '../guards/scheduleMock.ts'
import {
  INITIAL_ACCOUNTS,
  INITIAL_APPOINTMENTS,
  INITIAL_CHARGE_SHEETS,
  INITIAL_CLINIC_SCHEDULES,
  INITIAL_CUTS,
  INITIAL_ENCOUNTERS,
  INITIAL_GRANTS,
  INITIAL_HISTORY_ENTRIES,
  INITIAL_PATIENTS,
  INITIAL_PAYMENTS,
  INITIAL_PREPARATIONS,
  INITIAL_PRESCRIPTIONS,
  INITIAL_RECORDS,
  INITIAL_SCHEDULE_EXCEPTIONS,
  INITIAL_SPECIALIST_SCHEDULES,
  INITIAL_STUDIES,
  INITIAL_TENANTS,
  PLAN_CATALOG,
} from './seedData.ts'

const STORAGE_KEY = 'vital_proto_wave4_v1'

interface StoreSnapshot {
  tenants: ClinicTenant[]
  accounts: StaffAccount[]
  patients: PatientAdminRecord[]
  records: ClinicalRecord[]
  grants: ExceptionalAccessGrant[]
  appointments: Appointment[]
  clinicSchedules: ClinicScheduleConfig[]
  specialistSchedules: SpecialistScheduleConfig[]
  scheduleExceptions: SpecialistScheduleException[]
  preparations: PreliminaryPreparation[]
  encounters: ClinicalEncounter[]
  historyEntries: ClinicalHistoryEntry[]
  studies: ClinicalStudyDocument[]
  prescriptions: Prescription[]
  chargeSheets: EncounterChargeSheet[]
  payments: PatientPayment[]
  cuts: SpecialistCut[]
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
  generateTemporaryPassword?: boolean
  role: AssignableClinicRole
  specialty?: string
  licenseCode?: string
  title?: string
  permissions: StaffPermissions
}

export type CreateStaffResult =
  | { allowed: true; temporaryPassword?: string | null }
  | { allowed: false; code: string; message: string }

export type AuthLoginResult =
  | { allowed: true; role: OrgRole }
  | { allowed: false; code: string; message: string }

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

export interface CreatePatientWithRecordInput {
  fullName: string
  birthDateGmt6: string
  phone: string
  email?: string
  emergencyContact?: string
  primarySpecialistId: string | null
  allowDuplicateOverride?: boolean
}

export type CreatePatientResult =
  | { allowed: true; patientId: string; recordId: string; patientCode: string }
  | { allowed: false; code: string; message: string }

export interface UpdatePatientAdminInput {
  patientId: string
  fullName: string
  birthDateGmt6: string
  phone: string
  email?: string
  emergencyContact?: string
}

export interface RequestExceptionalAccessInput {
  patientId: string
  operations: ExceptionalOperation[]
  reason: string
  requestedMonths: ExceptionalDurationMonths
}

export interface CreateAppointmentInput {
  patientId: string
  specialistId: string
  scheduledStartGmt6: string
  durationMinutes: number
  reason: string
}

export interface SavePreparationInput {
  patientId: string
  recordId: string
  declaredAllergies: string
  declaredConditions: string
  vitals: PreliminaryVitals
}

export interface StartEncounterInput {
  recordId: string
  appointmentId: string | null
  chiefComplaint: string
}

export type StartEncounterResult =
  | { allowed: true; encounterId: string }
  | { allowed: false; code: string; message: string }

export interface UploadStudyInput {
  patientId: string
  recordId: string
  encounterId: string | null
  title: string
  fileName: string
  mimeType: string
  fileSizeKb: number
  previewNote: string
}

export interface MockStoreContextValue {
  tenants: ClinicTenant[]
  accounts: StaffAccount[]
  patients: PatientAdminRecord[]
  records: ClinicalRecord[]
  grants: ExceptionalAccessGrant[]
  appointments: Appointment[]
  clinicSchedules: ClinicScheduleConfig[]
  specialistSchedules: SpecialistScheduleConfig[]
  scheduleExceptions: SpecialistScheduleException[]
  agendaApiUrl: string
  billingApiUrl: string
  preparations: PreliminaryPreparation[]
  encounters: ClinicalEncounter[]
  historyEntries: ClinicalHistoryEntry[]
  studies: ClinicalStudyDocument[]
  prescriptions: Prescription[]
  chargeSheets: EncounterChargeSheet[]
  payments: PatientPayment[]
  cuts: SpecialistCut[]
  session: SessionState | null
  currentUser: StaffAccount | null
  currentTenant: ClinicTenant | null
  authMode: IdentityAuthMode
  setAuthMode: (mode: IdentityAuthMode) => void
  identityApiUrl: string
  authLoading: boolean
  identityAccountId: string | null
  identityDirectory: IdentityStaffDirectoryResponse | null
  identityDirectoryLoading: boolean
  identityDirectoryError: string | null
  refreshIdentityDirectory: () => Promise<void>
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<PolicyDecision>
  loginClinic: (clinicSlug: string, email: string, password: string) => Promise<AuthLoginResult>
  loginPlatform: (email: string, password: string) => Promise<AuthLoginResult>
  logout: () => Promise<void>
  impersonateAccount: (accountId: string) => Promise<PolicyDecision>
  createClinic: (input: CreateClinicInput) => PolicyDecision
  completeInitialAdmin: (tenantId: string) => PolicyDecision
  toggleClinicStatus: (
    tenantId: string,
    targetStatus: 'ACTIVA' | 'SUSPENDIDA',
    reason: string,
  ) => PolicyDecision
  updateClinicPlan: (input: UpdatePlanInput) => PolicyDecision
  createStaff: (input: CreateStaffInput) => Promise<CreateStaffResult>
  updateStaffRoleAndPermissions: (input: UpdateRoleInput) => Promise<PolicyDecision>
  toggleStaffActive: (accountId: string) => Promise<PolicyDecision>
  updateAuxiliaryLinks: (auxiliaryId: string, specialistIds: string[]) => Promise<PolicyDecision>
  createPatientWithRecord: (input: CreatePatientWithRecordInput) => CreatePatientResult
  updatePatientAdminData: (input: UpdatePatientAdminInput) => PolicyDecision
  assignInitialPrimarySpecialist: (recordId: string, specialistId: string) => PolicyDecision
  reassignPrimarySpecialist: (
    recordId: string,
    nextSpecialistId: string,
    note: string,
  ) => PolicyDecision
  addTreatingSpecialist: (recordId: string, specialistId: string) => PolicyDecision
  removeTreatingSpecialist: (recordId: string, specialistId: string) => PolicyDecision
  requestExceptionalAccess: (input: RequestExceptionalAccessInput) => PolicyDecision
  resolveExceptionalAccess: (
    grantId: string,
    decision: 'APROBAR' | 'RECHAZAR',
    approvedOperations: ExceptionalOperation[],
    approvedMonths: number,
    resolutionNote: string,
  ) => PolicyDecision
  revokeExceptionalAccess: (grantId: string) => PolicyDecision
  createAppointment: (input: CreateAppointmentInput) => PolicyDecision
  rescheduleAppointment: (
    appointmentId: string,
    scheduledStartGmt6: string,
    durationMinutes: number,
  ) => PolicyDecision
  transitionAppointmentStatus: (
    appointmentId: string,
    nextStatus: AppointmentStatus,
  ) => PolicyDecision
  updateClinicSchedule: (slots: ScheduleTimeSlot[]) => SchedulePolicyDecision
  updateSpecialistSchedule: (
    specialistId: string,
    useClinicFallback: boolean,
    slots: ScheduleTimeSlot[],
  ) => SchedulePolicyDecision
  upsertSpecialistException: (input: {
    specialistId: string
    dateGmt6: string
    isUnavailable: boolean
    customStartTime: string | null
    customEndTime: string | null
    reason: string
  }) => SchedulePolicyDecision
  deleteSpecialistException: (
    specialistId: string,
    exceptionId: string,
  ) => SchedulePolicyDecision
  getMockSpecialistAvailability: (
    specialistId: string,
    dateGmt6: string,
    durationMinutes?: number,
  ) => ReturnType<typeof computeMockAvailability> | null
  createPreparation: (input: SavePreparationInput) => PolicyDecision
  updatePreparation: (preparationId: string, input: SavePreparationInput) => PolicyDecision
  appendPreparationAddendum: (
    preparationId: string,
    reason: string,
    detail: string,
  ) => PolicyDecision
  startEncounter: (input: StartEncounterInput) => StartEncounterResult
  incorporatePreparation: (encounterId: string, preparationId: string) => PolicyDecision
  saveEncounterDraft: (
    encounterId: string,
    chiefComplaint: string,
    noteContent: string,
  ) => PolicyDecision
  finalizeEncounter: (encounterId: string) => PolicyDecision
  closeEncounterNote: (encounterId: string, noteContent: string) => PolicyDecision
  appendClosedNoteAddendum: (
    encounterId: string,
    reason: string,
    detail: string,
  ) => PolicyDecision
  addEncounterIndication: (
    encounterId: string,
    kind: ClinicalIndication['kind'],
    text: string,
  ) => PolicyDecision
  addClinicalHistoryEntry: (
    recordId: string,
    category: ClinicalHistoryCategory,
    description: string,
    provenance: HistoryProvenance,
  ) => PolicyDecision
  appendClinicalHistoryAddendum: (
    entryId: string,
    reason: string,
    detail: string,
  ) => PolicyDecision
  uploadStudyPdf: (input: UploadStudyInput) => PolicyDecision
  createPrescriptionDraft: (
    encounterId: string,
    items: PrescriptionItem[],
    generalInstructions: string,
  ) => { allowed: true; prescriptionId: string } | { allowed: false; code: string; message: string }
  updatePrescriptionDraft: (
    prescriptionId: string,
    items: PrescriptionItem[],
    generalInstructions: string,
  ) => PolicyDecision
  issuePrescription: (
    prescriptionId: string,
    items: PrescriptionItem[],
    generalInstructions: string,
  ) => PolicyDecision
  issueDirectPrescription: (
    encounterId: string,
    items: PrescriptionItem[],
    generalInstructions: string,
  ) => PolicyDecision
  cancelPrescription: (
    prescriptionId: string,
    reason: string,
    duplicateAsNewDraft: boolean,
  ) =>
    | { allowed: true; duplicatedPrescriptionId: string | null }
    | { allowed: false; code: string; message: string }
  saveChargeSheet: (encounterId: string, items: ChargeLineItem[]) => PolicyDecision
  markChargeSheetReviewed: (encounterId: string) => PolicyDecision
  reopenChargeSheet: (encounterId: string) => PolicyDecision
  recordFullPayment: (
    encounterId: string,
    amountMxn: number,
    method: PaymentMethod,
  ) => PolicyDecision
  prepareSpecialistCut: (
    specialistId: string,
    periodStartGmt6: string,
    periodEndGmt6: string,
    paymentIds: string[],
  ) => PolicyDecision
  reviseSpecialistCut: (
    cutId: string,
    periodStartGmt6: string,
    periodEndGmt6: string,
    paymentIds: string[],
    adjustmentNote: string,
  ) => PolicyDecision
  confirmSpecialistCut: (cutId: string) => PolicyDecision
  observeSpecialistCut: (cutId: string, comment: string) => PolicyDecision
  resetDemoData: () => void
}

import { MockStoreContext } from './mockStoreInstance.ts'

function loadInitialSnapshot(): StoreSnapshot {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoreSnapshot>
      if (
        Array.isArray(parsed.tenants) &&
        Array.isArray(parsed.accounts) &&
        Array.isArray(parsed.patients) &&
        Array.isArray(parsed.records) &&
        Array.isArray(parsed.grants) &&
        Array.isArray(parsed.appointments) &&
        Array.isArray(parsed.preparations) &&
        Array.isArray(parsed.encounters) &&
        Array.isArray(parsed.historyEntries) &&
        Array.isArray(parsed.studies) &&
        Array.isArray(parsed.prescriptions) &&
        Array.isArray(parsed.chargeSheets) &&
        Array.isArray(parsed.payments) &&
        Array.isArray(parsed.cuts)
      ) {
        return {
          tenants: parsed.tenants,
          accounts: parsed.accounts,
          patients: parsed.patients,
          records: parsed.records,
          grants: parsed.grants,
          appointments: parsed.appointments,
          clinicSchedules: Array.isArray(parsed.clinicSchedules)
            ? parsed.clinicSchedules
            : INITIAL_CLINIC_SCHEDULES,
          specialistSchedules: Array.isArray(parsed.specialistSchedules)
            ? parsed.specialistSchedules
            : INITIAL_SPECIALIST_SCHEDULES,
          scheduleExceptions: Array.isArray(parsed.scheduleExceptions)
            ? parsed.scheduleExceptions
            : INITIAL_SCHEDULE_EXCEPTIONS,
          preparations: parsed.preparations,
          encounters: parsed.encounters,
          historyEntries: parsed.historyEntries,
          studies: parsed.studies,
          prescriptions: parsed.prescriptions,
          chargeSheets: parsed.chargeSheets,
          payments: parsed.payments,
          cuts: parsed.cuts,
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
    patients: INITIAL_PATIENTS,
    records: INITIAL_RECORDS,
    grants: INITIAL_GRANTS,
    appointments: INITIAL_APPOINTMENTS,
    clinicSchedules: INITIAL_CLINIC_SCHEDULES,
    specialistSchedules: INITIAL_SPECIALIST_SCHEDULES,
    scheduleExceptions: INITIAL_SCHEDULE_EXCEPTIONS,
    preparations: INITIAL_PREPARATIONS,
    encounters: INITIAL_ENCOUNTERS,
    historyEntries: INITIAL_HISTORY_ENTRIES,
    studies: INITIAL_STUDIES,
    prescriptions: INITIAL_PRESCRIPTIONS,
    chargeSheets: INITIAL_CHARGE_SHEETS,
    payments: INITIAL_PAYMENTS,
    cuts: INITIAL_CUTS,
    session: null,
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function toPolicyFailure(
  err: unknown,
  fallbackMessage: string,
): { allowed: false; code: string; message: string } {
  if (err instanceof IdentityApiError) {
    return { allowed: false, code: err.problem.code, message: err.problem.message }
  }
  return { allowed: false, code: 'IDENTITY_UNREACHABLE', message: fallbackMessage }
}

const KNOWN_SEEDED_TENANT_SLUGS: Record<string, string> = {
  '10000000-0000-0000-0000-000000000001': 'clinica-norte',
  '10000000-0000-0000-0000-000000000002': 'clinica-valle',
  '10000000-0000-0000-0000-000000000003': 'clinica-aurora',
}

export function MockStoreProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<StoreSnapshot>(loadInitialSnapshot)
  const identityApiUrl = getIdentityApiUrl()
  const agendaApiUrl = getAgendaApiUrl()
  const billingApiUrl = getBillingApiUrl()
  const [identityClient] = useState(() => createIdentityClient(identityApiUrl))
  const [authMode, setAuthModeState] = useState<IdentityAuthMode>(getInitialAuthMode)
  const [identityProfile, setIdentityProfile] = useState<IdentityAccountProfileDto | null>(null)
  const [identityTenantInfo, setIdentityTenantInfo] = useState<IdentityTenantSummaryDto | null>(
    loadIdentityTenantSummary,
  )
  const [authLoading, setAuthLoading] = useState<boolean>(
    () => getInitialAuthMode() === 'identity' && Boolean(loadIdentityTokens()),
  )
  const [identityDirectory, setIdentityDirectory] =
    useState<IdentityStaffDirectoryResponse | null>(null)
  const [identityDirectoryLoading, setIdentityDirectoryLoading] = useState(false)
  const [identityDirectoryError, setIdentityDirectoryError] = useState<string | null>(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    } catch {
      // Ignorar errores de cuota de almacenamiento en modo prototipo.
    }
  }, [snapshot])

  useEffect(() => {
    if (authMode !== 'identity') {
      return
    }

    const tokens = loadIdentityTokens()
    if (!tokens) {
      return
    }

    let cancelled = false
    identityClient
      .getMe()
      .then((profile) => {
        if (cancelled) return
        setIdentityProfile(profile)
        setIdentityTenantInfo(loadIdentityTenantSummary())
      })
      .catch(() => {
        if (cancelled) return
        clearIdentityTokens()
        setIdentityProfile(null)
        setIdentityTenantInfo(null)
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [authMode, identityClient])

  const setAuthMode = (nextMode: IdentityAuthMode) => {
    saveAuthModeOverride(nextMode)
    setAuthModeState(nextMode)
    setIdentityProfile(null)
    setIdentityTenantInfo(null)
    setIdentityDirectory(null)
    setIdentityDirectoryError(null)
    if (nextMode === 'mock') {
      clearIdentityTokens()
      setAuthLoading(false)
    } else {
      setAuthLoading(Boolean(loadIdentityTokens()))
    }
  }

  const refreshIdentityDirectory = useCallback(async () => {
    if (authMode !== 'identity') return
    setIdentityDirectoryLoading(true)
    setIdentityDirectoryError(null)
    try {
      const directory = await identityClient.listStaff()
      setIdentityDirectory(directory)
    } catch (err) {
      const failure = toPolicyFailure(
        err,
        'No fue posible consultar el directorio de personal en Identity.',
      )
      setIdentityDirectoryError(failure.message)
    } finally {
      setIdentityDirectoryLoading(false)
    }
  }, [authMode, identityClient])

  const mockCurrentUser = snapshot.session
    ? (snapshot.accounts.find((a) => a.id === snapshot.session?.accountId) ?? null)
    : null

  const mockCurrentTenant =
    mockCurrentUser && mockCurrentUser.tenantId
      ? (snapshot.tenants.find((t) => t.id === mockCurrentUser.tenantId) ?? null)
      : null

  const resolvedIdentitySlug = identityProfile?.tenantId
    ? (identityTenantInfo?.slug ?? KNOWN_SEEDED_TENANT_SLUGS[identityProfile.tenantId.toLowerCase()])
    : undefined

  const identityCurrentTenant: ClinicTenant | null = (() => {
    if (authMode !== 'identity' || !identityProfile || !identityProfile.tenantId) {
      return null
    }
    const baseMock = resolvedIdentitySlug
      ? snapshot.tenants.find((t) => t.slug.toLowerCase() === resolvedIdentitySlug.toLowerCase())
      : snapshot.tenants.find((t) => t.id === identityProfile.tenantId)

    if (baseMock) {
      return {
        ...baseMock,
        status: identityTenantInfo?.state ?? baseMock.status,
        plan: {
          ...baseMock.plan,
          maxActiveAccounts: identityDirectory?.maxActiveAccounts ?? baseMock.plan.maxActiveAccounts,
        },
      }
    }

    return {
      id: identityProfile.tenantId,
      slug: identityTenantInfo?.slug ?? 'clinica',
      name: identityTenantInfo?.name ?? 'Clínica conectada',
      status: identityTenantInfo?.state ?? 'ACTIVA',
      usesBilling: true,
      plan: {
        code: 'CLINICA',
        name: 'Plan Clínica',
        maxActiveAccounts: identityDirectory?.maxActiveAccounts ?? 8,
        validUntilGmt6: '2027-12-31',
        simulatedRenewalEnabled: true,
      },
      provisioningRequestId: 'identity-live',
      provisioningStatus: 'READY',
      initialAdminName: identityProfile.fullName,
      initialAdminEmail: identityProfile.email,
      createdAtGmt6: identityProfile.createdAtGmt6,
      statusHistory: [],
    }
  })()

  const currentTenant = authMode === 'identity' ? identityCurrentTenant : mockCurrentTenant

  const currentUser: StaffAccount | null = (() => {
    if (authMode !== 'identity') return mockCurrentUser
    if (!identityProfile) return null
    const matchedLocal = snapshot.accounts.find(
      (a) =>
        a.email.toLowerCase() === identityProfile.email.toLowerCase() &&
        (identityProfile.role === 'SUPER_ADMIN'
          ? a.tenantId === null
          : a.tenantId === identityCurrentTenant?.id),
    )
    return {
      id: matchedLocal?.id ?? identityProfile.id,
      tenantId: identityCurrentTenant?.id ?? identityProfile.tenantId,
      fullName: identityProfile.fullName,
      email: identityProfile.email,
      demoPassword: '',
      role: identityProfile.role,
      active: identityProfile.active,
      mustChangePassword: identityProfile.mustChangePassword,
      specialty: identityProfile.specialty ?? undefined,
      professionalAttribution: identityProfile.professionalAttribution,
      permissions: identityProfile.permissions,
      linkedSpecialistIds: identityProfile.linkedSpecialistIds,
      createdAtGmt6: identityProfile.createdAtGmt6,
      roleAuditLog: matchedLocal?.roleAuditLog ?? [],
    }
  })()

  const loginClinic = async (
    clinicSlug: string,
    email: string,
    password: string,
  ): Promise<AuthLoginResult> => {
    if (authMode === 'identity') {
      try {
        const session = await identityClient.loginClinic(clinicSlug, email, password)
        saveIdentityTenantSummary(session.tenant)
        setIdentityProfile(session.account)
        setIdentityTenantInfo(session.tenant)
        setIdentityDirectory(null)
        return { allowed: true, role: session.account.role }
      } catch (err) {
        return toPolicyFailure(
          err,
          `No fue posible conectar con saas-identity en ${identityApiUrl}. Verifica que el contenedor esté activo.`,
        )
      }
    }

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
    if (!decision.allowed) {
      return decision
    }
    if (!account || !tenant) {
      return {
        allowed: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Credenciales inválidas para el contexto seleccionado.',
      }
    }

    setSnapshot((prev) => ({
      ...prev,
      session: {
        accountId: account.id,
        tenantId: tenant.id,
        loggedInAtGmt6: nowGmt6Iso(),
      },
    }))
    return { allowed: true, role: account.role }
  }

  const loginPlatform = async (email: string, password: string): Promise<AuthLoginResult> => {
    if (authMode === 'identity') {
      try {
        const session = await identityClient.loginPlatform(email, password)
        saveIdentityTenantSummary(null)
        setIdentityProfile(session.account)
        setIdentityTenantInfo(null)
        setIdentityDirectory(null)
        return { allowed: true, role: session.account.role }
      } catch (err) {
        return toPolicyFailure(
          err,
          `No fue posible conectar con saas-identity en ${identityApiUrl}. Verifica que el contenedor esté activo.`,
        )
      }
    }

    const normalizedEmail = email.trim().toLowerCase()
    const account = snapshot.accounts.find(
      (a) => a.email.toLowerCase() === normalizedEmail && a.demoPassword === password,
    )
    const decision = canAuthenticate(account, undefined, 'PLATFORM')
    if (!decision.allowed) {
      return decision
    }
    if (!account) {
      return {
        allowed: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Credenciales inválidas para el acceso de plataforma.',
      }
    }

    setSnapshot((prev) => ({
      ...prev,
      session: {
        accountId: account.id,
        tenantId: null,
        loggedInAtGmt6: nowGmt6Iso(),
      },
    }))
    return { allowed: true, role: account.role }
  }

  const logout = async () => {
    if (authMode === 'identity') {
      await identityClient.logout()
      setIdentityProfile(null)
      setIdentityTenantInfo(null)
      setIdentityDirectory(null)
      setIdentityDirectoryError(null)
      return
    }
    setSnapshot((prev) => ({ ...prev, session: null }))
  }

  const changeOwnPassword = async (
    currentPassword: string,
    newPassword: string,
  ): Promise<PolicyDecision> => {
    if (authMode !== 'identity') {
      return {
        allowed: false,
        code: 'MOCK_MODE',
        message: 'El cambio de contraseña real solo aplica en modo Identity API.',
      }
    }

    try {
      await identityClient.changePassword(currentPassword, newPassword)
      setIdentityProfile((prev) => (prev ? { ...prev, mustChangePassword: false } : prev))
      if (identityProfile?.role === 'ADMIN_CLINICA') {
        await refreshIdentityDirectory()
      }
      return { allowed: true }
    } catch (err) {
      return toPolicyFailure(err, 'No fue posible actualizar la contraseña en Identity.')
    }
  }

  const impersonateAccount = async (accountId: string): Promise<PolicyDecision> => {
    const target = snapshot.accounts.find((a) => a.id === accountId)
    if (!target) {
      return { allowed: false, code: 'NOT_FOUND', message: 'Cuenta demo no encontrada.' }
    }

    if (authMode === 'identity') {
      if (target.role === 'SUPER_ADMIN') {
        const res = await loginPlatform(target.email, target.demoPassword)
        return res.allowed ? { allowed: true } : res
      }
      const mockTenant = snapshot.tenants.find((t) => t.id === target.tenantId)
      const slug = mockTenant?.slug ?? 'clinica-norte'
      const res = await loginClinic(slug, target.email, target.demoPassword)
      return res.allowed ? { allowed: true } : res
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
    const provisioningRequestId = makeId('prov')
    const initialStatus = input.simulateIdentityFailure ? 'PENDIENTE_ADMIN' : 'ACTIVA'

    const statusHistory: ClinicTenant['statusHistory'] = [
      {
        id: makeId('evt'),
        fromStatus: null,
        toStatus: 'PENDIENTE_ADMIN',
        reason: `Registro de clínica iniciado (solicitud ${provisioningRequestId}).`,
        actorName: currentUser.fullName,
        occurredAtGmt6: timestamp,
      },
    ]

    if (!input.simulateIdentityFailure) {
      statusHistory.push({
        id: makeId('evt'),
        fromStatus: 'PENDIENTE_ADMIN',
        toStatus: 'ACTIVA',
        reason: `Identity confirmó ProvisionInitialClinicAdmin READY (${provisioningRequestId}).`,
        actorName: currentUser.fullName,
        occurredAtGmt6: timestamp,
      })
    } else {
      statusHistory.push({
        id: makeId('evt'),
        fromStatus: 'PENDIENTE_ADMIN',
        toStatus: 'PENDIENTE_ADMIN',
        reason: `Fallo o timeout en RPC ProvisionInitialClinicAdmin (${provisioningRequestId}); conservado en PENDIENTE_ADMIN para reintento idempotente.`,
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
      provisioningRequestId,
      provisioningStatus: input.simulateIdentityFailure ? 'FAILED' : 'READY',
      initialAdminName: input.initialAdminName.trim(),
      initialAdminEmail: emailNormalized,
      createdAtGmt6: timestamp,
      statusHistory,
    }

    // Identity crea y gestiona la credencial internamente; Platform nunca recibe contraseñas.
    const newAdminAccount: StaffAccount | null = input.simulateIdentityFailure
      ? null
      : {
          id: makeId('acc'),
          tenantId,
          fullName: input.initialAdminName.trim(),
          email: emailNormalized,
          demoPassword: 'Vital2026!',
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

  const completeInitialAdmin = (tenantId: string): PolicyDecision => {
    const tenant = snapshot.tenants.find((t) => t.id === tenantId)
    const decision = canCompleteInitialAdmin(currentUser, tenant)
    if (!decision.allowed || !currentUser || !tenant) return decision

    const timestamp = nowGmt6Iso()
    // Idempotencia RPC ProvisionInitialClinicAdmin: si ya existe admin inicial en Identity, no crea duplicado.
    const existingAdmin = snapshot.accounts.find(
      (a) =>
        a.tenantId === tenant.id &&
        (a.role === 'ADMIN_CLINICA' ||
          a.email.toLowerCase() === tenant.initialAdminEmail.toLowerCase()),
    )

    const createdAdmin: StaffAccount | null = existingAdmin
      ? null
      : {
          id: makeId('acc'),
          tenantId: tenant.id,
          fullName: tenant.initialAdminName,
          email: tenant.initialAdminEmail,
          demoPassword: 'Vital2026!',
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
              provisioningStatus: 'READY',
              statusHistory: [
                ...t.statusHistory,
                {
                  id: makeId('evt'),
                  fromStatus: 'PENDIENTE_ADMIN',
                  toStatus: 'ACTIVA',
                  reason: `Reintento idempotente exitoso (${t.provisioningRequestId}): Identity devolvió READY.`,
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
    const decision = canChangeClinicStatus(currentUser, tenant, targetStatus, reason)
    if (!decision.allowed || !currentUser || !tenant) return decision

    const timestamp = nowGmt6Iso()
    const cleanReason =
      reason.trim() || 'Reactivación administrativa desde Platform.'

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

  const createStaff = async (input: CreateStaffInput): Promise<CreateStaffResult> => {
    if (authMode === 'identity') {
      try {
        const generateTemp = Boolean(input.generateTemporaryPassword)
        const result = await identityClient.createStaff({
          fullName: input.fullName,
          email: input.email,
          password: generateTemp ? undefined : input.demoPassword,
          generateTemporaryPassword: generateTemp,
          role: input.role,
          specialty: input.specialty,
          licenseCode: input.licenseCode,
          title: input.title,
          permissions: input.permissions,
        })
        await refreshIdentityDirectory()
        return { allowed: true, temporaryPassword: result.temporaryPassword }
      } catch (err) {
        return toPolicyFailure(err, 'No fue posible registrar el integrante en Identity.')
      }
    }

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
    return { allowed: true, temporaryPassword: null }
  }

  const updateStaffRoleAndPermissions = async (input: UpdateRoleInput): Promise<PolicyDecision> => {
    if (authMode === 'identity') {
      try {
        await identityClient.updateStaffRole(input.accountId, {
          role: input.role,
          licenseCode: input.licenseCode,
          title: input.title,
          canPrescribe: input.canPrescribe,
          canRegisterPatients: input.canRegisterPatients,
          canAssignInitialPrimary: input.canAssignInitialPrimary,
          canUploadStudies: input.canUploadStudies,
        })
        await refreshIdentityDirectory()
        return { allowed: true }
      } catch (err) {
        return toPolicyFailure(err, 'No fue posible actualizar el rol en Identity.')
      }
    }

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

  const toggleStaffActive = async (accountId: string): Promise<PolicyDecision> => {
    if (authMode === 'identity') {
      const targetMember = identityDirectory?.accounts.find((a) => a.id === accountId)
      if (!targetMember) {
        return { allowed: false, code: 'NOT_FOUND', message: 'Cuenta no encontrada en el directorio.' }
      }
      try {
        await identityClient.updateStaffStatus(accountId, !targetMember.active)
        await refreshIdentityDirectory()
        return { allowed: true }
      } catch (err) {
        return toPolicyFailure(err, 'No fue posible actualizar el estado de la cuenta en Identity.')
      }
    }

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

  const updateAuxiliaryLinks = async (
    auxiliaryId: string,
    specialistIds: string[],
  ): Promise<PolicyDecision> => {
    if (authMode === 'identity') {
      try {
        await identityClient.updateAuxiliaryLinks(auxiliaryId, specialistIds)
        await refreshIdentityDirectory()
        return { allowed: true }
      } catch (err) {
        return toPolicyFailure(err, 'No fue posible actualizar vínculos en Identity.')
      }
    }

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

  const createPatientWithRecord = (
    input: CreatePatientWithRecordInput,
  ): CreatePatientResult => {
    const nowIso = nowGmt6Iso()
    const access = evaluateObjectAccess({
      actor: currentUser,
      tenant: currentTenant,
      operation: 'PATIENT_CREATE',
      grants: snapshot.grants,
      nowIsoGmt6: nowIso,
    })
    if (!access.allowed || !currentUser || !currentTenant) {
      return access as { allowed: false; code: string; message: string }
    }

    const cleanName = input.fullName.trim()
    const cleanPhone = input.phone.trim()
    if (!cleanName || !input.birthDateGmt6 || !cleanPhone) {
      return {
        allowed: false,
        code: 'INVALID_PATIENT_DATA',
        message: 'Nombre completo, fecha de nacimiento y teléfono son obligatorios.',
      }
    }

    const possibleDuplicate = snapshot.patients.find(
      (p) =>
        p.tenantId === currentTenant.id &&
        p.fullName.trim().toLowerCase() === cleanName.toLowerCase() &&
        p.birthDateGmt6 === input.birthDateGmt6,
    )
    if (possibleDuplicate && !input.allowDuplicateOverride) {
      return {
        allowed: false,
        code: 'POSSIBLE_DUPLICATE',
        message: `Ya existe un registro en esta clínica con nombre y fecha de nacimiento coincidentes (${possibleDuplicate.patientCode}). Confirma si realmente deseas registrar otro expediente.`,
      }
    }

    const canAssignInitial =
      currentUser.role === 'ADMIN_CLINICA' ||
      (currentUser.role === 'AUXILIAR' && currentUser.permissions.canAssignInitialPrimary)

    let chosenPrimaryId: string | null = null
    if (input.primarySpecialistId) {
      if (!canAssignInitial) {
        return {
          allowed: false,
          code: 'FORBIDDEN_INITIAL_ASSIGN',
          message: 'Tu cuenta puede registrar al paciente, pero no asignar responsable principal inicial (CU-02).',
        }
      }
      const spec = snapshot.accounts.find((a) => a.id === input.primarySpecialistId)
      if (!spec || spec.tenantId !== currentTenant.id || spec.role !== 'ESPECIALISTA' || !spec.active) {
        return {
          allowed: false,
          code: 'INVALID_SPECIALIST',
          message: 'El especialista seleccionado no está activo en esta clínica.',
        }
      }
      chosenPrimaryId = spec.id
    }

    const birthYear = Number(input.birthDateGmt6.slice(0, 4)) || 2000
    const tenantPatientCount = snapshot.patients.filter((p) => p.tenantId === currentTenant.id).length
    const patientCode = `PAT-${String(101 + tenantPatientCount + 1).padStart(4, '0')}`
    const patientId = makeId('pat')
    const recordId = makeId('rec')

    const newPatient: PatientAdminRecord = {
      id: patientId,
      tenantId: currentTenant.id,
      patientCode,
      fullName: cleanName,
      birthDateGmt6: input.birthDateGmt6,
      birthYear,
      phone: cleanPhone,
      email: input.email?.trim() || undefined,
      emergencyContact: input.emergencyContact?.trim() || undefined,
      registeredByAccountId: currentUser.id,
      registeredByName: currentUser.fullName,
      createdAtGmt6: nowIso,
      updatedAtGmt6: nowIso,
    }

    const newRecord: ClinicalRecord = {
      id: recordId,
      tenantId: currentTenant.id,
      patientId,
      primarySpecialistId: chosenPrimaryId,
      treatingSpecialistIds: [],
      assignmentHistory: chosenPrimaryId
        ? [
            {
              id: makeId('asg'),
              type: 'INITIAL_PRIMARY',
              previousSpecialistId: null,
              nextSpecialistId: chosenPrimaryId,
              actorName: currentUser.fullName,
              occurredAtGmt6: nowIso,
              note: 'Asignación principal inicial durante alta conjunta CU-01/CU-02.',
            },
          ]
        : [],
      criticalAllergies: ['Pendiente de valoración clínica inicial'],
      chronicConditions: [],
      notesPreview: [],
    }

    setSnapshot((prev) => ({
      ...prev,
      patients: [newPatient, ...prev.patients],
      records: [newRecord, ...prev.records],
    }))
    return { allowed: true, patientId, recordId, patientCode }
  }

  const updatePatientAdminData = (input: UpdatePatientAdminInput): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const patient = snapshot.patients.find((p) => p.id === input.patientId)
    const record = snapshot.records.find((r) => r.patientId === input.patientId)
    const access = evaluateObjectAccess({
      actor: currentUser,
      tenant: currentTenant,
      patient,
      record,
      operation: 'PATIENT_ADMIN_UPDATE',
      grants: snapshot.grants,
      nowIsoGmt6: nowIso,
    })
    if (!access.allowed || !patient) return access

    if (!input.fullName.trim() || !input.birthDateGmt6 || !input.phone.trim()) {
      return {
        allowed: false,
        code: 'INVALID_PATIENT_DATA',
        message: 'Nombre, fecha de nacimiento y teléfono son obligatorios.',
      }
    }

    const birthYear = Number(input.birthDateGmt6.slice(0, 4)) || patient.birthYear
    setSnapshot((prev) => ({
      ...prev,
      patients: prev.patients.map((p) =>
        p.id === patient.id
          ? {
              ...p,
              fullName: input.fullName.trim(),
              birthDateGmt6: input.birthDateGmt6,
              birthYear,
              phone: input.phone.trim(),
              email: input.email?.trim() || undefined,
              emergencyContact: input.emergencyContact?.trim() || undefined,
              updatedAtGmt6: nowIso,
            }
          : p,
      ),
    }))
    return { allowed: true }
  }

  const assignInitialPrimarySpecialist = (
    recordId: string,
    specialistId: string,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const record = snapshot.records.find((r) => r.id === recordId)
    const patient = record ? snapshot.patients.find((p) => p.id === record.patientId) : undefined
    const access = evaluateObjectAccess({
      actor: currentUser,
      tenant: currentTenant,
      patient,
      record,
      operation: 'RECORD_ASSIGN_INITIAL_PRIMARY',
      grants: snapshot.grants,
      nowIsoGmt6: nowIso,
    })
    if (!access.allowed || !record || !currentUser || !currentTenant) return access

    const spec = snapshot.accounts.find((a) => a.id === specialistId)
    if (!spec || spec.tenantId !== currentTenant.id || spec.role !== 'ESPECIALISTA' || !spec.active) {
      return {
        allowed: false,
        code: 'INVALID_SPECIALIST',
        message: 'Selecciona un especialista activo perteneciente a esta clínica.',
      }
    }

    setSnapshot((prev) => ({
      ...prev,
      records: prev.records.map((r) =>
        r.id === record.id
          ? {
              ...r,
              primarySpecialistId: spec.id,
              treatingSpecialistIds: r.treatingSpecialistIds.filter((id) => id !== spec.id),
              assignmentHistory: [
                {
                  id: makeId('asg'),
                  type: 'INITIAL_PRIMARY',
                  previousSpecialistId: null,
                  nextSpecialistId: spec.id,
                  actorName: currentUser.fullName,
                  occurredAtGmt6: nowIso,
                  note: 'Asignación inicial posterior de responsable principal (CU-02).',
                },
                ...r.assignmentHistory,
              ],
            }
          : r,
      ),
    }))
    return { allowed: true }
  }

  const reassignPrimarySpecialist = (
    recordId: string,
    nextSpecialistId: string,
    note: string,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const record = snapshot.records.find((r) => r.id === recordId)
    const patient = record ? snapshot.patients.find((p) => p.id === record.patientId) : undefined
    const access = evaluateObjectAccess({
      actor: currentUser,
      tenant: currentTenant,
      patient,
      record,
      operation: 'RECORD_REASSIGN_PRIMARY',
      grants: snapshot.grants,
      nowIsoGmt6: nowIso,
    })
    if (!access.allowed || !record || !currentUser || !currentTenant) return access

    if (nextSpecialistId === record.primarySpecialistId) {
      return {
        allowed: false,
        code: 'SAME_SPECIALIST',
        message: 'El nuevo responsable principal debe ser distinto al vigente (CU-24 A2).',
      }
    }
    const spec = snapshot.accounts.find((a) => a.id === nextSpecialistId)
    if (!spec || spec.tenantId !== currentTenant.id || spec.role !== 'ESPECIALISTA' || !spec.active) {
      return {
        allowed: false,
        code: 'INVALID_SPECIALIST',
        message: 'El nuevo especialista no existe o no está activo en esta clínica.',
      }
    }

    setSnapshot((prev) => ({
      ...prev,
      records: prev.records.map((r) =>
        r.id === record.id
          ? {
              ...r,
              primarySpecialistId: spec.id,
              treatingSpecialistIds: r.treatingSpecialistIds.filter((id) => id !== spec.id),
              assignmentHistory: [
                {
                  id: makeId('asg'),
                  type: 'REASSIGN_PRIMARY',
                  previousSpecialistId: r.primarySpecialistId,
                  nextSpecialistId: spec.id,
                  actorName: currentUser.fullName,
                  occurredAtGmt6: nowIso,
                  note:
                    note.trim() ||
                    'Reasignación administrativa de responsable principal (CU-24 candidato).',
                },
                ...r.assignmentHistory,
              ],
            }
          : r,
      ),
    }))
    return { allowed: true }
  }

  const addTreatingSpecialist = (recordId: string, specialistId: string): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const record = snapshot.records.find((r) => r.id === recordId)
    const patient = record ? snapshot.patients.find((p) => p.id === record.patientId) : undefined
    const access = evaluateObjectAccess({
      actor: currentUser,
      tenant: currentTenant,
      patient,
      record,
      operation: 'RECORD_MANAGE_TREATING',
      grants: snapshot.grants,
      nowIsoGmt6: nowIso,
    })
    if (!access.allowed || !record || !currentUser || !currentTenant) return access

    if (record.primarySpecialistId === specialistId) {
      return {
        allowed: false,
        code: 'ALREADY_PRIMARY',
        message: 'Ese profesional ya es el responsable principal vigente del expediente.',
      }
    }
    if (record.treatingSpecialistIds.includes(specialistId)) {
      return {
        allowed: false,
        code: 'ALREADY_TREATING',
        message: 'Ese especialista ya está vinculado como tratante adicional.',
      }
    }
    const spec = snapshot.accounts.find((a) => a.id === specialistId)
    if (!spec || spec.tenantId !== currentTenant.id || spec.role !== 'ESPECIALISTA' || !spec.active) {
      return {
        allowed: false,
        code: 'INVALID_SPECIALIST',
        message: 'Selecciona un especialista activo dentro de la misma clínica.',
      }
    }

    setSnapshot((prev) => ({
      ...prev,
      records: prev.records.map((r) =>
        r.id === record.id
          ? {
              ...r,
              treatingSpecialistIds: [...r.treatingSpecialistIds, spec.id],
              assignmentHistory: [
                {
                  id: makeId('asg'),
                  type: 'ADD_TREATING',
                  previousSpecialistId: null,
                  nextSpecialistId: spec.id,
                  actorName: currentUser.fullName,
                  occurredAtGmt6: nowIso,
                  note: 'Vinculación de especialista tratante adicional (CU-02 / PC-02).',
                },
                ...r.assignmentHistory,
              ],
            }
          : r,
      ),
    }))
    return { allowed: true }
  }

  const removeTreatingSpecialist = (recordId: string, specialistId: string): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const record = snapshot.records.find((r) => r.id === recordId)
    const patient = record ? snapshot.patients.find((p) => p.id === record.patientId) : undefined
    const access = evaluateObjectAccess({
      actor: currentUser,
      tenant: currentTenant,
      patient,
      record,
      operation: 'RECORD_MANAGE_TREATING',
      grants: snapshot.grants,
      nowIsoGmt6: nowIso,
    })
    if (!access.allowed || !record || !currentUser) return access

    if (!record.treatingSpecialistIds.includes(specialistId)) {
      return {
        allowed: false,
        code: 'NOT_TREATING',
        message: 'El especialista indicado no figura como tratante adicional vigente.',
      }
    }

    setSnapshot((prev) => ({
      ...prev,
      records: prev.records.map((r) =>
        r.id === record.id
          ? {
              ...r,
              treatingSpecialistIds: r.treatingSpecialistIds.filter((id) => id !== specialistId),
              assignmentHistory: [
                {
                  id: makeId('asg'),
                  type: 'REMOVE_TREATING',
                  previousSpecialistId: specialistId,
                  nextSpecialistId: null,
                  actorName: currentUser.fullName,
                  occurredAtGmt6: nowIso,
                  note: 'Desvinculación de especialista tratante adicional sin borrar autoría (CU-02 / PC-02).',
                },
                ...r.assignmentHistory,
              ],
            }
          : r,
      ),
    }))
    return { allowed: true }
  }

  const requestExceptionalAccess = (input: RequestExceptionalAccessInput): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const patient = snapshot.patients.find((p) => p.id === input.patientId)
    const record = snapshot.records.find((r) => r.patientId === input.patientId)
    const decision = canCreateExceptionalRequest(
      currentUser,
      patient,
      record,
      input.operations,
      input.reason,
      input.requestedMonths,
      snapshot.grants,
    )
    if (!decision.allowed || !currentUser || !patient || !currentTenant) return decision

    const newGrant: ExceptionalAccessGrant = {
      id: makeId('grant'),
      tenantId: currentTenant.id,
      requesterAccountId: currentUser.id,
      requesterName: currentUser.fullName,
      patientId: patient.id,
      patientCode: patient.patientCode,
      patientFullName: patient.fullName,
      patientBirthYear: patient.birthYear,
      requestedOperations: [...input.operations],
      approvedOperations: [],
      reason: input.reason.trim(),
      requestedMonths: input.requestedMonths,
      approvedMonths: null,
      status: 'PENDIENTE',
      requestedAtGmt6: nowIso,
      resolvedByName: null,
      resolvedAtGmt6: null,
      resolutionNote: null,
      expiresAtGmt6: null,
      revokedByName: null,
      revokedAtGmt6: null,
    }

    setSnapshot((prev) => ({
      ...prev,
      grants: [newGrant, ...prev.grants],
    }))
    return { allowed: true }
  }

  const resolveExceptionalAccess = (
    grantId: string,
    decisionType: 'APROBAR' | 'RECHAZAR',
    approvedOperations: ExceptionalOperation[],
    approvedMonths: number,
    resolutionNote: string,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const grant = snapshot.grants.find((g) => g.id === grantId)
    const check = canResolveExceptionalRequest(
      currentUser,
      grant,
      decisionType,
      approvedOperations,
      approvedMonths,
    )
    if (!check.allowed || !currentUser || !grant) return check

    const expiresAtGmt6 =
      decisionType === 'APROBAR' ? addMonthsGmt6Iso(nowIso, approvedMonths) : null

    setSnapshot((prev) => ({
      ...prev,
      grants: prev.grants.map((g) =>
        g.id === grant.id
          ? {
              ...g,
              status: decisionType === 'APROBAR' ? 'APROBADA' : 'RECHAZADA',
              approvedOperations: decisionType === 'APROBAR' ? [...approvedOperations] : [],
              approvedMonths: decisionType === 'APROBAR' ? approvedMonths : null,
              resolvedByName: currentUser.fullName,
              resolvedAtGmt6: nowIso,
              resolutionNote: resolutionNote.trim() || null,
              expiresAtGmt6,
            }
          : g,
      ),
    }))
    return { allowed: true }
  }

  const revokeExceptionalAccess = (grantId: string): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const grant = snapshot.grants.find((g) => g.id === grantId)
    const check = canRevokeExceptionalGrant(currentUser, grant, nowIso)
    if (!check.allowed || !currentUser || !grant) return check

    setSnapshot((prev) => ({
      ...prev,
      grants: prev.grants.map((g) =>
        g.id === grant.id
          ? {
              ...g,
              status: 'REVOCADA',
              revokedByName: currentUser.fullName,
              revokedAtGmt6: nowIso,
            }
          : g,
      ),
    }))
    return { allowed: true }
  }

  const createAppointment = (input: CreateAppointmentInput): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const patient = snapshot.patients.find((p) => p.id === input.patientId)
    const record = snapshot.records.find((r) => r.patientId === input.patientId)
    const specialist = snapshot.accounts.find((a) => a.id === input.specialistId)
    const decision = canScheduleAppointment(
      currentUser,
      currentTenant,
      patient,
      record,
      specialist,
      input.scheduledStartGmt6,
      input.durationMinutes,
      input.reason,
      snapshot.appointments,
      snapshot.grants,
      nowIso,
    )
    if (!decision.allowed || !currentUser || !currentTenant || !patient || !specialist) {
      return decision
    }

    const effectiveDay = resolveEffectiveDayScheduleMock(
      input.scheduledStartGmt6.slice(0, 10),
      specialist.id,
      currentTenant.id,
      snapshot.specialistSchedules,
      snapshot.clinicSchedules,
      snapshot.scheduleExceptions,
    )
    const fitsCheck = validateAppointmentFitsScheduleMock(
      input.scheduledStartGmt6,
      input.durationMinutes,
      effectiveDay,
    )
    if (!fitsCheck.allowed) return fitsCheck

    const newApt: Appointment = {
      id: makeId('apt'),
      tenantId: currentTenant.id,
      patientId: patient.id,
      specialistId: specialist.id,
      scheduledStartGmt6: input.scheduledStartGmt6,
      durationMinutes: input.durationMinutes,
      reason: input.reason.trim(),
      status: 'PROGRAMADA',
      createdByName: currentUser.fullName,
      createdAtGmt6: nowIso,
      updatedAtGmt6: nowIso,
    }
    setSnapshot((prev) => ({ ...prev, appointments: [newApt, ...prev.appointments] }))
    return { allowed: true }
  }

  const rescheduleAppointment = (
    appointmentId: string,
    scheduledStartGmt6: string,
    durationMinutes: number,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const apt = snapshot.appointments.find((a) => a.id === appointmentId)
    if (!apt) return { allowed: false, code: 'NOT_FOUND', message: 'Cita no encontrada.' }
    if (apt.status === 'CANCELADA' || apt.status === 'COMPLETADA' || apt.status === 'NO_ASISTIO') {
      return {
        allowed: false,
        code: 'APPOINTMENT_CLOSED',
        message: `No es posible reprogramar una cita en estado ${apt.status}.`,
      }
    }
    const patient = snapshot.patients.find((p) => p.id === apt.patientId)
    const record = snapshot.records.find((r) => r.patientId === apt.patientId)
    const specialist = snapshot.accounts.find((a) => a.id === apt.specialistId)
    const decision = canScheduleAppointment(
      currentUser,
      currentTenant,
      patient,
      record,
      specialist,
      scheduledStartGmt6,
      durationMinutes,
      apt.reason,
      snapshot.appointments,
      snapshot.grants,
      nowIso,
      apt.id,
    )
    if (!decision.allowed || !currentTenant) return decision

    const effectiveDay = resolveEffectiveDayScheduleMock(
      scheduledStartGmt6.slice(0, 10),
      apt.specialistId,
      currentTenant.id,
      snapshot.specialistSchedules,
      snapshot.clinicSchedules,
      snapshot.scheduleExceptions,
    )
    const fitsCheck = validateAppointmentFitsScheduleMock(
      scheduledStartGmt6,
      durationMinutes,
      effectiveDay,
    )
    if (!fitsCheck.allowed) return fitsCheck

    setSnapshot((prev) => ({
      ...prev,
      appointments: prev.appointments.map((item) =>
        item.id === apt.id
          ? { ...item, scheduledStartGmt6, durationMinutes, updatedAtGmt6: nowIso }
          : item,
      ),
    }))
    return { allowed: true }
  }

  const transitionAppointmentStatus = (
    appointmentId: string,
    nextStatus: AppointmentStatus,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const apt = snapshot.appointments.find((a) => a.id === appointmentId)
    if (!apt || !currentUser || apt.tenantId !== currentTenant?.id) {
      return { allowed: false, code: 'NOT_FOUND', message: 'Cita no localizada en la clínica.' }
    }
    if (currentUser.role !== 'ADMIN_CLINICA' && currentUser.role !== 'AUXILIAR') {
      return {
        allowed: false,
        code: 'FORBIDDEN_AGENDA',
        message: 'Solo personal administrativo autorizado actualiza estados de agenda.',
      }
    }
    const check = canTransitionAppointmentStatus(apt.status, nextStatus)
    if (!check.allowed) return check

    setSnapshot((prev) => ({
      ...prev,
      appointments: prev.appointments.map((item) =>
        item.id === apt.id ? { ...item, status: nextStatus, updatedAtGmt6: nowIso } : item,
      ),
    }))
    return { allowed: true }
  }

  const updateClinicSchedule = (slots: ScheduleTimeSlot[]): SchedulePolicyDecision => {
    if (!currentUser || !currentTenant || currentUser.role !== 'ADMIN_CLINICA') {
      return {
        allowed: false,
        code: 'FORBIDDEN_SCHEDULE_ROLE',
        message: 'Solo AdminClinica edita el horario general de la clínica.',
      }
    }
    const validation = validateWeeklySlotsMock(slots)
    if (!validation.allowed) return validation

    const candidateClinic: ClinicScheduleConfig = {
      tenantId: currentTenant.id,
      configured: true,
      slots,
      updatedByName: currentUser.fullName,
      updatedAtGmt6: nowGmt6Iso(),
    }
    const otherClinicSchedules = snapshot.clinicSchedules.filter(
      (c) => c.tenantId !== currentTenant.id,
    )
    const customSpecIds = new Set(
      snapshot.specialistSchedules
        .filter((s) => s.tenantId === currentTenant.id && !s.useClinicFallback)
        .map((s) => s.specialistId),
    )
    const affectedApts = snapshot.appointments.filter(
      (a) => a.tenantId === currentTenant.id && !customSpecIds.has(a.specialistId),
    )
    const conflictCheck = validateScheduleChangeAgainstAppointmentsMock(
      affectedApts,
      (apt, dateGmt6) =>
        resolveEffectiveDayScheduleMock(
          dateGmt6,
          apt.specialistId,
          currentTenant.id,
          [],
          [...otherClinicSchedules, candidateClinic],
          snapshot.scheduleExceptions,
        ),
    )
    if (!conflictCheck.allowed) return conflictCheck

    setSnapshot((prev) => ({
      ...prev,
      clinicSchedules: [...otherClinicSchedules, candidateClinic],
    }))
    return { allowed: true }
  }

  const updateSpecialistSchedule = (
    specialistId: string,
    useClinicFallback: boolean,
    slots: ScheduleTimeSlot[],
  ): SchedulePolicyDecision => {
    if (!currentUser || !currentTenant) {
      return { allowed: false, code: 'UNAUTHENTICATED', message: 'Sesión requerida.' }
    }
    if (
      currentUser.role !== 'ADMIN_CLINICA' &&
      !(currentUser.role === 'ESPECIALISTA' && currentUser.id === specialistId)
    ) {
      return {
        allowed: false,
        code: 'FORBIDDEN_SCHEDULE_SCOPE',
        message: 'Solo AdminClinica o el propio especialista editan este horario.',
      }
    }

    if (!useClinicFallback) {
      const validation = validateWeeklySlotsMock(slots)
      if (!validation.allowed) return validation
    }

    const candidateSpec: SpecialistScheduleConfig = {
      tenantId: currentTenant.id,
      specialistId,
      useClinicFallback,
      ownSlots: useClinicFallback ? [] : slots,
      updatedByName: currentUser.fullName,
      updatedAtGmt6: nowGmt6Iso(),
    }
    const others = snapshot.specialistSchedules.filter(
      (s) => !(s.tenantId === currentTenant.id && s.specialistId === specialistId),
    )
    const specApts = snapshot.appointments.filter(
      (a) => a.tenantId === currentTenant.id && a.specialistId === specialistId,
    )
    const conflictCheck = validateScheduleChangeAgainstAppointmentsMock(
      specApts,
      (_, dateGmt6) =>
        resolveEffectiveDayScheduleMock(
          dateGmt6,
          specialistId,
          currentTenant.id,
          [...others, candidateSpec],
          snapshot.clinicSchedules,
          snapshot.scheduleExceptions,
        ),
    )
    if (!conflictCheck.allowed) return conflictCheck

    setSnapshot((prev) => ({
      ...prev,
      specialistSchedules: [...others, candidateSpec],
    }))
    return { allowed: true }
  }

  const upsertSpecialistException = (input: {
    specialistId: string
    dateGmt6: string
    isUnavailable: boolean
    customStartTime: string | null
    customEndTime: string | null
    reason: string
  }): SchedulePolicyDecision => {
    if (!currentUser || !currentTenant) {
      return { allowed: false, code: 'UNAUTHENTICATED', message: 'Sesión requerida.' }
    }
    if (
      currentUser.role !== 'ADMIN_CLINICA' &&
      !(currentUser.role === 'ESPECIALISTA' && currentUser.id === input.specialistId)
    ) {
      return {
        allowed: false,
        code: 'FORBIDDEN_SCHEDULE_SCOPE',
        message: 'Solo AdminClinica o el propio especialista registran excepciones.',
      }
    }
    if (!input.reason.trim()) {
      return {
        allowed: false,
        code: 'INVALID_SCHEDULE_EXCEPTION',
        message: 'El motivo de la excepción es obligatorio.',
      }
    }
    const nowIso = nowGmt6Iso()
    if (input.dateGmt6 < nowIso.slice(0, 10)) {
      return {
        allowed: false,
        code: 'PAST_SCHEDULE_NOT_ALLOWED',
        message: 'No se permiten excepciones en fechas pasadas (GMT-6).',
      }
    }
    if (!input.isUnavailable) {
      if (
        !input.customStartTime ||
        !input.customEndTime ||
        input.customEndTime <= input.customStartTime
      ) {
        return {
          allowed: false,
          code: 'INVALID_SCHEDULE_BLOCK',
          message: 'Indica hora de inicio y fin válidas para la jornada especial.',
        }
      }
    }

    const existing = snapshot.scheduleExceptions.find(
      (e) =>
        e.tenantId === currentTenant.id &&
        e.specialistId === input.specialistId &&
        e.dateGmt6 === input.dateGmt6,
    )
    const nextException: SpecialistScheduleException = {
      id: existing?.id ?? makeId('ex'),
      tenantId: currentTenant.id,
      specialistId: input.specialistId,
      dateGmt6: input.dateGmt6,
      isUnavailable: input.isUnavailable,
      customStartTime: input.isUnavailable ? null : input.customStartTime,
      customEndTime: input.isUnavailable ? null : input.customEndTime,
      reason: input.reason.trim(),
      createdByName: currentUser.fullName,
      updatedAtGmt6: nowIso,
    }
    const others = snapshot.scheduleExceptions.filter(
      (e) =>
        !(
          e.tenantId === currentTenant.id &&
          e.specialistId === input.specialistId &&
          e.dateGmt6 === input.dateGmt6
        ),
    )
    const dayApts = snapshot.appointments.filter(
      (a) =>
        a.tenantId === currentTenant.id &&
        a.specialistId === input.specialistId &&
        a.scheduledStartGmt6.slice(0, 10) === input.dateGmt6,
    )
    const conflictCheck = validateScheduleChangeAgainstAppointmentsMock(
      dayApts,
      (_, dateGmt6) =>
        resolveEffectiveDayScheduleMock(
          dateGmt6,
          input.specialistId,
          currentTenant.id,
          snapshot.specialistSchedules,
          snapshot.clinicSchedules,
          [...others, nextException],
        ),
    )
    if (!conflictCheck.allowed) return conflictCheck

    setSnapshot((prev) => ({
      ...prev,
      scheduleExceptions: [...others, nextException],
    }))
    return { allowed: true }
  }

  const deleteSpecialistException = (
    specialistId: string,
    exceptionId: string,
  ): SchedulePolicyDecision => {
    if (!currentUser || !currentTenant) {
      return { allowed: false, code: 'UNAUTHENTICATED', message: 'Sesión requerida.' }
    }
    if (
      currentUser.role !== 'ADMIN_CLINICA' &&
      !(currentUser.role === 'ESPECIALISTA' && currentUser.id === specialistId)
    ) {
      return {
        allowed: false,
        code: 'FORBIDDEN_SCHEDULE_SCOPE',
        message: 'Solo AdminClinica o el propio especialista eliminan excepciones.',
      }
    }
    const target = snapshot.scheduleExceptions.find(
      (e) =>
        e.id === exceptionId &&
        e.tenantId === currentTenant.id &&
        e.specialistId === specialistId,
    )
    if (!target) {
      return { allowed: false, code: 'NOT_FOUND', message: 'Excepción no encontrada.' }
    }
    const remaining = snapshot.scheduleExceptions.filter((e) => e.id !== exceptionId)
    const dayApts = snapshot.appointments.filter(
      (a) =>
        a.tenantId === currentTenant.id &&
        a.specialistId === specialistId &&
        a.scheduledStartGmt6.slice(0, 10) === target.dateGmt6,
    )
    const conflictCheck = validateScheduleChangeAgainstAppointmentsMock(
      dayApts,
      (_, dateGmt6) =>
        resolveEffectiveDayScheduleMock(
          dateGmt6,
          specialistId,
          currentTenant.id,
          snapshot.specialistSchedules,
          snapshot.clinicSchedules,
          remaining,
        ),
    )
    if (!conflictCheck.allowed) return conflictCheck

    setSnapshot((prev) => ({
      ...prev,
      scheduleExceptions: remaining,
    }))
    return { allowed: true }
  }

  const getMockSpecialistAvailability = (
    specialistId: string,
    dateGmt6: string,
    durationMinutes = 30,
  ) => {
    if (!currentTenant) return null
    return computeMockAvailability(
      dateGmt6,
      specialistId,
      currentTenant.id,
      durationMinutes,
      snapshot.clinicSchedules,
      snapshot.specialistSchedules,
      snapshot.scheduleExceptions,
      snapshot.appointments,
    )
  }

  const createPreparation = (input: SavePreparationInput): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const patient = snapshot.patients.find((p) => p.id === input.patientId)
    const record = snapshot.records.find((r) => r.id === input.recordId)
    const decision = canCreatePreparation(
      currentUser,
      currentTenant,
      patient,
      record,
      snapshot.grants,
      nowIso,
    )
    if (!decision.allowed || !currentUser || !currentTenant || !patient || !record) {
      return decision
    }

    const newPrep: PreliminaryPreparation = {
      id: makeId('prep'),
      tenantId: currentTenant.id,
      recordId: record.id,
      patientId: patient.id,
      encounterId: null,
      status: 'PENDIENTE_REVISION',
      declaredAllergies: input.declaredAllergies.trim(),
      declaredConditions: input.declaredConditions.trim(),
      vitals: { ...input.vitals },
      authorAccountId: currentUser.id,
      authorName: currentUser.fullName,
      recordedAtGmt6: nowIso,
      updatedAtGmt6: nowIso,
      reviewedByName: null,
      reviewedAtGmt6: null,
      addenda: [],
    }
    setSnapshot((prev) => ({ ...prev, preparations: [newPrep, ...prev.preparations] }))
    return { allowed: true }
  }

  const updatePreparation = (
    preparationId: string,
    input: SavePreparationInput,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const prep = snapshot.preparations.find((p) => p.id === preparationId)
    const check = canEditPreparation(currentUser, prep)
    if (!check.allowed || !prep) return check

    setSnapshot((prev) => ({
      ...prev,
      preparations: prev.preparations.map((item) =>
        item.id === prep.id
          ? {
              ...item,
              declaredAllergies: input.declaredAllergies.trim(),
              declaredConditions: input.declaredConditions.trim(),
              vitals: { ...input.vitals },
              updatedAtGmt6: nowIso,
            }
          : item,
      ),
    }))
    return { allowed: true }
  }

  const appendPreparationAddendum = (
    preparationId: string,
    reason: string,
    detail: string,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const prep = snapshot.preparations.find((p) => p.id === preparationId)
    const patient = prep ? snapshot.patients.find((p) => p.id === prep.patientId) : undefined
    const record = prep ? snapshot.records.find((r) => r.id === prep.recordId) : undefined
    const check = canAppendPreparationAddendum(
      currentUser,
      currentTenant,
      patient,
      record,
      prep,
      reason,
      detail,
      snapshot.grants,
      nowIso,
    )
    if (!check.allowed || !currentUser || !prep) return check

    setSnapshot((prev) => ({
      ...prev,
      preparations: prev.preparations.map((item) =>
        item.id === prep.id
          ? {
              ...item,
              addenda: [
                ...item.addenda,
                {
                  id: makeId('add'),
                  authorAccountId: currentUser.id,
                  authorName: currentUser.fullName,
                  occurredAtGmt6: nowIso,
                  reason: reason.trim(),
                  detail: detail.trim(),
                },
              ],
            }
          : item,
      ),
    }))
    return { allowed: true }
  }

  const startEncounter = (input: StartEncounterInput): StartEncounterResult => {
    const nowIso = nowGmt6Iso()
    const record = snapshot.records.find((r) => r.id === input.recordId)
    const patient = record ? snapshot.patients.find((p) => p.id === record.patientId) : undefined
    const access = evaluateObjectAccess({
      actor: currentUser,
      tenant: currentTenant,
      patient,
      record,
      operation: 'CLINICAL_RECORD_READ',
      grants: snapshot.grants,
      nowIsoGmt6: nowIso,
    })
    if (!access.allowed || !currentUser || !currentTenant || !record || !patient) {
      return access as { allowed: false; code: string; message: string }
    }
    if (!input.chiefComplaint.trim()) {
      return {
        allowed: false,
        code: 'CHIEF_COMPLAINT_REQUIRED',
        message: 'Ingresa el motivo o contexto de inicio de la atención (CU-03).',
      }
    }

    const encounterId = makeId('enc')
    const newEnc: ClinicalEncounter = {
      id: encounterId,
      tenantId: currentTenant.id,
      recordId: record.id,
      patientId: patient.id,
      appointmentId: input.appointmentId,
      specialistId: currentUser.id,
      specialistName: currentUser.fullName,
      specialty: currentUser.specialty ?? 'Medicina General',
      chiefComplaint: input.chiefComplaint.trim(),
      startedAtGmt6: nowIso,
      endedAtGmt6: null,
      encounterStatus: 'EN_CURSO',
      noteStatus: 'BORRADOR',
      noteContent: '',
      noteClosedAtGmt6: null,
      noteUpdatedAtGmt6: nowIso,
      noteAddenda: [],
      linkedPreparationIds: [],
      indications: [],
    }
    setSnapshot((prev) => ({ ...prev, encounters: [newEnc, ...prev.encounters] }))
    return { allowed: true, encounterId }
  }

  const incorporatePreparation = (
    encounterId: string,
    preparationId: string,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const encounter = snapshot.encounters.find((e) => e.id === encounterId)
    const prep = snapshot.preparations.find((p) => p.id === preparationId)
    const record = encounter ? snapshot.records.find((r) => r.id === encounter.recordId) : undefined
    const patient = encounter ? snapshot.patients.find((p) => p.id === encounter.patientId) : undefined

    const access = evaluateObjectAccess({
      actor: currentUser,
      tenant: currentTenant,
      patient,
      record,
      operation: 'CLINICAL_RECORD_READ',
      grants: snapshot.grants,
      nowIsoGmt6: nowIso,
    })
    if (!access.allowed || !currentUser || !encounter || !prep) {
      return access.allowed ? { allowed: false, code: 'NOT_FOUND', message: 'Atención o preparación no encontrada.' } : access
    }
    if (encounter.specialistId !== currentUser.id) {
      return { allowed: false, code: 'FORBIDDEN_AUTHOR', message: 'Solo el especialista de esta atención revisa la preparación.' }
    }
    if (prep.recordId !== encounter.recordId) {
      return { allowed: false, code: 'RECORD_MISMATCH', message: 'La preparación no pertenece a este expediente.' }
    }

    setSnapshot((prev) => ({
      ...prev,
      preparations: prev.preparations.map((item) =>
        item.id === prep.id
          ? {
              ...item,
              status: 'REVISADA',
              encounterId: encounter.id,
              reviewedByName: currentUser.fullName,
              reviewedAtGmt6: nowIso,
            }
          : item,
      ),
      encounters: prev.encounters.map((enc) =>
        enc.id === encounter.id && !enc.linkedPreparationIds.includes(prep.id)
          ? { ...enc, linkedPreparationIds: [...enc.linkedPreparationIds, prep.id] }
          : enc,
      ),
    }))
    return { allowed: true }
  }

  const saveEncounterDraft = (
    encounterId: string,
    chiefComplaint: string,
    noteContent: string,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const encounter = snapshot.encounters.find((e) => e.id === encounterId)
    const check = canEditOrCloseNote(currentUser, encounter, 'EDIT', noteContent)
    if (!check.allowed || !encounter) return check

    setSnapshot((prev) => ({
      ...prev,
      encounters: prev.encounters.map((item) =>
        item.id === encounter.id
          ? {
              ...item,
              chiefComplaint: chiefComplaint.trim() || item.chiefComplaint,
              noteContent,
              noteUpdatedAtGmt6: nowIso,
            }
          : item,
      ),
    }))
    return { allowed: true }
  }

  const finalizeEncounter = (encounterId: string): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const encounter = snapshot.encounters.find((e) => e.id === encounterId)
    const record = encounter ? snapshot.records.find((r) => r.id === encounter.recordId) : undefined
    const patient = encounter ? snapshot.patients.find((p) => p.id === encounter.patientId) : undefined
    const check = canFinalizeEncounter(
      currentUser,
      currentTenant,
      patient,
      record,
      encounter,
      nowIso,
      snapshot.grants,
      nowIso,
    )
    if (!check.allowed || !encounter) return check

    setSnapshot((prev) => ({
      ...prev,
      encounters: prev.encounters.map((item) =>
        item.id === encounter.id
          ? { ...item, encounterStatus: 'FINALIZADA', endedAtGmt6: nowIso }
          : item,
      ),
    }))
    return { allowed: true }
  }

  const closeEncounterNote = (encounterId: string, noteContent: string): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const encounter = snapshot.encounters.find((e) => e.id === encounterId)
    const check = canEditOrCloseNote(currentUser, encounter, 'CLOSE', noteContent)
    if (!check.allowed || !encounter) return check

    setSnapshot((prev) => ({
      ...prev,
      encounters: prev.encounters.map((item) =>
        item.id === encounter.id
          ? {
              ...item,
              noteContent: noteContent.trim(),
              noteStatus: 'CERRADA',
              noteClosedAtGmt6: nowIso,
              noteUpdatedAtGmt6: nowIso,
            }
          : item,
      ),
    }))
    return { allowed: true }
  }

  const appendClosedNoteAddendum = (
    encounterId: string,
    reason: string,
    detail: string,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const encounter = snapshot.encounters.find((e) => e.id === encounterId)
    const record = encounter ? snapshot.records.find((r) => r.id === encounter.recordId) : undefined
    const patient = encounter ? snapshot.patients.find((p) => p.id === encounter.patientId) : undefined
    const check = canAppendClosedNoteAddendum(
      currentUser,
      currentTenant,
      patient,
      record,
      encounter,
      reason,
      detail,
      snapshot.grants,
      nowIso,
    )
    if (!check.allowed || !currentUser || !encounter) return check

    setSnapshot((prev) => ({
      ...prev,
      encounters: prev.encounters.map((item) =>
        item.id === encounter.id
          ? {
              ...item,
              noteAddenda: [
                ...item.noteAddenda,
                {
                  id: makeId('add'),
                  authorAccountId: currentUser.id,
                  authorName: currentUser.fullName,
                  occurredAtGmt6: nowIso,
                  reason: reason.trim(),
                  detail: detail.trim(),
                },
              ],
            }
          : item,
      ),
    }))
    return { allowed: true }
  }

  const addEncounterIndication = (
    encounterId: string,
    kind: ClinicalIndication['kind'],
    text: string,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const encounter = snapshot.encounters.find((e) => e.id === encounterId)
    const record = encounter ? snapshot.records.find((r) => r.id === encounter.recordId) : undefined
    const patient = encounter ? snapshot.patients.find((p) => p.id === encounter.patientId) : undefined
    const access = evaluateObjectAccess({
      actor: currentUser,
      tenant: currentTenant,
      patient,
      record,
      operation: 'CLINICAL_RECORD_READ',
      grants: snapshot.grants,
      nowIsoGmt6: nowIso,
    })
    if (!access.allowed || !currentUser || !encounter) {
      return access.allowed ? { allowed: false, code: 'NOT_FOUND', message: 'Atención no encontrada.' } : access
    }
    if (!text.trim()) {
      return { allowed: false, code: 'INDICATION_REQUIRED', message: 'Escribe el detalle de la indicación.' }
    }

    setSnapshot((prev) => ({
      ...prev,
      encounters: prev.encounters.map((item) =>
        item.id === encounter.id
          ? {
              ...item,
              indications: [
                ...item.indications,
                {
                  id: makeId('ind'),
                  kind,
                  text: text.trim(),
                  authorAccountId: currentUser.id,
                  authorName: currentUser.fullName,
                  createdAtGmt6: nowIso,
                },
              ],
            }
          : item,
      ),
    }))
    return { allowed: true }
  }

  const addClinicalHistoryEntry = (
    recordId: string,
    category: ClinicalHistoryCategory,
    description: string,
    provenance: HistoryProvenance,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const record = snapshot.records.find((r) => r.id === recordId)
    const patient = record ? snapshot.patients.find((p) => p.id === record.patientId) : undefined
    const access = evaluateObjectAccess({
      actor: currentUser,
      tenant: currentTenant,
      patient,
      record,
      operation: 'CLINICAL_RECORD_READ',
      grants: snapshot.grants,
      nowIsoGmt6: nowIso,
    })
    if (!access.allowed || !currentUser || !currentTenant || !record) return access
    if (!description.trim()) {
      return { allowed: false, code: 'DESCRIPTION_REQUIRED', message: 'Describe el antecedente o alergia.' }
    }

    const entry: ClinicalHistoryEntry = {
      id: makeId('hist'),
      tenantId: currentTenant.id,
      recordId: record.id,
      category,
      description: description.trim(),
      provenance,
      authorAccountId: currentUser.id,
      authorName: currentUser.fullName,
      recordedAtGmt6: nowIso,
      addenda: [],
    }
    setSnapshot((prev) => ({
      ...prev,
      historyEntries: [entry, ...prev.historyEntries],
    }))
    return { allowed: true }
  }

  const appendClinicalHistoryAddendum = (
    entryId: string,
    reason: string,
    detail: string,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const entry = snapshot.historyEntries.find((h) => h.id === entryId)
    const record = entry ? snapshot.records.find((r) => r.id === entry.recordId) : undefined
    const patient = record ? snapshot.patients.find((p) => p.id === record.patientId) : undefined
    const access = evaluateObjectAccess({
      actor: currentUser,
      tenant: currentTenant,
      patient,
      record,
      operation: 'CLINICAL_RECORD_READ',
      grants: snapshot.grants,
      nowIsoGmt6: nowIso,
    })
    if (!access.allowed || !currentUser || !entry) return access
    if (!reason.trim() || !detail.trim()) {
      return { allowed: false, code: 'ADDENDUM_REQUIRED', message: 'Motivo y detalle son obligatorios.' }
    }

    setSnapshot((prev) => ({
      ...prev,
      historyEntries: prev.historyEntries.map((item) =>
        item.id === entry.id
          ? {
              ...item,
              addenda: [
                ...item.addenda,
                {
                  id: makeId('add'),
                  authorAccountId: currentUser.id,
                  authorName: currentUser.fullName,
                  occurredAtGmt6: nowIso,
                  reason: reason.trim(),
                  detail: detail.trim(),
                },
              ],
            }
          : item,
      ),
    }))
    return { allowed: true }
  }

  const uploadStudyPdf = (input: UploadStudyInput): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const patient = snapshot.patients.find((p) => p.id === input.patientId)
    const record = snapshot.records.find((r) => r.id === input.recordId)
    const check = canUploadStudyPdf(
      currentUser,
      currentTenant,
      patient,
      record,
      input.fileName,
      input.mimeType,
      input.fileSizeKb,
      snapshot.grants,
      nowIso,
    )
    if (!check.allowed || !currentUser || !currentTenant || !patient || !record) return check

    if (!input.title.trim()) {
      return { allowed: false, code: 'TITLE_REQUIRED', message: 'Indica el título del estudio PDF.' }
    }

    const doc: ClinicalStudyDocument = {
      id: makeId('study'),
      tenantId: currentTenant.id,
      recordId: record.id,
      patientId: patient.id,
      encounterId: input.encounterId,
      title: input.title.trim(),
      fileName: input.fileName.trim(),
      fileSizeKb: Math.max(1, Math.round(input.fileSizeKb)),
      mimeType: 'application/pdf',
      uploadedByAccountId: currentUser.id,
      uploadedByName: currentUser.fullName,
      uploadedByRole: currentUser.role,
      uploadedAtGmt6: nowIso,
      previewNote: input.previewNote.trim() || 'Documento PDF cargado en prototipo.',
    }
    setSnapshot((prev) => ({ ...prev, studies: [doc, ...prev.studies] }))
    return { allowed: true }
  }

  const buildDraftPrescription = (
    encounter: ClinicalEncounter,
    actor: StaffAccount,
    items: PrescriptionItem[],
    generalInstructions: string,
    nowIso: string,
  ): Prescription => {
    const prescriptionId = makeId('rx')
    const folio = `RX-2026-${String(snapshot.prescriptions.length + 1).padStart(4, '0')}`
    return {
      id: prescriptionId,
      folio,
      tenantId: encounter.tenantId,
      recordId: encounter.recordId,
      patientId: encounter.patientId,
      encounterId: encounter.id,
      authorAccountId: actor.id,
      authorName: actor.fullName,
      authorSpecialty: actor.specialty ?? 'Medicina General',
      authorLicenseCode: actor.professionalAttribution?.licenseCode ?? null,
      status: 'BORRADOR',
      items: items.map((i) => ({ ...i })),
      generalInstructions: generalInstructions.trim(),
      createdAtGmt6: nowIso,
      updatedAtGmt6: nowIso,
      issuedAtGmt6: null,
      cancelledAtGmt6: null,
      cancelledByName: null,
      cancellationReason: null,
      duplicatedFromPrescriptionId: null,
    }
  }

  const createPrescriptionDraft = (
    encounterId: string,
    items: PrescriptionItem[],
    generalInstructions: string,
  ): { allowed: true; prescriptionId: string } | { allowed: false; code: string; message: string } => {
    const nowIso = nowGmt6Iso()
    const encounter = snapshot.encounters.find((e) => e.id === encounterId)
    const record = encounter ? snapshot.records.find((r) => r.id === encounter.recordId) : undefined
    const patient = encounter ? snapshot.patients.find((p) => p.id === encounter.patientId) : undefined
    const access = evaluateObjectAccess({
      actor: currentUser,
      tenant: currentTenant,
      patient,
      record,
      operation: 'CLINICAL_RECORD_READ',
      grants: snapshot.grants,
      nowIsoGmt6: nowIso,
    })
    if (!access.allowed || !currentUser || !currentTenant || !encounter || !record || !patient) {
      return access.allowed
        ? { allowed: false, code: 'NOT_FOUND', message: 'Atención no encontrada.' }
        : (access as { allowed: false; code: string; message: string })
    }

    const draft = buildDraftPrescription(
      encounter,
      currentUser,
      items,
      generalInstructions,
      nowIso,
    )
    setSnapshot((prev) => ({ ...prev, prescriptions: [draft, ...prev.prescriptions] }))
    return { allowed: true, prescriptionId: draft.id }
  }

  const updatePrescriptionDraft = (
    prescriptionId: string,
    items: PrescriptionItem[],
    generalInstructions: string,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const rx = snapshot.prescriptions.find((p) => p.id === prescriptionId)
    if (!rx || !currentUser || rx.authorAccountId !== currentUser.id) {
      return { allowed: false, code: 'FORBIDDEN_RX', message: 'Solo el autor edita su borrador.' }
    }
    if (rx.status !== 'BORRADOR') {
      return { allowed: false, code: 'RX_IMMUTABLE', message: 'Una receta emitida o anulada no admite edición ordinaria.' }
    }
    setSnapshot((prev) => ({
      ...prev,
      prescriptions: prev.prescriptions.map((item) =>
        item.id === rx.id
          ? {
              ...item,
              items: items.map((i) => ({ ...i })),
              generalInstructions: generalInstructions.trim(),
              updatedAtGmt6: nowIso,
            }
          : item,
      ),
    }))
    return { allowed: true }
  }

  const issuePrescription = (
    prescriptionId: string,
    items: PrescriptionItem[],
    generalInstructions: string,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const rx = snapshot.prescriptions.find((p) => p.id === prescriptionId)
    const record = rx ? snapshot.records.find((r) => r.id === rx.recordId) : undefined
    const patient = rx ? snapshot.patients.find((p) => p.id === rx.patientId) : undefined
    const check = canIssuePrescription(
      currentUser,
      currentTenant,
      patient,
      record,
      rx,
      items,
      snapshot.grants,
      nowIso,
    )
    if (!check.allowed || !rx || !currentUser) return check

    setSnapshot((prev) => ({
      ...prev,
      prescriptions: prev.prescriptions.map((item) =>
        item.id === rx.id
          ? {
              ...item,
              status: 'EMITIDA',
              items: items.map((i) => ({ ...i })),
              generalInstructions: generalInstructions.trim(),
              authorLicenseCode: currentUser.professionalAttribution?.licenseCode ?? null,
              issuedAtGmt6: nowIso,
              updatedAtGmt6: nowIso,
            }
          : item,
      ),
    }))
    return { allowed: true }
  }

  const issueDirectPrescription = (
    encounterId: string,
    items: PrescriptionItem[],
    generalInstructions: string,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const encounter = snapshot.encounters.find((e) => e.id === encounterId)
    const record = encounter ? snapshot.records.find((r) => r.id === encounter.recordId) : undefined
    const patient = encounter ? snapshot.patients.find((p) => p.id === encounter.patientId) : undefined
    const candidate =
      encounter && currentUser
        ? buildDraftPrescription(encounter, currentUser, items, generalInstructions, nowIso)
        : undefined
    const check = canIssuePrescription(
      currentUser,
      currentTenant,
      patient,
      record,
      candidate,
      items,
      snapshot.grants,
      nowIso,
    )
    if (!check.allowed || !candidate || !currentUser || !currentTenant || !encounter || !record || !patient) {
      return check
    }

    const issuedRx: Prescription = {
      ...candidate,
      status: 'EMITIDA',
      authorLicenseCode: currentUser.professionalAttribution?.licenseCode ?? null,
      issuedAtGmt6: nowIso,
      updatedAtGmt6: nowIso,
    }
    setSnapshot((prev) => ({ ...prev, prescriptions: [issuedRx, ...prev.prescriptions] }))
    return { allowed: true }
  }

  const cancelPrescription = (
    prescriptionId: string,
    reason: string,
    duplicateAsNewDraft: boolean,
  ):
    | { allowed: true; duplicatedPrescriptionId: string | null }
    | { allowed: false; code: string; message: string } => {
    const nowIso = nowGmt6Iso()
    const rx = snapshot.prescriptions.find((p) => p.id === prescriptionId)
    const record = rx ? snapshot.records.find((r) => r.id === rx.recordId) : undefined
    const patient = rx ? snapshot.patients.find((p) => p.id === rx.patientId) : undefined
    const check = canCancelPrescription(
      currentUser,
      currentTenant,
      patient,
      record,
      rx,
      reason,
      snapshot.grants,
      nowIso,
    )
    if (!check.allowed || !rx || !currentUser) {
      return check as { allowed: false; code: string; message: string }
    }

    let duplicatedId: string | null = null
    let duplicatedDraft: Prescription | null = null
    if (duplicateAsNewDraft) {
      duplicatedId = makeId('rx')
      duplicatedDraft = {
        ...rx,
        id: duplicatedId,
        folio: `RX-2026-${String(snapshot.prescriptions.length + 1).padStart(4, '0')}`,
        authorAccountId: currentUser.id,
        authorName: currentUser.fullName,
        authorSpecialty: currentUser.specialty ?? rx.authorSpecialty,
        authorLicenseCode: currentUser.professionalAttribution?.licenseCode ?? null,
        status: 'BORRADOR',
        items: rx.items.map((item) => ({ ...item, id: makeId('rxi') })),
        createdAtGmt6: nowIso,
        updatedAtGmt6: nowIso,
        issuedAtGmt6: null,
        cancelledAtGmt6: null,
        cancelledByName: null,
        cancellationReason: null,
        duplicatedFromPrescriptionId: rx.id,
      }
    }

    setSnapshot((prev) => {
      const updated = prev.prescriptions.map((item) =>
        item.id === rx.id
          ? {
              ...item,
              status: 'ANULADA' as const,
              cancelledAtGmt6: nowIso,
              cancelledByName: currentUser.fullName,
              cancellationReason: reason.trim(),
              updatedAtGmt6: nowIso,
            }
          : item,
      )
      return {
        ...prev,
        prescriptions: duplicatedDraft ? [duplicatedDraft, ...updated] : updated,
      }
    })
    return { allowed: true, duplicatedPrescriptionId: duplicatedId }
  }

  const resolveBillingContext = (encounterId: string) => {
    const encounter = snapshot.encounters.find((e) => e.id === encounterId)
    const record = encounter
      ? snapshot.records.find((r) => r.id === encounter.recordId)
      : undefined
    const patient = encounter
      ? snapshot.patients.find((p) => p.id === encounter.patientId)
      : undefined
    const sheet = snapshot.chargeSheets.find((c) => c.encounterId === encounterId)
    return { encounter, record, patient, sheet }
  }

  const saveChargeSheet = (encounterId: string, items: ChargeLineItem[]): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const { encounter, record, patient, sheet } = resolveBillingContext(encounterId)
    const check = canEditChargeSheet(
      currentUser,
      currentTenant,
      encounter,
      patient,
      record,
      sheet,
      items,
      snapshot.grants,
      nowIso,
    )
    if (!check.allowed || !currentUser || !currentTenant || !encounter || !record || !patient) {
      return check
    }

    const normalizedItems = items.map((item, index) => ({
      ...item,
      id: item.id || makeId(`cli-${index + 1}`),
      description: item.description.trim(),
    }))
    const totalMxn = calculateChargeItemsTotal(normalizedItems)

    if (sheet) {
      setSnapshot((prev) => ({
        ...prev,
        chargeSheets: prev.chargeSheets.map((item) =>
          item.id === sheet.id
            ? {
                ...item,
                status: 'ABIERTA',
                items: normalizedItems,
                totalMxn,
                reviewedByName: null,
                reviewedAtGmt6: null,
                updatedAtGmt6: nowIso,
                auditLog: [
                  ...item.auditLog,
                  {
                    id: makeId('chga'),
                    actorName: currentUser.fullName,
                    occurredAtGmt6: nowIso,
                    action: 'CORRECCION_ABIERTA',
                    detail: `Cargos actualizados (${normalizedItems.length} conceptos, ${formatMxn(totalMxn)}).`,
                  },
                ],
              }
            : item,
        ),
      }))
    } else {
      const created: EncounterChargeSheet = {
        id: makeId('chg'),
        tenantId: currentTenant.id,
        encounterId: encounter.id,
        recordId: record.id,
        patientId: patient.id,
        specialistId: encounter.specialistId,
        status: 'ABIERTA',
        items: normalizedItems,
        totalMxn,
        reviewedByName: null,
        reviewedAtGmt6: null,
        createdAtGmt6: nowIso,
        updatedAtGmt6: nowIso,
        auditLog: [
          {
            id: makeId('chga'),
            actorName: currentUser.fullName,
            occurredAtGmt6: nowIso,
            action: 'ABIERTA',
            detail: `Hoja de cargos creada (${normalizedItems.length} conceptos, ${formatMxn(totalMxn)}).`,
          },
        ],
      }
      setSnapshot((prev) => ({ ...prev, chargeSheets: [created, ...prev.chargeSheets] }))
    }
    return { allowed: true }
  }

  const markChargeSheetReviewed = (encounterId: string): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const { encounter, record, patient, sheet } = resolveBillingContext(encounterId)
    const check = canMarkChargeSheetReviewed(
      currentUser,
      currentTenant,
      encounter,
      patient,
      record,
      sheet,
      snapshot.grants,
      nowIso,
    )
    if (!check.allowed || !currentUser || !sheet) return check

    setSnapshot((prev) => ({
      ...prev,
      chargeSheets: prev.chargeSheets.map((item) =>
        item.id === sheet.id
          ? {
              ...item,
              status: 'REVISADA',
              reviewedByName: currentUser.fullName,
              reviewedAtGmt6: nowIso,
              updatedAtGmt6: nowIso,
              auditLog: [
                ...item.auditLog,
                {
                  id: makeId('chga'),
                  actorName: currentUser.fullName,
                  occurredAtGmt6: nowIso,
                  action: 'REVISADA',
                  detail: `Cargos confirmados como completos y revisados (${formatMxn(item.totalMxn)}).`,
                },
              ],
            }
          : item,
      ),
    }))
    return { allowed: true }
  }

  const reopenChargeSheet = (encounterId: string): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const { encounter, record, patient, sheet } = resolveBillingContext(encounterId)
    const check = canReopenChargeSheet(
      currentUser,
      currentTenant,
      encounter,
      patient,
      record,
      sheet,
      snapshot.grants,
      nowIso,
    )
    if (!check.allowed || !currentUser || !sheet) return check

    setSnapshot((prev) => ({
      ...prev,
      chargeSheets: prev.chargeSheets.map((item) =>
        item.id === sheet.id
          ? {
              ...item,
              status: 'ABIERTA',
              reviewedByName: null,
              reviewedAtGmt6: null,
              updatedAtGmt6: nowIso,
              auditLog: [
                ...item.auditLog,
                {
                  id: makeId('chga'),
                  actorName: currentUser.fullName,
                  occurredAtGmt6: nowIso,
                  action: 'DEVUELTA_A_ABIERTA',
                  detail: 'Hoja devuelta a estado ABIERTA para corrección previa al cobro.',
                },
              ],
            }
          : item,
      ),
    }))
    return { allowed: true }
  }

  const recordFullPayment = (
    encounterId: string,
    amountMxn: number,
    method: PaymentMethod,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const { encounter, record, patient, sheet } = resolveBillingContext(encounterId)
    const check = canRecordFullPayment(
      currentUser,
      currentTenant,
      encounter,
      patient,
      record,
      sheet,
      amountMxn,
      method,
      snapshot.grants,
      nowIso,
    )
    if (!check.allowed || !currentUser || !currentTenant || !encounter || !patient || !sheet) {
      return check
    }

    const folio = `COB-2026-${String(snapshot.payments.length + 1).padStart(4, '0')}`
    const payment: PatientPayment = {
      id: makeId('pay'),
      folio,
      tenantId: currentTenant.id,
      chargeSheetId: sheet.id,
      encounterId: encounter.id,
      patientId: patient.id,
      specialistId: encounter.specialistId,
      amountMxn: sheet.totalMxn,
      method,
      paidAtGmt6: nowIso,
      collectedByAccountId: currentUser.id,
      collectedByName: currentUser.fullName,
      cutId: null,
    }

    setSnapshot((prev) => ({
      ...prev,
      payments: [payment, ...prev.payments],
      chargeSheets: prev.chargeSheets.map((item) =>
        item.id === sheet.id
          ? {
              ...item,
              status: 'COBRADA',
              updatedAtGmt6: nowIso,
              auditLog: [
                ...item.auditLog,
                {
                  id: makeId('chga'),
                  actorName: currentUser.fullName,
                  occurredAtGmt6: nowIso,
                  action: 'COBRADA',
                  detail: `Cobro completo ${folio} por ${formatMxn(sheet.totalMxn)} (${method}).`,
                },
              ],
            }
          : item,
      ),
    }))
    return { allowed: true }
  }

  const prepareSpecialistCut = (
    specialistId: string,
    periodStartGmt6: string,
    periodEndGmt6: string,
    paymentIds: string[],
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const specialist = snapshot.accounts.find((a) => a.id === specialistId)
    const selectedPayments = snapshot.payments.filter((p) => paymentIds.includes(p.id))
    const check = canPrepareCut(
      currentUser,
      currentTenant,
      specialist,
      periodStartGmt6,
      periodEndGmt6,
      selectedPayments,
    )
    if (!check.allowed || !currentUser || !currentTenant || !specialist) return check

    const { byMethod, totalMxn } = summarizePaymentsByMethod(selectedPayments)
    const cutId = makeId('cut')
    const folio = `CORTE-2026-${String(snapshot.cuts.length + 1).padStart(4, '0')}`
    const newCut: SpecialistCut = {
      id: cutId,
      folio,
      tenantId: currentTenant.id,
      specialistId: specialist.id,
      specialistName: specialist.fullName,
      periodStartGmt6,
      periodEndGmt6,
      status: 'PREPARADO',
      paymentIds: selectedPayments.map((p) => p.id),
      totalsByMethod: byMethod,
      totalMxn,
      preparedByAccountId: currentUser.id,
      preparedByName: currentUser.fullName,
      preparedAtGmt6: nowIso,
      updatedAtGmt6: nowIso,
      confirmedByName: null,
      confirmedAtGmt6: null,
      lastObservationNote: null,
      history: [
        {
          id: makeId('cutevt'),
          status: 'PREPARADO',
          actorName: currentUser.fullName,
          occurredAtGmt6: nowIso,
          note: `Corte preparado por ${formatMxn(totalMxn)} (${selectedPayments.length} cobros).`,
        },
      ],
    }

    const selectedSet = new Set(newCut.paymentIds)
    setSnapshot((prev) => ({
      ...prev,
      cuts: [newCut, ...prev.cuts],
      payments: prev.payments.map((p) => (selectedSet.has(p.id) ? { ...p, cutId } : p)),
    }))
    return { allowed: true }
  }

  const reviseSpecialistCut = (
    cutId: string,
    periodStartGmt6: string,
    periodEndGmt6: string,
    paymentIds: string[],
    adjustmentNote: string,
  ): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const cut = snapshot.cuts.find((c) => c.id === cutId)
    const selectedPayments = snapshot.payments.filter((p) => paymentIds.includes(p.id))
    const check = canReviseCut(
      currentUser,
      currentTenant,
      cut,
      periodStartGmt6,
      periodEndGmt6,
      selectedPayments,
      adjustmentNote,
    )
    if (!check.allowed || !currentUser || !cut) return check

    const { byMethod, totalMxn } = summarizePaymentsByMethod(selectedPayments)
    const selectedSet = new Set(selectedPayments.map((p) => p.id))

    setSnapshot((prev) => ({
      ...prev,
      cuts: prev.cuts.map((item) =>
        item.id === cut.id
          ? {
              ...item,
              periodStartGmt6,
              periodEndGmt6,
              status: 'PREPARADO',
              paymentIds: selectedPayments.map((p) => p.id),
              totalsByMethod: byMethod,
              totalMxn,
              updatedAtGmt6: nowIso,
              history: [
                ...item.history,
                {
                  id: makeId('cutevt'),
                  status: 'PREPARADO',
                  actorName: currentUser.fullName,
                  occurredAtGmt6: nowIso,
                  note: `Corrección trazable y reenvío a revisión: ${adjustmentNote.trim()}`,
                },
              ],
            }
          : item,
      ),
      payments: prev.payments.map((p) => {
        if (selectedSet.has(p.id)) return { ...p, cutId: cut.id }
        if (p.cutId === cut.id) return { ...p, cutId: null }
        return p
      }),
    }))
    return { allowed: true }
  }

  const confirmSpecialistCut = (cutId: string): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const cut = snapshot.cuts.find((c) => c.id === cutId)
    const check = canResolveSpecialistCut(currentUser, currentTenant, cut, 'CONFIRM', '')
    if (!check.allowed || !currentUser || !cut) return check

    setSnapshot((prev) => ({
      ...prev,
      cuts: prev.cuts.map((item) =>
        item.id === cut.id
          ? {
              ...item,
              status: 'CONFIRMADO',
              confirmedByName: currentUser.fullName,
              confirmedAtGmt6: nowIso,
              updatedAtGmt6: nowIso,
              history: [
                ...item.history,
                {
                  id: makeId('cutevt'),
                  status: 'CONFIRMADO',
                  actorName: currentUser.fullName,
                  occurredAtGmt6: nowIso,
                  note: `Confirmación administrativa del registro del corte (${formatMxn(item.totalMxn)}).`,
                },
              ],
            }
          : item,
      ),
    }))
    return { allowed: true }
  }

  const observeSpecialistCut = (cutId: string, comment: string): PolicyDecision => {
    const nowIso = nowGmt6Iso()
    const cut = snapshot.cuts.find((c) => c.id === cutId)
    const check = canResolveSpecialistCut(currentUser, currentTenant, cut, 'OBSERVE', comment)
    if (!check.allowed || !currentUser || !cut) return check

    setSnapshot((prev) => ({
      ...prev,
      cuts: prev.cuts.map((item) =>
        item.id === cut.id
          ? {
              ...item,
              status: 'OBSERVADO',
              lastObservationNote: comment.trim(),
              updatedAtGmt6: nowIso,
              history: [
                ...item.history,
                {
                  id: makeId('cutevt'),
                  status: 'OBSERVADO',
                  actorName: currentUser.fullName,
                  occurredAtGmt6: nowIso,
                  note: `Discrepancia reportada: ${comment.trim()}`,
                },
              ],
            }
          : item,
      ),
    }))
    return { allowed: true }
  }

  const resetDemoData = () => {
    const fresh: StoreSnapshot = {
      tenants: INITIAL_TENANTS,
      accounts: INITIAL_ACCOUNTS,
      patients: INITIAL_PATIENTS,
      records: INITIAL_RECORDS,
      grants: INITIAL_GRANTS,
      appointments: INITIAL_APPOINTMENTS,
      clinicSchedules: INITIAL_CLINIC_SCHEDULES,
      specialistSchedules: INITIAL_SPECIALIST_SCHEDULES,
      scheduleExceptions: INITIAL_SCHEDULE_EXCEPTIONS,
      preparations: INITIAL_PREPARATIONS,
      encounters: INITIAL_ENCOUNTERS,
      historyEntries: INITIAL_HISTORY_ENTRIES,
      studies: INITIAL_STUDIES,
      prescriptions: INITIAL_PRESCRIPTIONS,
      chargeSheets: INITIAL_CHARGE_SHEETS,
      payments: INITIAL_PAYMENTS,
      cuts: INITIAL_CUTS,
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
        patients: snapshot.patients,
        records: snapshot.records,
        grants: snapshot.grants,
        appointments: snapshot.appointments,
        clinicSchedules: snapshot.clinicSchedules,
        specialistSchedules: snapshot.specialistSchedules,
        scheduleExceptions: snapshot.scheduleExceptions,
        agendaApiUrl,
        billingApiUrl,
        preparations: snapshot.preparations,
        encounters: snapshot.encounters,
        historyEntries: snapshot.historyEntries,
        studies: snapshot.studies,
        prescriptions: snapshot.prescriptions,
        chargeSheets: snapshot.chargeSheets,
        payments: snapshot.payments,
        cuts: snapshot.cuts,
        session: snapshot.session,
        currentUser,
        currentTenant,
        authMode,
        setAuthMode,
        identityApiUrl,
        authLoading,
        identityAccountId: identityProfile?.id ?? null,
        identityDirectory,
        identityDirectoryLoading,
        identityDirectoryError,
        refreshIdentityDirectory,
        changeOwnPassword,
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
        createPatientWithRecord,
        updatePatientAdminData,
        assignInitialPrimarySpecialist,
        reassignPrimarySpecialist,
        addTreatingSpecialist,
        removeTreatingSpecialist,
        requestExceptionalAccess,
        resolveExceptionalAccess,
        revokeExceptionalAccess,
        createAppointment,
        rescheduleAppointment,
        transitionAppointmentStatus,
        updateClinicSchedule,
        updateSpecialistSchedule,
        upsertSpecialistException,
        deleteSpecialistException,
        getMockSpecialistAvailability,
        createPreparation,
        updatePreparation,
        appendPreparationAddendum,
        startEncounter,
        incorporatePreparation,
        saveEncounterDraft,
        finalizeEncounter,
        closeEncounterNote,
        appendClosedNoteAddendum,
        addEncounterIndication,
        addClinicalHistoryEntry,
        appendClinicalHistoryAddendum,
        uploadStudyPdf,
        createPrescriptionDraft,
        updatePrescriptionDraft,
        issuePrescription,
        issueDirectPrescription,
        cancelPrescription,
        saveChargeSheet,
        markChargeSheetReviewed,
        reopenChargeSheet,
        recordFullPayment,
        prepareSpecialistCut,
        reviseSpecialistCut,
        confirmSpecialistCut,
        observeSpecialistCut,
        resetDemoData,
      }}
    >
      {children}
    </MockStoreContext>
  )
}


