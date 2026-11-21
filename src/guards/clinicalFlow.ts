import type {
  Appointment,
  AppointmentStatus,
  ClinicalEncounter,
  ClinicalRecord,
  ClinicTenant,
  ExceptionalAccessGrant,
  PatientAdminRecord,
  PolicyDecision,
  PreliminaryPreparation,
  Prescription,
  PrescriptionItem,
  StaffAccount,
} from '../domain/types.ts'
import {
  evaluateObjectAccess,
  getActiveGrantForOperation,
  isInAuxiliaryOrdinaryScope,
} from './objectAccess.ts'

function allow(): PolicyDecision {
  return { allowed: true }
}

function deny(code: string, message: string): PolicyDecision {
  return { allowed: false, code, message }
}

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  PROGRAMADA: 'PROGRAMADA',
  CONFIRMADA: 'CONFIRMADA',
  EN_CURSO: 'EN_CURSO',
  COMPLETADA: 'COMPLETADA',
  CANCELADA: 'CANCELADA',
  NO_ASISTIO: 'NO_ASISTIO',
}

export const ALLOWED_APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PROGRAMADA: ['CONFIRMADA', 'EN_CURSO', 'CANCELADA', 'NO_ASISTIO'],
  CONFIRMADA: ['EN_CURSO', 'CANCELADA', 'NO_ASISTIO'],
  EN_CURSO: ['COMPLETADA', 'CANCELADA'],
  COMPLETADA: [],
  CANCELADA: [],
  NO_ASISTIO: [],
}

/** CU-18: Valida permisos administrativos, alcance y ausencia de empalme exacto por especialista. */
export function canScheduleAppointment(
  actor: StaffAccount | null,
  tenant: ClinicTenant | null,
  patient: PatientAdminRecord | undefined,
  record: ClinicalRecord | undefined,
  specialist: StaffAccount | undefined,
  scheduledStartGmt6: string,
  durationMinutes: number,
  reason: string,
  existingAppointments: Appointment[],
  grants: ExceptionalAccessGrant[],
  nowIsoGmt6: string,
  ignoreAppointmentId?: string,
): PolicyDecision {
  if (!actor || !actor.active || !tenant || tenant.status !== 'ACTIVA' || actor.tenantId !== tenant.id) {
    return deny('TENANT_CONTEXT_INVALID', 'Contexto de clínica o cuenta inactivo.')
  }
  if (actor.role !== 'ADMIN_CLINICA' && actor.role !== 'AUXILIAR') {
    return deny(
      'FORBIDDEN_AGENDA_ROLE',
      'Solo Secretaría / Enfermería o AdminClinica gestionan citas internas (CU-18).',
    )
  }
  if (!patient || !record || patient.tenantId !== tenant.id || record.tenantId !== tenant.id) {
    return deny('PATIENT_NOT_FOUND', 'El paciente indicado no pertenece a esta clínica.')
  }
  if (
    !specialist ||
    specialist.tenantId !== tenant.id ||
    specialist.role !== 'ESPECIALISTA' ||
    !specialist.active
  ) {
    return deny('INVALID_SPECIALIST', 'Selecciona un especialista activo dentro de esta clínica.')
  }

  if (actor.role === 'AUXILIAR') {
    const inOrdinary = isInAuxiliaryOrdinaryScope(actor, record)
    const isFirstForUnassigned = record.primarySpecialistId === null
    const grant = getActiveGrantForOperation(
      actor,
      patient.id,
      'MANAGE_APPOINTMENTS',
      grants,
      nowIsoGmt6,
    )
    if (!inOrdinary && !isFirstForUnassigned && !grant) {
      return deny(
        'OUT_OF_AGENDA_SCOPE',
        'No tienes ámbito ordinario ni permiso excepcional vigente (MANAGE_APPOINTMENTS) para agendar a este paciente.',
      )
    }
  }

  if (!scheduledStartGmt6.trim() || !reason.trim()) {
    return deny('INVALID_APPOINTMENT_DATA', 'Fecha/hora (GMT-6) y motivo de la cita son obligatorios.')
  }

  const startMs = Date.parse(scheduledStartGmt6)
  if (Number.isNaN(startMs) || durationMinutes < 10) {
    return deny('INVALID_SCHEDULE_TIME', 'Indica una fecha y duración válida (mínimo 10 minutos).')
  }
  const endMs = startMs + durationMinutes * 60_000

  const conflict = existingAppointments.find((apt) => {
    if (apt.tenantId !== tenant.id) return false
    if (ignoreAppointmentId && apt.id === ignoreAppointmentId) return false
    if (apt.specialistId !== specialist.id) return false
    if (apt.status === 'CANCELADA' || apt.status === 'NO_ASISTIO') return false
    const aptStart = Date.parse(apt.scheduledStartGmt6)
    const aptEnd = aptStart + apt.durationMinutes * 60_000
    return startMs < aptEnd && endMs > aptStart
  })

  if (conflict) {
    return deny(
      'SCHEDULE_CONFLICT',
      `Conflicto de horario en GMT-6: el especialista ya tiene una cita (${conflict.status}) en ese bloque.`,
    )
  }

  return allow()
}

