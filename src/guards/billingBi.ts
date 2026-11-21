import type {
  Appointment,
  AppointmentActivityData,
  AppointmentStatus,
  BillableConcept,
  ChargeLineItem,
  ClinicKpiKey,
  ClinicalRecord,
  ClinicTenant,
  ClinicsByStatusData,
  ClinicalEncounter,
  ClinicalStudyDocument,
  CompletedConsultationsData,
  CutsStatusData,
  DocumentConsumptionData,
  EncounterChargeSheet,
  ExceptionalAccessGrant,
  KpiEnvelope,
  PatientAdminRecord,
  PatientPayment,
  PaymentMethod,
  PlanOccupancyData,
  PlatformKpiKey,
  PolicyDecision,
  RecordedPaymentsData,
  SpecialistCut,
  StaffAccount,
} from '../domain/types.ts'
import { getActiveGrantForOperation, isInAuxiliaryOrdinaryScope } from './objectAccess.ts'

function allow(): PolicyDecision {
  return { allowed: true }
}

function deny(code: string, message: string): PolicyDecision {
  return { allowed: false, code, message }
}

export const BILLABLE_CONCEPTS: BillableConcept[] = [
  { code: 'CON-GEN', label: 'Consulta médica general', category: 'CONSULTA', defaultPriceMxn: 800 },
  { code: 'CON-ESP', label: 'Consulta de especialidad', category: 'CONSULTA', defaultPriceMxn: 1200 },
  { code: 'EST-ECG', label: 'Electrocardiograma en consultorio', category: 'ESTUDIO', defaultPriceMxn: 650 },
  { code: 'EST-LAB', label: 'Toma de muestra básica', category: 'ESTUDIO', defaultPriceMxn: 450 },
  { code: 'INS-MAT', label: 'Material de curación estándar', category: 'INSUMO', defaultPriceMxn: 250 },
  { code: 'INS-MED', label: 'Insumo aplicado en consulta', category: 'INSUMO', defaultPriceMxn: 350 },
]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
}

export function formatMxn(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0
  const formatted = safe.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `$${formatted} MXN`
}

export function calculateChargeItemsTotal(items: ChargeLineItem[]): number {
  const raw = items.reduce((sum, item) => sum + item.quantity * item.unitPriceMxn, 0)
  return Math.round(raw * 100) / 100
}

export function summarizePaymentsByMethod(
  payments: PatientPayment[],
): { byMethod: Record<PaymentMethod, number>; totalMxn: number } {
  const byMethod: Record<PaymentMethod, number> = {
    EFECTIVO: 0,
    TARJETA: 0,
    TRANSFERENCIA: 0,
  }
  for (const pay of payments) {
    byMethod[pay.method] = Math.round((byMethod[pay.method] + pay.amountMxn) * 100) / 100
  }
  const totalMxn =
    Math.round((byMethod.EFECTIVO + byMethod.TARJETA + byMethod.TRANSFERENCIA) * 100) / 100
  return { byMethod, totalMxn }
}

function checkBillingTenantAndPatient(
  actor: StaffAccount | null,
  tenant: ClinicTenant | null,
  encounter: ClinicalEncounter | undefined,
  patient: PatientAdminRecord | undefined,
  record: ClinicalRecord | undefined,
): PolicyDecision {
  if (!actor || !actor.active || !tenant || tenant.status !== 'ACTIVA' || actor.tenantId !== tenant.id) {
    return deny('TENANT_CONTEXT_INVALID', 'Contexto de clínica o cuenta inactivo.')
  }
  if (!tenant.usesBilling) {
    return deny(
      'BILLING_DISABLED',
      'Esta clínica no utiliza Billing de pacientes; la atención clínica sigue operando con normalidad (CU-20 A1).',
    )
  }
  if (
    !encounter ||
    !patient ||
    !record ||
    encounter.tenantId !== tenant.id ||
    patient.tenantId !== tenant.id ||
    record.tenantId !== tenant.id
  ) {
    return deny('ENCOUNTER_NOT_FOUND', 'Atención o paciente no encontrado dentro de esta clínica.')
  }
  return allow()
}

