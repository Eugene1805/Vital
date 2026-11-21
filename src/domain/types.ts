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
  | 'CLINIC_ADMIN_OR_AUX'
  | 'CLINIC_PATIENT_REGISTER'
  | 'CLINIC_AUXILIAR'
  | 'CLINIC_CLINICAL'

export type ExceptionalOperation =
  | 'VIEW_ADMIN_SUMMARY'
  | 'UPDATE_ADMIN_DATA'
  | 'PREPARE_PATIENT'
  | 'UPLOAD_STUDY_PDF'
  | 'MANAGE_APPOINTMENTS'
  | 'MANAGE_BILLING'

export type ExceptionalDurationMonths = 1 | 3 | 6 | 12

export type ExceptionalRequestStatus =
  | 'PENDIENTE'
  | 'APROBADA'
  | 'RECHAZADA'
  | 'REVOCADA'
  | 'VENCIDA'

export interface PatientAdminRecord {
  id: string
  tenantId: string
  patientCode: string
  fullName: string
  birthDateGmt6: string
  birthYear: number
  phone: string
  email?: string
  emergencyContact?: string
  registeredByAccountId: string
  registeredByName: string
  createdAtGmt6: string
  updatedAtGmt6: string
}

export type RecordAssignmentEventType =
  | 'INITIAL_PRIMARY'
  | 'REASSIGN_PRIMARY'
  | 'ADD_TREATING'
  | 'REMOVE_TREATING'

export interface RecordAssignmentEvent {
  id: string
  type: RecordAssignmentEventType
  previousSpecialistId: string | null
  nextSpecialistId: string | null
  actorName: string
  occurredAtGmt6: string
  note: string
}

export interface ClinicalNotePreview {
  id: string
  authorAccountId: string
  authorName: string
  specialty: string
  status: 'BORRADOR' | 'CERRADA'
  timestampGmt6: string
  summary: string
}

export interface ClinicalRecord {
  id: string
  tenantId: string
  patientId: string
  primarySpecialistId: string | null
  treatingSpecialistIds: string[]
  assignmentHistory: RecordAssignmentEvent[]
  criticalAllergies: string[]
  chronicConditions: string[]
  notesPreview: ClinicalNotePreview[]
}

export interface ExceptionalAccessGrant {
  id: string
  tenantId: string
  requesterAccountId: string
  requesterName: string
  patientId: string
  patientCode: string
  patientFullName: string
  patientBirthYear: number
  requestedOperations: ExceptionalOperation[]
  approvedOperations: ExceptionalOperation[]
  reason: string
  requestedMonths: ExceptionalDurationMonths
  approvedMonths: number | null
  status: ExceptionalRequestStatus
  requestedAtGmt6: string
  resolvedByName: string | null
  resolvedAtGmt6: string | null
  resolutionNote: string | null
  expiresAtGmt6: string | null
  revokedByName: string | null
  revokedAtGmt6: string | null
}

export interface RestrictedPatientSearchHit {
  patientId: string
  patientCode: string
  fullName: string
  birthYear: number
}

export type AppointmentStatus =
  | 'PROGRAMADA'
  | 'CONFIRMADA'
  | 'EN_CURSO'
  | 'COMPLETADA'
  | 'CANCELADA'
  | 'NO_ASISTIO'

export interface Appointment {
  id: string
  tenantId: string
  patientId: string
  specialistId: string
  scheduledStartGmt6: string
  durationMinutes: number
  reason: string
  status: AppointmentStatus
  createdByName: string
  createdAtGmt6: string
  updatedAtGmt6: string
}

export type PreparationStatus = 'PENDIENTE_REVISION' | 'REVISADA'

export interface AppendOnlyAddendum {
  id: string
  authorAccountId: string
  authorName: string
  occurredAtGmt6: string
  reason: string
  detail: string
}

export interface PreliminaryVitals {
  weightKg: string
  heightCm: string
  temperatureC: string
  bloodPressure: string
  heartRateBpm: string
}