export function canTransitionAppointmentStatus(
  currentStatus: AppointmentStatus,
  nextStatus: AppointmentStatus,
): PolicyDecision {
  if (currentStatus === nextStatus) {
    return deny('SAME_APPOINTMENT_STATUS', `La cita ya se encuentra en estado ${currentStatus}.`)
  }
  if (!ALLOWED_APPOINTMENT_TRANSITIONS[currentStatus].includes(nextStatus)) {
    return deny(
      'INVALID_APPOINTMENT_TRANSITION',
      `No es válido pasar una cita de ${currentStatus} a ${nextStatus} (CU-18 A3).`,
    )
  }
  return allow()
}

/** CU-19: Exclusivo de auxiliar con ámbito ordinario o permiso excepcional PREPARE_PATIENT (una cita no basta). */
export function canCreatePreparation(
  actor: StaffAccount | null,
  tenant: ClinicTenant | null,
  patient: PatientAdminRecord | undefined,
  record: ClinicalRecord | undefined,
  grants: ExceptionalAccessGrant[],
  nowIsoGmt6: string,
): PolicyDecision {
  if (!actor || !actor.active || !tenant || tenant.status !== 'ACTIVA' || actor.tenantId !== tenant.id) {
    return deny('TENANT_CONTEXT_INVALID', 'Contexto de clínica inválido.')
  }
  if (actor.role !== 'AUXILIAR') {
    return deny(
      'FORBIDDEN_PREPARATION_ROLE',
      'La captura preliminar declarada corresponde exclusivamente al personal auxiliar (CU-19).',
    )
  }
  if (!patient || !record || patient.tenantId !== tenant.id || record.tenantId !== tenant.id) {
    return deny('PATIENT_NOT_FOUND', 'Paciente o expediente no encontrado en la clínica.')
  }

  const inOrdinary = isInAuxiliaryOrdinaryScope(actor, record)
  const grant = getActiveGrantForOperation(
    actor,
    patient.id,
    'PREPARE_PATIENT',
    grants,
    nowIsoGmt6,
  )
  if (!inOrdinary && !grant) {
    return deny(
      'OUT_OF_PREPARATION_SCOPE',
      'Una cita por sí sola no habilita preparación clínica; requieres ámbito ordinario o permiso excepcional PREPARE_PATIENT (CU-19 A1).',
    )
  }
  return allow()
}