function hasEconomicOperationPermission(
  actor: StaffAccount,
  patient: PatientAdminRecord,
  record: ClinicalRecord,
  encounter: ClinicalEncounter,
  allowEncounterSpecialist: boolean,
  grants: ExceptionalAccessGrant[],
  nowIsoGmt6: string,
): PolicyDecision {
  if (actor.role === 'SUPER_ADMIN') {
    return deny('FORBIDDEN_BILLING_ROLE', 'SuperAdmin no opera cargos ni cobros de clínicas.')
  }
  if (actor.role === 'ADMIN_CLINICA') {
    return allow()
  }
  if (actor.role === 'AUXILIAR') {
    const inOrdinary = isInAuxiliaryOrdinaryScope(actor, record)
    const grant = getActiveGrantForOperation(
      actor,
      patient.id,
      'MANAGE_BILLING',
      grants,
      nowIsoGmt6,
    )
    if (!inOrdinary && !grant) {
      return deny(
        'OUT_OF_BILLING_SCOPE',
        'No tienes ámbito ordinario ni permiso excepcional vigente (MANAGE_BILLING) sobre este paciente (CU-20 A3).',
      )
    }
    return allow()
  }
  if (allowEncounterSpecialist && actor.role === 'ESPECIALISTA') {
    if (encounter.specialistId !== actor.id) {
      return deny(
        'FORBIDDEN_OTHER_SPECIALIST_BILLING',
        'Solo el especialista de esta atención puede revisar o validar sus cargos.',
      )
    }
    return allow()
  }
  return deny(
    'FORBIDDEN_COLLECTION_ROLE',
    'El registro de cobros y cortes corresponde exclusivamente a personal administrativo o auxiliar autorizado (CU-21 / CU-22).',
  )
}

/** CU-20: Edición de conceptos/cantidades/precios en hoja ABIERTA o nueva. */
export function canEditChargeSheet(
  actor: StaffAccount | null,
  tenant: ClinicTenant | null,
  encounter: ClinicalEncounter | undefined,
  patient: PatientAdminRecord | undefined,
  record: ClinicalRecord | undefined,
  existingSheet: EncounterChargeSheet | undefined,
  items: ChargeLineItem[],
  grants: ExceptionalAccessGrant[],
  nowIsoGmt6: string,
): PolicyDecision {
  const base = checkBillingTenantAndPatient(actor, tenant, encounter, patient, record)
  if (!base.allowed || !actor || !encounter || !patient || !record) return base

  const perm = hasEconomicOperationPermission(
    actor,
    patient,
    record,
    encounter,
    true,
    grants,
    nowIsoGmt6,
  )
  if (!perm.allowed) return perm

  if (existingSheet?.status === 'COBRADA') {
    return deny(
      'CHARGE_SHEET_ALREADY_PAID',
      'La hoja ya se encuentra COBRADA y no puede sobrescribirse directamente (CU-20 A5).',
    )
  }
  if (items.length === 0) {
    return deny('INVALID_CHARGE_ITEMS', 'Agrega al menos un concepto cobrable antes de guardar (CU-20 A2).')
  }
  const invalidLine = items.some(
    (item) =>
      !item.description.trim() ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0 ||
      !Number.isFinite(item.unitPriceMxn) ||
      item.unitPriceMxn < 0,
  )
  if (invalidLine) {
    return deny(
      'INVALID_CHARGE_ITEMS',
      'Cada concepto requiere descripción, cantidad entera positiva y precio unitario válido (CU-20 A2).',
    )
  }
  return allow()
}