export interface PreliminaryPreparation {
  id: string
  tenantId: string
  recordId: string
  patientId: string
  encounterId: string | null
  status: PreparationStatus
  declaredAllergies: string
  declaredConditions: string
  vitals: PreliminaryVitals
  authorAccountId: string
  authorName: string
  recordedAtGmt6: string
  updatedAtGmt6: string
  reviewedByName: string | null
  reviewedAtGmt6: string | null
  addenda: AppendOnlyAddendum[]
}

export type EncounterStatus = 'EN_CURSO' | 'FINALIZADA'

export type ClinicalNoteStatus = 'BORRADOR' | 'CERRADA'

export interface ClinicalIndication {
  id: string
  kind: 'INDICACION_GENERAL' | 'SOLICITUD_ESTUDIO'
  text: string
  authorAccountId: string
  authorName: string
  createdAtGmt6: string
}

export interface ClinicalEncounter {
  id: string
  tenantId: string
  recordId: string
  patientId: string
  appointmentId: string | null
  specialistId: string
  specialistName: string
  specialty: string
  chiefComplaint: string
  startedAtGmt6: string
  endedAtGmt6: string | null
  encounterStatus: EncounterStatus
  noteStatus: ClinicalNoteStatus
  noteContent: string
  noteClosedAtGmt6: string | null
  noteUpdatedAtGmt6: string
  noteAddenda: AppendOnlyAddendum[]
  linkedPreparationIds: string[]
  indications: ClinicalIndication[]
}

export type HistoryProvenance =
  | 'DECLARADO_PACIENTE'
  | 'CAPTURADO_AUXILIAR'
  | 'REGISTRO_PROFESIONAL'

export type ClinicalHistoryCategory = 'ALERGIA' | 'ANTECEDENTE' | 'CONDICION'

export interface ClinicalHistoryEntry {
  id: string
  tenantId: string
  recordId: string
  category: ClinicalHistoryCategory
  description: string
  provenance: HistoryProvenance
  authorAccountId: string
  authorName: string
  recordedAtGmt6: string
  addenda: AppendOnlyAddendum[]
}

export interface ClinicalStudyDocument {
  id: string
  tenantId: string
  recordId: string
  patientId: string
  encounterId: string | null
  title: string
  fileName: string
  fileSizeKb: number
  mimeType: 'application/pdf'
  uploadedByAccountId: string
  uploadedByName: string
  uploadedByRole: OrgRole
  uploadedAtGmt6: string
  previewNote: string
}

export type PrescriptionStatus = 'BORRADOR' | 'EMITIDA' | 'ANULADA'

export interface PrescriptionItem {
  id: string
  medication: string
  dose: string
  frequency: string
  duration: string
  notes?: string
}

export interface Prescription {
  id: string
  folio: string
  tenantId: string
  recordId: string
  patientId: string
  encounterId: string
  authorAccountId: string
  authorName: string
  authorSpecialty: string
  authorLicenseCode: string | null
  status: PrescriptionStatus
  items: PrescriptionItem[]
  generalInstructions: string
  createdAtGmt6: string
  updatedAtGmt6: string
  issuedAtGmt6: string | null
  cancelledAtGmt6: string | null
  cancelledByName: string | null
  cancellationReason: string | null
  duplicatedFromPrescriptionId: string | null
}

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

export type ProvisioningStatus = 'READY' | 'PENDING_ACTIVATION' | 'FAILED'

export interface TenantAccessState {
  tenantId: string
  state: TenantStatus
  mayAuthenticate: boolean
  evaluatedAtGmt6: string
}