/** CU-19: Solo editable mientras esté PENDIENTE_REVISION. */
export function canEditPreparation(
  actor: StaffAccount | null,
  preparation: PreliminaryPreparation | undefined,
): PolicyDecision {
  if (!actor || !actor.active || actor.role !== 'AUXILIAR') {
    return deny('FORBIDDEN_PREPARATION_EDIT', 'Solo personal auxiliar edita preparaciones pendientes.')
  }
  if (!preparation || preparation.tenantId !== actor.tenantId) {
    return deny('PREPARATION_NOT_FOUND', 'Preparación preliminar no encontrada.')
  }
  if (preparation.status === 'REVISADA') {
    return deny(
      'PREPARATION_LOCKED_REVISADA',
      'Esta preparación ya fue revisada en consulta (REVISADA) y está bloqueada para edición libre; utiliza una adenda append-only (PC-04).',
    )
  }
  return allow()
}

/** PC-04: Corrección trazable append-only después de pasar a REVISADA. */
export function canAppendPreparationAddendum(
  actor: StaffAccount | null,
  tenant: ClinicTenant | null,
  patient: PatientAdminRecord | undefined,
  record: ClinicalRecord | undefined,
  preparation: PreliminaryPreparation | undefined,
  reason: string,
  detail: string,
  grants: ExceptionalAccessGrant[],
  nowIsoGmt6: string,
): PolicyDecision {
  if (!preparation || preparation.status !== 'REVISADA') {
    return deny(
      'ADDENDUM_ONLY_FOR_REVISADA',
      'Las adendas append-only solo aplican sobre preparaciones en estado REVISADA.',
    )
  }
  if (!reason.trim() || !detail.trim()) {
    return deny('ADDENDUM_FIELDS_REQUIRED', 'Motivo y detalle de la adenda son obligatorios (PC-04).')
  }
  if (actor?.role === 'ESPECIALISTA') {
    return evaluateObjectAccess({
      actor,
      tenant,
      patient,
      record,
      operation: 'CLINICAL_RECORD_READ',
      grants,
      nowIsoGmt6,
    })
  }
  return canCreatePreparation(actor, tenant, patient, record, grants, nowIsoGmt6)
}

/** CU-03: Payload mínimo para finalizar atención (no exige nota cerrada ni cobro). */
export function canFinalizeEncounter(
  actor: StaffAccount | null,
  tenant: ClinicTenant | null,
  patient: PatientAdminRecord | undefined,
  record: ClinicalRecord | undefined,
  encounter: ClinicalEncounter | undefined,
  endedAtGmt6: string,
  grants: ExceptionalAccessGrant[],
  nowIsoGmt6: string,
): PolicyDecision {
  const access = evaluateObjectAccess({
    actor,
    tenant,
    patient,
    record,
    operation: 'CLINICAL_RECORD_READ',
    grants,
    nowIsoGmt6,
  })
  if (!access.allowed || !encounter || !actor) return access.allowed ? deny('ENCOUNTER_NOT_FOUND', 'Atención no encontrada.') : access

  if (encounter.specialistId !== actor.id) {
    return deny('FORBIDDEN_FINALIZE_OTHER', 'Solo el especialista de la atención puede finalizarla.')
  }
  if (encounter.encounterStatus === 'FINALIZADA') {
    return deny('ALREADY_FINALIZED', 'Esta atención ya se encuentra FINALIZADA.')
  }
  if (!encounter.chiefComplaint.trim() || !encounter.startedAtGmt6.trim() || !endedAtGmt6.trim()) {
    return deny(
      'INVALID_FINALIZE_PAYLOAD',
      'Falta motivo de inicio o marca temporal explícita de cierre endedAt en GMT-6 (CU-03 A5).',
    )
  }
  return allow()
}