/** CU-20: Confirmar cargos completos y revisados (ABIERTA -> REVISADA). */
export function canMarkChargeSheetReviewed(
  actor: StaffAccount | null,
  tenant: ClinicTenant | null,
  encounter: ClinicalEncounter | undefined,
  patient: PatientAdminRecord | undefined,
  record: ClinicalRecord | undefined,
  sheet: EncounterChargeSheet | undefined,
  grants: ExceptionalAccessGrant[],
  nowIsoGmt6: string,
): PolicyDecision {
  const base = checkBillingTenantAndPatient(actor, tenant, encounter, patient, record)
  if (!base.allowed || !actor || !encounter || !patient || !record) return base

  const perm = hasEconomicOperationPermission(
    actor,
    patient,
    record,
    encounter,
    true,
    grants,
    nowIsoGmt6,
  )
  if (!perm.allowed) return perm

  if (!sheet || sheet.items.length === 0 || sheet.totalMxn <= 0) {
    return deny(
      'CHARGE_SHEET_EMPTY',
      'Registra al menos un cargo con importe válido antes de marcar como REVISADA (CU-20).',
    )
  }
  if (sheet.status !== 'ABIERTA') {
    return deny(
      'CHARGE_SHEET_NOT_OPEN',
      `Solo una hoja en estado ABIERTA puede confirmarse como REVISADA (estado actual: ${sheet.status}).`,
    )
  }
  return allow()
}

/** CU-20: Devolver hoja REVISADA a ABIERTA antes de cobrar. */
export function canReopenChargeSheet(
  actor: StaffAccount | null,
  tenant: ClinicTenant | null,
  encounter: ClinicalEncounter | undefined,
  patient: PatientAdminRecord | undefined,
  record: ClinicalRecord | undefined,
  sheet: EncounterChargeSheet | undefined,
  grants: ExceptionalAccessGrant[],
  nowIsoGmt6: string,
): PolicyDecision {
  const base = checkBillingTenantAndPatient(actor, tenant, encounter, patient, record)
  if (!base.allowed || !actor || !encounter || !patient || !record) return base

  const perm = hasEconomicOperationPermission(
    actor,
    patient,
    record,
    encounter,
    true,
    grants,
    nowIsoGmt6,
  )
  if (!perm.allowed) return perm

  if (!sheet || sheet.status === 'COBRADA') {
    return deny(
      'CHARGE_SHEET_ALREADY_PAID',
      'Una hoja COBRADA no puede devolverse a estado ABIERTA (CU-20 A5).',
    )
  }
  if (sheet.status !== 'REVISADA') {
    return deny('CHARGE_SHEET_NOT_REVIEWED', 'La hoja ya está en estado ABIERTA.')
  }
  return allow()
}

/**
 * CU-21: Cobro completo a paciente.
 * Exige atención FINALIZADA + hoja REVISADA + importe total completo.
 * NO exige nota CERRADA (CU-21 A3).
 */