export interface ClinicTenant {
  id: string
  slug: string
  name: string
  status: TenantStatus
  usesBilling: boolean
  plan: ClinicPlan
  provisioningRequestId: string
  provisioningStatus: ProvisioningStatus
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
  mustChangePassword?: boolean
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

export type ChargeSheetStatus = 'ABIERTA' | 'REVISADA' | 'COBRADA'

export type ChargeConceptCategory = 'CONSULTA' | 'ESTUDIO' | 'INSUMO'

export interface BillableConcept {
  code: string
  label: string
  category: ChargeConceptCategory
  defaultPriceMxn: number
}

export interface ChargeLineItem {
  id: string
  conceptCode: string
  description: string
  category: ChargeConceptCategory
  quantity: number
  unitPriceMxn: number
}

export interface ChargeSheetAuditEvent {
  id: string
  actorName: string
  occurredAtGmt6: string
  action: string
  detail: string
}

export interface EncounterChargeSheet {
  id: string
  tenantId: string
  encounterId: string
  recordId: string
  patientId: string
  specialistId: string
  status: ChargeSheetStatus
  items: ChargeLineItem[]
  totalMxn: number
  reviewedByName: string | null
  reviewedAtGmt6: string | null
  createdAtGmt6: string
  updatedAtGmt6: string
  auditLog: ChargeSheetAuditEvent[]
}

export type PaymentMethod = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'

export interface PatientPayment {
  id: string
  folio: string
  tenantId: string
  chargeSheetId: string
  encounterId: string
  patientId: string
  specialistId: string
  amountMxn: number
  method: PaymentMethod
  paidAtGmt6: string
  collectedByAccountId: string
  collectedByName: string
  cutId: string | null
}

export type SpecialistCutStatus = 'PREPARADO' | 'OBSERVADO' | 'CONFIRMADO'

export interface SpecialistCutEvent {
  id: string
  status: SpecialistCutStatus
  actorName: string
  occurredAtGmt6: string
  note: string
}

export interface SpecialistCut {
  id: string
  folio: string
  tenantId: string
  specialistId: string
  specialistName: string
  periodStartGmt6: string
  periodEndGmt6: string
  status: SpecialistCutStatus
  paymentIds: string[]
  totalsByMethod: Record<PaymentMethod, number>
  totalMxn: number
  preparedByAccountId: string
  preparedByName: string
  preparedAtGmt6: string
  updatedAtGmt6: string
  confirmedByName: string | null
  confirmedAtGmt6: string | null
  lastObservationNote: string | null
  history: SpecialistCutEvent[]
}

export type KpiStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_APPLICABLE'

export type PlatformKpiKey =
  | 'CLINICS_BY_STATUS'
  | 'PLAN_OCCUPANCY'
  | 'APPOINTMENT_ACTIVITY'
  | 'DOCUMENT_CONSUMPTION'

export type ClinicKpiKey =
  | 'AGENDA_ACTIVITY'
  | 'COMPLETED_CONSULTATIONS'
  | 'RECORDED_PAYMENTS'
  | 'CUTS_STATUS'

export interface KpiEnvelope<TKey extends string, TData> {
  kpiKey: TKey
  status: KpiStatus
  data: TData | null
  evaluatedAtGmt6: string
  reason?: string
}

export interface ClinicsByStatusData {
  total: number
  pendienteAdmin: number
  activa: number
  suspendida: number
}

export interface PlanOccupancyData {
  activeAccounts: number
  totalQuota: number
  occupancyPercent: number
}

export interface AppointmentActivityData {
  total: number
  byStatus: Record<AppointmentStatus, number>
}

export interface DocumentConsumptionData {
  totalDocuments: number
  totalSizeKb: number
}

export interface CompletedConsultationsData {
  total: number
  bySpecialist: Array<{ specialistName: string; count: number }>
}

export interface RecordedPaymentsData {
  totalMxn: number
  paymentCount: number
  byMethod: Record<PaymentMethod, number>
}

export interface CutsStatusData {
  totalCuts: number
  preparadoCount: number
  observadoCount: number
  confirmadoCount: number
  confirmedAmountMxn: number
  observedAmountMxn: number
}