/** CU-03: Borradores editables solo por su autor; cierre explícito. */
export function canEditOrCloseNote(
  actor: StaffAccount | null,
  encounter: ClinicalEncounter | undefined,
  action: 'EDIT' | 'CLOSE',
  noteContent: string,
): PolicyDecision {
  if (!actor || !actor.active || actor.role !== 'ESPECIALISTA') {
    return deny('FORBIDDEN_NOTE_ROLE', 'Solo el especialista autor gestiona notas clínicas.')
  }
  if (!encounter || encounter.tenantId !== actor.tenantId) {
    return deny('ENCOUNTER_NOT_FOUND', 'Atención clínica no encontrada.')
  }
  if (encounter.specialistId !== actor.id) {
    return deny(
      'FORBIDDEN_OTHER_AUTHOR_DRAFT',
      'No puedes editar ni cerrar la nota de otro especialista (CU-03 A4).',
    )
  }
  if (encounter.noteStatus === 'CERRADA') {
    return deny(
      'NOTE_ALREADY_CLOSED',
      'La nota está CERRADA y no admite edición libre; registra una adenda append-only (PC-04).',
    )
  }
  if (action === 'CLOSE' && !noteContent.trim()) {
    return deny('NOTE_CONTENT_REQUIRED', 'Captura el contenido clínico antes de cerrar la nota.')
  }
  return allow()
}

/** PC-04: Adenda append-only sobre nota ya cerrada. */
export function canAppendClosedNoteAddendum(
  actor: StaffAccount | null,
  tenant: ClinicTenant | null,
  patient: PatientAdminRecord | undefined,
  record: ClinicalRecord | undefined,
  encounter: ClinicalEncounter | undefined,
  reason: string,
  detail: string,
  grants: ExceptionalAccessGrant[],
  nowIsoGmt6: string,
): PolicyDecision {
  const access = evaluateObjectAccess({
    actor,
    tenant,
    patient,
    record,
    operation: 'CLINICAL_RECORD_READ',
    grants,
    nowIsoGmt6,
  })
  if (!access.allowed) return access
  if (!encounter || encounter.noteStatus !== 'CERRADA') {
    return deny('NOTE_NOT_CLOSED', 'Solo se agregan adendas sobre notas en estado CERRADA.')
  }
  if (!reason.trim() || !detail.trim()) {
    return deny('ADDENDUM_FIELDS_REQUIRED', 'Motivo y detalle de la adenda son obligatorios (PC-04).')
  }
  return allow()
}

/** CU-04: Validación por objeto para carga PDF por especialista o auxiliar autorizado. */
export function canUploadStudyPdf(
  actor: StaffAccount | null,
  tenant: ClinicTenant | null,
  patient: PatientAdminRecord | undefined,
  record: ClinicalRecord | undefined,
  fileName: string,
  mimeType: string,
  fileSizeKb: number,
  grants: ExceptionalAccessGrant[],
  nowIsoGmt6: string,
): PolicyDecision {
  if (!actor || !actor.active || !tenant || tenant.status !== 'ACTIVA' || actor.tenantId !== tenant.id) {
    return deny('TENANT_CONTEXT_INVALID', 'Contexto de clínica inválido.')
  }
  if (!patient || !record || patient.tenantId !== tenant.id || record.tenantId !== tenant.id) {
    return deny('PATIENT_NOT_FOUND', 'Paciente o expediente inaccesible.')
  }

  if (actor.role === 'ESPECIALISTA') {
    const clinical = evaluateObjectAccess({
      actor,
      tenant,
      patient,
      record,
      operation: 'CLINICAL_RECORD_READ',
      grants,
      nowIsoGmt6,
    })
    if (!clinical.allowed) return clinical
  } else if (actor.role === 'AUXILIAR') {
    const inOrdinaryWithUpload =
      isInAuxiliaryOrdinaryScope(actor, record) && actor.permissions.canUploadStudies
    const exceptionalUpload = getActiveGrantForOperation(
      actor,
      patient.id,
      'UPLOAD_STUDY_PDF',
      grants,
      nowIsoGmt6,
    )
    if (!inOrdinaryWithUpload && !exceptionalUpload) {
      return deny(
        'FORBIDDEN_STUDY_UPLOAD',
        'El auxiliar requiere permiso específico de carga de estudios en ámbito ordinario o permiso excepcional UPLOAD_STUDY_PDF (CU-04 A3).',
      )
    }
  } else {
    return deny('FORBIDDEN_STUDY_ROLE', 'AdminClinica y SuperAdmin no cargan estudios clínicos.')
  }

  const lower = fileName.trim().toLowerCase()
  if (!lower.endsWith('.pdf') || (mimeType && mimeType !== 'application/pdf')) {
    return deny('INVALID_PDF_FORMAT', 'Solo se admiten documentos en formato PDF en el MVP (CU-04 A1).')
  }
  if (fileSizeKb <= 0 || fileSizeKb > 10240) {
    return deny('INVALID_PDF_SIZE', 'El archivo PDF debe pesar entre 1 KB y 10 MB.')
  }
  return allow()
}