export function canRecordFullPayment(
  actor: StaffAccount | null,
  tenant: ClinicTenant | null,
  encounter: ClinicalEncounter | undefined,
  patient: PatientAdminRecord | undefined,
  record: ClinicalRecord | undefined,
  sheet: EncounterChargeSheet | undefined,
  amountMxn: number,
  method: PaymentMethod,
  grants: ExceptionalAccessGrant[],
  nowIsoGmt6: string,
): PolicyDecision {
  const base = checkBillingTenantAndPatient(actor, tenant, encounter, patient, record)
  if (!base.allowed || !actor || !encounter || !patient || !record) return base

  const perm = hasEconomicOperationPermission(
    actor,
    patient,
    record,
    encounter,
    false,
    grants,
    nowIsoGmt6,
  )
  if (!perm.allowed) return perm

  if (encounter.encounterStatus !== 'FINALIZADA') {
    return deny(
      'ENCOUNTER_NOT_FINALIZED',
      'El cobro ordinario exige que la atención clínica esté FINALIZADA en CU-03; la nota médica puede permanecer en BORRADOR (CU-21 A1).',
    )
  }
  if (!sheet) {
    return deny('CHARGE_SHEET_MISSING', 'Primero registra y revisa los cargos de esta atención en CU-20.')
  }
  if (sheet.status === 'COBRADA') {
    return deny('CHARGE_SHEET_ALREADY_PAID', 'Esta hoja de cargos ya fue COBRADA (CU-21 A5).')
  }
  if (sheet.status !== 'REVISADA') {
    return deny(
      'CHARGE_SHEET_NOT_REVIEWED',
      'La hoja de cargos sigue en estado ABIERTA; confírmala como REVISADA antes de cobrar (CU-21 A2).',
    )
  }
  if (!Number.isFinite(amountMxn) || Math.abs(amountMxn - sheet.totalMxn) > 0.009) {
    return deny(
      'PARTIAL_PAYMENT_NOT_ALLOWED',
      `En el MVP solo se registran cobros completos por ${formatMxn(sheet.totalMxn)}; no se admiten pagos parciales (CU-21 A4).`,
    )
  }
  if (method !== 'EFECTIVO' && method !== 'TARJETA' && method !== 'TRANSFERENCIA') {
    return deny('INVALID_PAYMENT_METHOD', 'Selecciona efectivo, tarjeta o transferencia.')
  }
  return allow()
}

/** CU-22: Preparar nuevo corte por especialista sin doble contabilización de cobros. */
export function canPrepareCut(
  actor: StaffAccount | null,
  tenant: ClinicTenant | null,
  specialist: StaffAccount | undefined,
  periodStartGmt6: string,
  periodEndGmt6: string,
  selectedPayments: PatientPayment[],
): PolicyDecision {
  if (!actor || !actor.active || !tenant || tenant.status !== 'ACTIVA' || actor.tenantId !== tenant.id) {
    return deny('TENANT_CONTEXT_INVALID', 'Contexto de clínica o cuenta inactivo.')
  }
  if (!tenant.usesBilling) {
    return deny('BILLING_DISABLED', 'Esta clínica no utiliza Billing (CU-22 A1).')
  }
  if (actor.role !== 'ADMIN_CLINICA' && actor.role !== 'AUXILIAR') {
    return deny(
      'FORBIDDEN_CUT_PREPARATION',
      'Solo Secretaría / Enfermería o AdminClinica preparan cortes económicos (CU-22).',
    )
  }
  if (!specialist || specialist.tenantId !== tenant.id || specialist.role !== 'ESPECIALISTA') {
    return deny('INVALID_SPECIALIST', 'Selecciona un especialista válido de la clínica (CU-22 A2).')
  }
  if (!periodStartGmt6 || !periodEndGmt6 || periodStartGmt6 > periodEndGmt6) {
    return deny('INVALID_CUT_PERIOD', 'Define un rango de fechas válido en GMT-6.')
  }
  if (selectedPayments.length === 0) {
    return deny('NO_PAYMENTS_IN_PERIOD', 'Selecciona al menos un cobro disponible para preparar el corte (CU-22 A2).')
  }
  const hasInvalidPayment = selectedPayments.some(
    (p) => p.tenantId !== tenant.id || p.specialistId !== specialist.id || p.cutId !== null,
  )
  if (hasInvalidPayment) {
    return deny(
      'PAYMENT_ALREADY_IN_CUT',
      'Uno o más cobros seleccionados ya pertenecen a otro corte activo o a otro especialista (CU-22 A3).',
    )
  }
  return allow()
}

/** CU-22 + PC-05: Corregir corte OBSERVADO o PREPARADO de forma trazable y reenviar a PREPARADO. */
export function canReviseCut(
  actor: StaffAccount | null,
  tenant: ClinicTenant | null,
  cut: SpecialistCut | undefined,
  periodStartGmt6: string,
  periodEndGmt6: string,
  selectedPayments: PatientPayment[],
  adjustmentNote: string,
): PolicyDecision {
  if (!actor || !actor.active || !tenant || tenant.status !== 'ACTIVA' || actor.tenantId !== tenant.id) {
    return deny('TENANT_CONTEXT_INVALID', 'Contexto de clínica o cuenta inactivo.')
  }
  if (!tenant.usesBilling) {
    return deny('BILLING_DISABLED', 'Esta clínica no utiliza Billing.')
  }
  if (actor.role !== 'ADMIN_CLINICA' && actor.role !== 'AUXILIAR') {
    return deny(
      'FORBIDDEN_CUT_PREPARATION',
      'Solo personal administrativo o auxiliar autorizado corrige cortes antes de confirmar.',
    )
  }
  if (!cut || cut.tenantId !== tenant.id) {
    return deny('CUT_NOT_FOUND', 'Corte no encontrado en esta clínica.')
  }
  if (cut.status === 'CONFIRMADO') {
    return deny(
      'CUT_ALREADY_CONFIRMED',
      'El corte ya fue CONFIRMADO por el especialista y no admite modificación ordinaria (CU-22 A4).',
    )
  }
  if (!periodStartGmt6 || !periodEndGmt6 || periodStartGmt6 > periodEndGmt6) {
    return deny('INVALID_CUT_PERIOD', 'Rango de periodo GMT-6 inválido.')
  }
  if (selectedPayments.length === 0) {
    return deny('NO_PAYMENTS_IN_PERIOD', 'El corte debe conservar al menos un cobro asociado.')
  }
  const invalidPayment = selectedPayments.some(
    (p) =>
      p.tenantId !== tenant.id ||
      p.specialistId !== cut.specialistId ||
      (p.cutId !== null && p.cutId !== cut.id),
  )
  if (invalidPayment) {
    return deny(
      'PAYMENT_ALREADY_IN_CUT',
      'Existe un cobro asignado a otro corte o especialista (CU-22 A3).',
    )
  }
  if (!adjustmentNote.trim()) {
    return deny(
      'ADJUSTMENT_NOTE_REQUIRED',
      'Captura la nota trazable de corrección antes de reenviar el corte a PREPARADO (PC-05).',
    )
  }
  return allow()
}

/** CU-23 + PC-05: Confirmar o reportar discrepancia (OBSERVADO con comentario obligatorio) por el especialista titular. */
export function canResolveSpecialistCut(
  actor: StaffAccount | null,
  tenant: ClinicTenant | null,
  cut: SpecialistCut | undefined,
  action: 'CONFIRM' | 'OBSERVE',
  comment: string,
): PolicyDecision {
  if (!actor || !actor.active || !tenant || tenant.status !== 'ACTIVA' || actor.tenantId !== tenant.id) {
    return deny('TENANT_CONTEXT_INVALID', 'Contexto de clínica o cuenta inactivo.')
  }
  if (!tenant.usesBilling) {
    return deny('BILLING_DISABLED', 'Esta clínica no utiliza Billing.')
  }
  if (actor.role !== 'ESPECIALISTA') {
    return deny(
      'FORBIDDEN_CUT_RESOLUTION_ROLE',
      'Solo el especialista titular del corte puede confirmarlo u observarlo (CU-23).',
    )
  }
  if (!cut || cut.tenantId !== tenant.id || cut.specialistId !== actor.id) {
    return deny(
      'FORBIDDEN_CUT_OWNER',
      'Este corte pertenece a otro especialista o clínica (CU-23 A1).',
    )
  }
  if (cut.status !== 'PREPARADO') {
    return deny(
      'CUT_NOT_PREPARED',
      `Solo los cortes en estado PREPARADO admiten confirmación o nueva observación (estado actual: ${cut.status}) (CU-23 A2).`,
    )
  }
  if (action === 'OBSERVE' && !comment.trim()) {
    return deny(
      'OBSERVATION_COMMENT_REQUIRED',
      'El comentario describiendo la discrepancia es obligatorio para marcar el corte como OBSERVADO (CU-23 A3 / PC-05).',
    )
  }
  return allow()
}