/** CU-07 + CU-14: Emisión de receta farmacológica validando atribución profesional registrada y permiso habilitado. */
export function canIssuePrescription(
  actor: StaffAccount | null,
  tenant: ClinicTenant | null,
  patient: PatientAdminRecord | undefined,
  record: ClinicalRecord | undefined,
  prescription: Prescription | undefined,
  items: PrescriptionItem[],
  grants: ExceptionalAccessGrant[],
  nowIsoGmt6: string,
): PolicyDecision {
  const access = evaluateObjectAccess({
    actor,
    tenant,
    patient,
    record,
    operation: 'CLINICAL_RECORD_READ',
    grants,
    nowIsoGmt6,
  })
  if (!access.allowed || !actor) return access

  if (!actor.permissions.canPrescribe || !actor.professionalAttribution) {
    return deny(
      'PRESCRIPTION_PERMISSION_REQUIRED',
      'No puedes emitir recetas: requieres atribución profesional registrada y permiso habilitado por AdminClinica (CU-07 A1 / CU-14).',
    )
  }
  if (!prescription || prescription.authorAccountId !== actor.id) {
    return deny('FORBIDDEN_RX_AUTHOR', 'Solo el especialista autor puede emitir este borrador.')
  }
  if (prescription.status !== 'BORRADOR') {
    return deny('RX_NOT_DRAFT', 'Solo los borradores pueden emitirse.')
  }
  const hasValidItem =
    items.length > 0 &&
    items.every(
      (i) => i.medication.trim() && i.dose.trim() && i.frequency.trim() && i.duration.trim(),
    )
  if (!hasValidItem) {
    return deny(
      'INVALID_RX_ITEMS',
      'Incluye al menos un medicamento con dosis, frecuencia y duración completos (CU-07 A2).',
    )
  }
  return allow()
}

/** CU-07: Anular (y opcionalmente duplicar) receta EMITIDA exige motivo obligatorio. */
export function canCancelPrescription(
  actor: StaffAccount | null,
  tenant: ClinicTenant | null,
  patient: PatientAdminRecord | undefined,
  record: ClinicalRecord | undefined,
  prescription: Prescription | undefined,
  reason: string,
  grants: ExceptionalAccessGrant[],
  nowIsoGmt6: string,
): PolicyDecision {
  const access = evaluateObjectAccess({
    actor,
    tenant,
    patient,
    record,
    operation: 'CLINICAL_RECORD_READ',
    grants,
    nowIsoGmt6,
  })
  if (!access.allowed || !actor) return access

  if (!prescription || prescription.tenantId !== actor.tenantId) {
    return deny('RX_NOT_FOUND', 'Receta no encontrada.')
  }
  if (prescription.status !== 'EMITIDA') {
    return deny('RX_NOT_ISSUED', 'Solo pueden anularse recetas en estado EMITIDA (CU-07 A4).')
  }
  if (!reason.trim()) {
    return deny('CANCELLATION_REASON_REQUIRED', 'El motivo de anulación es obligatorio (CU-07 A4).')
  }
  return allow()
}