function inGmt6DateRange(isoGmt6: string, startDate: string, endDate: string): boolean {
  const datePart = isoGmt6.slice(0, 10)
  if (!datePart) return false
  if (startDate && datePart < startDate) return false
  if (endDate && datePart > endDate) return false
  return true
}

function emptyAppointmentCounts(): Record<AppointmentStatus, number> {
  return {
    PROGRAMADA: 0,
    CONFIRMADA: 0,
    EN_CURSO: 0,
    COMPLETADA: 0,
    CANCELADA: 0,
    NO_ASISTIO: 0,
  }
}

export interface PlatformBiInput {
  tenants: ClinicTenant[]
  accounts: StaffAccount[]
  appointments: Appointment[]
  studies: ClinicalStudyDocument[]
  periodStartGmt6: string
  periodEndGmt6: string
  evaluatedAtGmt6: string
  faults?: {
    identity?: boolean
    agenda?: boolean
    document?: boolean
  }
}

/** CU-16: Los 4 KPI globales aprobados para SuperAdmin sin navegación a datos clínicos individuales. */
export function evaluatePlatformKpis(input: PlatformBiInput): {
  clinicsByStatus: KpiEnvelope<PlatformKpiKey, ClinicsByStatusData>
  planOccupancy: KpiEnvelope<PlatformKpiKey, PlanOccupancyData>
  appointmentActivity: KpiEnvelope<PlatformKpiKey, AppointmentActivityData>
  documentConsumption: KpiEnvelope<PlatformKpiKey, DocumentConsumptionData>
} {
  const { tenants, accounts, appointments, studies, periodStartGmt6, periodEndGmt6, evaluatedAtGmt6, faults } =
    input

  const clinicsData: ClinicsByStatusData = {
    total: tenants.length,
    pendienteAdmin: tenants.filter((t) => t.status === 'PENDIENTE_ADMIN').length,
    activa: tenants.filter((t) => t.status === 'ACTIVA').length,
    suspendida: tenants.filter((t) => t.status === 'SUSPENDIDA').length,
  }

  const totalQuota = tenants.reduce((sum, t) => sum + t.plan.maxActiveAccounts, 0)
  const activeAccounts = accounts.filter((a) => a.tenantId !== null && a.active).length
  const occupancyPercent = totalQuota > 0 ? Math.round((activeAccounts / totalQuota) * 100) : 0

  const filteredAppointments = appointments.filter((a) =>
    inGmt6DateRange(a.scheduledStartGmt6, periodStartGmt6, periodEndGmt6),
  )
  const byStatus = emptyAppointmentCounts()
  for (const apt of filteredAppointments) {
    byStatus[apt.status] += 1
  }

  const filteredStudies = studies.filter((s) =>
    inGmt6DateRange(s.uploadedAtGmt6, periodStartGmt6, periodEndGmt6),
  )
  const totalSizeKb = filteredStudies.reduce((sum, s) => sum + s.fileSizeKb, 0)

  return {
    clinicsByStatus: {
      kpiKey: 'CLINICS_BY_STATUS',
      status: 'AVAILABLE',
      data: clinicsData,
      evaluatedAtGmt6,
    },
    planOccupancy: faults?.identity
      ? {
          kpiKey: 'PLAN_OCCUPANCY',
          status: 'UNAVAILABLE',
          data: null,
          evaluatedAtGmt6,
          reason: 'El servicio Identity no respondió al consultar cuentas activas (CU-16 A1).',
        }
      : {
          kpiKey: 'PLAN_OCCUPANCY',
          status: 'AVAILABLE',
          data: { activeAccounts, totalQuota, occupancyPercent },
          evaluatedAtGmt6,
        },
    appointmentActivity: faults?.agenda
      ? {
          kpiKey: 'APPOINTMENT_ACTIVITY',
          status: 'UNAVAILABLE',
          data: null,
          evaluatedAtGmt6,
          reason: 'El servicio Agenda no respondió en la ventana GMT-6 solicitada (CU-16 A1).',
        }
      : {
          kpiKey: 'APPOINTMENT_ACTIVITY',
          status: 'AVAILABLE',
          data: { total: filteredAppointments.length, byStatus },
          evaluatedAtGmt6,
        },
    documentConsumption: faults?.document
      ? {
          kpiKey: 'DOCUMENT_CONSUMPTION',
          status: 'UNAVAILABLE',
          data: null,
          evaluatedAtGmt6,
          reason: 'El servicio Document no respondió al calcular volumen documental (CU-16 A1).',
        }
      : {
          kpiKey: 'DOCUMENT_CONSUMPTION',
          status: 'AVAILABLE',
          data: { totalDocuments: filteredStudies.length, totalSizeKb },
          evaluatedAtGmt6,
        },
  }
}

export interface ClinicBiInput {
  tenant: ClinicTenant
  appointments: Appointment[]
  encounters: ClinicalEncounter[]
  payments: PatientPayment[]
  cuts: SpecialistCut[]
  periodStartGmt6: string
  periodEndGmt6: string
  evaluatedAtGmt6: string
  faults?: {
    agenda?: boolean
    clinical?: boolean
    billing?: boolean
  }
}

/**
 * CU-16: Los 4 KPI del tenant para AdminClinica en GMT-6.
 * - Consultas realizadas contabiliza atenciones FINALIZADAS (no notas cerradas ni citas).
 * - Si !tenant.usesBilling, los dos KPI de Billing devuelven NOT_APPLICABLE (CU-16 A2).
 */
export function evaluateClinicKpis(input: ClinicBiInput): {
  agendaActivity: KpiEnvelope<ClinicKpiKey, AppointmentActivityData>
  completedConsultations: KpiEnvelope<ClinicKpiKey, CompletedConsultationsData>
  recordedPayments: KpiEnvelope<ClinicKpiKey, RecordedPaymentsData>
  cutsStatus: KpiEnvelope<ClinicKpiKey, CutsStatusData>
} {
  const {
    tenant,
    appointments,
    encounters,
    payments,
    cuts,
    periodStartGmt6,
    periodEndGmt6,
    evaluatedAtGmt6,
    faults,
  } = input

  const tenantAppointments = appointments.filter(
    (a) =>
      a.tenantId === tenant.id &&
      inGmt6DateRange(a.scheduledStartGmt6, periodStartGmt6, periodEndGmt6),
  )
  const byStatus = emptyAppointmentCounts()
  for (const apt of tenantAppointments) {
    byStatus[apt.status] += 1
  }

  const finalizedEncounters = encounters.filter(
    (enc) =>
      enc.tenantId === tenant.id &&
      enc.encounterStatus === 'FINALIZADA' &&
      inGmt6DateRange(enc.endedAtGmt6 ?? enc.startedAtGmt6, periodStartGmt6, periodEndGmt6),
  )
  const specCounts = new Map<string, number>()
  for (const enc of finalizedEncounters) {
    specCounts.set(enc.specialistName, (specCounts.get(enc.specialistName) ?? 0) + 1)
  }
  const bySpecialist = Array.from(specCounts.entries()).map(([specialistName, count]) => ({
    specialistName,
    count,
  }))

  let recordedPayments: KpiEnvelope<ClinicKpiKey, RecordedPaymentsData>
  let cutsStatus: KpiEnvelope<ClinicKpiKey, CutsStatusData>

  if (!tenant.usesBilling) {
    recordedPayments = {
      kpiKey: 'RECORDED_PAYMENTS',
      status: 'NOT_APPLICABLE',
      data: null,
      evaluatedAtGmt6,
      reason: 'Esta clínica no tiene Billing habilitado (CU-16 A2).',
    }
    cutsStatus = {
      kpiKey: 'CUTS_STATUS',
      status: 'NOT_APPLICABLE',
      data: null,
      evaluatedAtGmt6,
      reason: 'Esta clínica no tiene Billing habilitado (CU-16 A2).',
    }
  } else if (faults?.billing) {
    recordedPayments = {
      kpiKey: 'RECORDED_PAYMENTS',
      status: 'UNAVAILABLE',
      data: null,
      evaluatedAtGmt6,
      reason: 'El servicio Billing no respondió al consultar cobros registrados (CU-16 A1).',
    }
    cutsStatus = {
      kpiKey: 'CUTS_STATUS',
      status: 'UNAVAILABLE',
      data: null,
      evaluatedAtGmt6,
      reason: 'El servicio Billing no respondió al consultar estado de cortes (CU-16 A1).',
    }
  } else {
    const tenantPayments = payments.filter(
      (p) => p.tenantId === tenant.id && inGmt6DateRange(p.paidAtGmt6, periodStartGmt6, periodEndGmt6),
    )
    const { byMethod, totalMxn } = summarizePaymentsByMethod(tenantPayments)
    recordedPayments = {
      kpiKey: 'RECORDED_PAYMENTS',
      status: 'AVAILABLE',
      data: {
        totalMxn,
        paymentCount: tenantPayments.length,
        byMethod,
      },
      evaluatedAtGmt6,
    }

    const tenantCuts = cuts.filter(
      (c) =>
        c.tenantId === tenant.id &&
        (!periodEndGmt6 || c.periodStartGmt6 <= periodEndGmt6) &&
        (!periodStartGmt6 || c.periodEndGmt6 >= periodStartGmt6),
    )
    const confirmado = tenantCuts.filter((c) => c.status === 'CONFIRMADO')
    const observado = tenantCuts.filter((c) => c.status === 'OBSERVADO')
    const preparado = tenantCuts.filter((c) => c.status === 'PREPARADO')
    cutsStatus = {
      kpiKey: 'CUTS_STATUS',
      status: 'AVAILABLE',
      data: {
        totalCuts: tenantCuts.length,
        preparadoCount: preparado.length,
        observadoCount: observado.length,
        confirmadoCount: confirmado.length,
        confirmedAmountMxn:
          Math.round(confirmado.reduce((sum, c) => sum + c.totalMxn, 0) * 100) / 100,
        observedAmountMxn:
          Math.round(observado.reduce((sum, c) => sum + c.totalMxn, 0) * 100) / 100,
      },
      evaluatedAtGmt6,
    }
  }

  return {
    agendaActivity: faults?.agenda
      ? {
          kpiKey: 'AGENDA_ACTIVITY',
          status: 'UNAVAILABLE',
          data: null,
          evaluatedAtGmt6,
          reason: 'El servicio Agenda no respondió para esta clínica (CU-16 A1).',
        }
      : {
          kpiKey: 'AGENDA_ACTIVITY',
          status: 'AVAILABLE',
          data: { total: tenantAppointments.length, byStatus },
          evaluatedAtGmt6,
        },
    completedConsultations: faults?.clinical
      ? {
          kpiKey: 'COMPLETED_CONSULTATIONS',
          status: 'UNAVAILABLE',
          data: null,
          evaluatedAtGmt6,
          reason: 'El servicio Clinical no respondió al contar atenciones finalizadas (CU-16 A1).',
        }
      : {
          kpiKey: 'COMPLETED_CONSULTATIONS',
          status: 'AVAILABLE',
          data: { total: finalizedEncounters.length, bySpecialist },
          evaluatedAtGmt6,
        },
    recordedPayments,
    cutsStatus,
  }
}
