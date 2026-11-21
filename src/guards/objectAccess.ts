import type {
  ClinicalRecord,
  ClinicTenant,
  ExceptionalAccessGrant,
  ExceptionalDurationMonths,
  ExceptionalOperation,
  ExceptionalRequestStatus,
  PatientAdminRecord,
  PolicyDecision,
  RestrictedPatientSearchHit,
  StaffAccount,
} from '../domain/types.ts'

export const EXCEPTIONAL_OPERATION_LABELS: Record<ExceptionalOperation, string> = {
  VIEW_ADMIN_SUMMARY: 'Consultar resumen administrativo del paciente',
  UPDATE_ADMIN_DATA: 'Actualizar datos administrativos (contacto)',
  PREPARE_PATIENT: 'Registrar preparación preliminar (CU-19)',
  UPLOAD_STUDY_PDF: 'Cargar estudios PDF autorizados (CU-04)',
  MANAGE_APPOINTMENTS: 'Gestionar citas en agenda (CU-18)',
  MANAGE_BILLING: 'Registrar cargos/cobros (CU-20/21)',
}

export type ObjectOperation =
  | 'PATIENT_CREATE'
  | 'PATIENT_ADMIN_READ'
  | 'PATIENT_ADMIN_UPDATE'
  | 'RECORD_ASSIGN_INITIAL_PRIMARY'
  | 'RECORD_REASSIGN_PRIMARY'
  | 'RECORD_MANAGE_TREATING'
  | 'CLINICAL_RECORD_READ'

export interface EvaluateObjectAccessInput {
  actor: StaffAccount | null
  tenant: ClinicTenant | null
  patient?: PatientAdminRecord | null
  record?: ClinicalRecord | null
  operation: ObjectOperation
  grants: ExceptionalAccessGrant[]
  nowIsoGmt6: string
}

function allow(): PolicyDecision {
  return { allowed: true }
}

function deny(code: string, message: string): PolicyDecision {
  return { allowed: false, code, message }
}

/** CU-10 / CU-12: Un paciente pertenece al ámbito ordinario del auxiliar solo si alguno de sus especialistas vinculados es principal o tratante vigente. */
export function isInAuxiliaryOrdinaryScope(
  auxiliary: StaffAccount,
  record: ClinicalRecord,
): boolean {
  if (auxiliary.role !== 'AUXILIAR' || !auxiliary.active) return false
  if (auxiliary.tenantId !== record.tenantId) return false
  if (
    record.primarySpecialistId &&
    auxiliary.linkedSpecialistIds.includes(record.primarySpecialistId)
  ) {
    return true
  }
  return record.treatingSpecialistIds.some((id) =>
    auxiliary.linkedSpecialistIds.includes(id),
  )
}

export function isGrantCurrentlyActive(
  grant: ExceptionalAccessGrant,
  nowIsoGmt6: string,
): boolean {
  return (
    grant.status === 'APROBADA' &&
    Boolean(grant.expiresAtGmt6 && grant.expiresAtGmt6 > nowIsoGmt6)
  )
}

export function getEffectiveGrantStatus(
  grant: ExceptionalAccessGrant,
  nowIsoGmt6: string,
): ExceptionalRequestStatus {
  if (grant.status === 'APROBADA' && grant.expiresAtGmt6 && grant.expiresAtGmt6 <= nowIsoGmt6) {
    return 'VENCIDA'
  }
  return grant.status
}

export function getActiveGrantForPatient(
  actor: StaffAccount,
  patientId: string,
  grants: ExceptionalAccessGrant[],
  nowIsoGmt6: string,
): ExceptionalAccessGrant | undefined {
  return grants.find(
    (g) =>
      g.tenantId === actor.tenantId &&
      g.requesterAccountId === actor.id &&
      g.patientId === patientId &&
      isGrantCurrentlyActive(g, nowIsoGmt6),
  )
}

export function getActiveGrantForOperation(
  actor: StaffAccount,
  patientId: string,
  operation: ExceptionalOperation,
  grants: ExceptionalAccessGrant[],
  nowIsoGmt6: string,
): ExceptionalAccessGrant | undefined {
  return grants.find(
    (g) =>
      g.tenantId === actor.tenantId &&
      g.requesterAccountId === actor.id &&
      g.patientId === patientId &&
      isGrantCurrentlyActive(g, nowIsoGmt6) &&
      g.approvedOperations.includes(operation),
  )
}

export function hasClinicalLink(actor: StaffAccount, record: ClinicalRecord): boolean {
  if (actor.role !== 'ESPECIALISTA' || !actor.active) return false
  if (actor.tenantId !== record.tenantId) return false
  return (
    record.primarySpecialistId === actor.id ||
    record.treatingSpecialistIds.includes(actor.id)
  )
}

/** Simulador puro de evaluación gRPC (actorId, tenantId, patientId, operation) en CU-10. */
export function evaluateObjectAccess({
  actor,
  tenant,
  patient,
  record,
  operation,
  grants,
  nowIsoGmt6,
}: EvaluateObjectAccessInput): PolicyDecision {
  if (!actor || !actor.active) {
    return deny('ACTOR_INACTIVE', 'Cuenta inactiva o sin sesión válida.')
  }
  if (actor.role === 'SUPER_ADMIN') {
    return deny(
      'FORBIDDEN_PLATFORM_TENANT_DATA',
      'SuperAdmin no accede a pacientes ni expedientes clínicos por aislamiento multitenant (CU-10 / CU-11).',
    )
  }
  if (!tenant || tenant.status !== 'ACTIVA' || actor.tenantId !== tenant.id) {
    return deny('TENANT_CONTEXT_INVALID', 'Contexto de clínica inválido o inactivo.')
  }

  if (operation === 'PATIENT_CREATE') {
    if (actor.role === 'ADMIN_CLINICA' || actor.permissions.canRegisterPatients) {
      return allow()
    }
    return deny(
      'FORBIDDEN_PATIENT_CREATE',
      'Tu cuenta no tiene autorización para registrar pacientes en esta clínica (CU-01).',
    )
  }

  if (!patient || !record || patient.tenantId !== tenant.id || record.tenantId !== tenant.id) {
    return deny('RESOURCE_NOT_ACCESSIBLE', 'El paciente o expediente no existe dentro de esta clínica.')
  }

  if (operation === 'CLINICAL_RECORD_READ') {
    if (actor.role !== 'ESPECIALISTA') {
      return deny(
        'FORBIDDEN_CLINICAL_ROLE',
        'El Espacio Clínico del Expediente es exclusivo para especialistas autorizados (CU-10).',
      )
    }
    if (!hasClinicalLink(actor, record)) {
      return deny(
        'NO_CLINICAL_LINK',
        'No tienes vínculo clínico vigente (responsable principal o tratante) sobre este expediente. Haber registrado al paciente no otorga acceso clínico (CU-01 A6 / CU-10).',
      )
    }
    return allow()
  }

  if (operation === 'RECORD_REASSIGN_PRIMARY') {
    if (actor.role !== 'ADMIN_CLINICA') {
      return deny(
        'FORBIDDEN_REASSIGN_PRIMARY',
        'Exclusivamente AdminClinica puede reasignar al responsable principal vigente (CU-24).',
      )
    }
    if (!record.primarySpecialistId) {
      return deny(
        'NO_PRIMARY_YET',
        'El expediente está pendiente de asignación; utiliza la asignación inicial de CU-02 en lugar de CU-24.',
      )
    }
    return allow()
  }

  if (operation === 'RECORD_MANAGE_TREATING') {
    if (actor.role !== 'ADMIN_CLINICA') {
      return deny(
        'FORBIDDEN_MANAGE_TREATING',
        'Solo AdminClinica puede vincular o desvincular especialistas tratantes adicionales (PC-02).',
      )
    }
    return allow()
  }

  if (operation === 'RECORD_ASSIGN_INITIAL_PRIMARY') {
    if (record.primarySpecialistId !== null) {
      return deny(
        'ALREADY_HAS_PRIMARY',
        'El expediente ya cuenta con responsable principal vigente; cualquier cambio corresponde a CU-24 (solo AdminClinica).',
      )
    }
    if (
      actor.role === 'ADMIN_CLINICA' ||
      (actor.role === 'AUXILIAR' && actor.permissions.canAssignInitialPrimary)
    ) {
      return allow()
    }
    return deny(
      'FORBIDDEN_INITIAL_ASSIGN',
      'No cuentas con habilitación administrativa para establecer al responsable principal inicial (CU-02).',
    )
  }

  if (operation === 'PATIENT_ADMIN_READ') {
    if (actor.role === 'ADMIN_CLINICA') return allow()
    if (actor.role === 'ESPECIALISTA') {
      return hasClinicalLink(actor, record)
        ? allow()
        : deny(
            'OUT_OF_CLINICAL_SCOPE',
            'Solo puedes consultar expedientes donde seas responsable principal o tratante vigente (CU-10).',
          )
    }
    if (isInAuxiliaryOrdinaryScope(actor, record)) return allow()
    if (record.primarySpecialistId === null && actor.permissions.canAssignInitialPrimary) {
      return allow()
    }
    const activeGrant = getActiveGrantForPatient(actor, patient.id, grants, nowIsoGmt6)
    if (activeGrant) return allow()

    return deny(
      'OUT_OF_AUXILIARY_SCOPE',
      'Este paciente está fuera de tu ámbito ordinario y no tienes un permiso excepcional vigente (CU-10).',
    )
  }

  if (operation === 'PATIENT_ADMIN_UPDATE') {
    if (actor.role === 'ADMIN_CLINICA') return allow()
    if (actor.role === 'AUXILIAR') {
      if (isInAuxiliaryOrdinaryScope(actor, record)) return allow()
      const grant = getActiveGrantForOperation(
        actor,
        patient.id,
        'UPDATE_ADMIN_DATA',
        grants,
        nowIsoGmt6,
      )
      if (grant) return allow()
      return deny(
        'FORBIDDEN_ADMIN_UPDATE',
        'Necesitas ámbito ordinario o permiso excepcional vigente con UPDATE_ADMIN_DATA.',
      )
    }
    return deny(
      'FORBIDDEN_ADMIN_UPDATE',
      'Los especialistas no editan la ficha administrativa desde este flujo.',
    )
  }

  return deny('UNSUPPORTED_OPERATION', 'Operación no reconocida.')
}

export interface RestrictedSearchResult {
  valid: boolean
  reason?: 'MIN_CHARS' | 'UNAUTHORIZED'
  results: RestrictedPatientSearchHit[]
}

/** PC-03: Buscador fuera de ámbito exige código exacto o >= 4 caracteres y expone solo 3 campos mínimos. */
export function searchPatientsRestricted(
  query: string,
  actor: StaffAccount | null,
  patients: PatientAdminRecord[],
): RestrictedSearchResult {
  if (!actor || !actor.active || !actor.tenantId || actor.role === 'SUPER_ADMIN') {
    return { valid: false, reason: 'UNAUTHORIZED', results: [] }
  }

  const trimmed = query.trim()
  if (!trimmed) {
    return { valid: false, reason: 'MIN_CHARS', results: [] }
  }

  const normalized = trimmed.toLowerCase()
  const tenantPatients = patients.filter((p) => p.tenantId === actor.tenantId)
  const exactCodeMatch = tenantPatients.find(
    (p) => p.patientCode.toLowerCase() === normalized,
  )

  if (exactCodeMatch) {
    return {
      valid: true,
      results: [
        {
          patientId: exactCodeMatch.id,
          patientCode: exactCodeMatch.patientCode,
          fullName: exactCodeMatch.fullName,
          birthYear: exactCodeMatch.birthYear,
        },
      ],
    }
  }

  if (trimmed.length < 4) {
    return { valid: false, reason: 'MIN_CHARS', results: [] }
  }

  const matches = tenantPatients
    .filter(
      (p) =>
        p.fullName.toLowerCase().includes(normalized) ||
        p.patientCode.toLowerCase().includes(normalized),
    )
    .slice(0, 8)
    .map((p) => ({
      patientId: p.id,
      patientCode: p.patientCode,
      fullName: p.fullName,
      birthYear: p.birthYear,
    }))

  return { valid: true, results: matches }
}

/** Proceso excepcional sin ID (PC-01): valida solicitud de auxiliar fuera de ámbito ordinario. */
export function canCreateExceptionalRequest(
  actor: StaffAccount | null,
  patient: PatientAdminRecord | undefined,
  record: ClinicalRecord | undefined,
  operations: ExceptionalOperation[],
  reason: string,
  requestedMonths: ExceptionalDurationMonths,
  existingGrants: ExceptionalAccessGrant[],
): PolicyDecision {
  if (!actor || !actor.active || actor.role !== 'AUXILIAR') {
    return deny('FORBIDDEN_REQUESTER', 'Solo personal auxiliar activo puede solicitar acceso excepcional.')
  }
  if (!patient || !record || patient.tenantId !== actor.tenantId || record.tenantId !== actor.tenantId) {
    return deny('PATIENT_NOT_FOUND', 'El paciente seleccionado no pertenece a esta clínica.')
  }
  if (isInAuxiliaryOrdinaryScope(actor, record)) {
    return deny(
      'ALREADY_IN_ORDINARY_SCOPE',
      'Este paciente ya pertenece a tu ámbito ordinario; no requieres permiso excepcional.',
    )
  }
  if (operations.length === 0) {
    return deny('OPERATIONS_REQUIRED', 'Selecciona al menos una operación administrativa concreta.')
  }
  if (!reason.trim()) {
    return deny('REASON_REQUIRED', 'El motivo de la solicitud es obligatorio.')
  }
  if (![1, 3, 6, 12].includes(requestedMonths)) {
    return deny('INVALID_DURATION', 'La vigencia solicitada debe ser 1, 3, 6 o 12 meses.')
  }
  const hasPending = existingGrants.some(
    (g) =>
      g.tenantId === actor.tenantId &&
      g.requesterAccountId === actor.id &&
      g.patientId === patient.id &&
      g.status === 'PENDIENTE',
  )
  if (hasPending) {
    return deny('DUPLICATE_PENDING', 'Ya existe una solicitud pendiente para este paciente.')
  }
  return allow()
}

/** Proceso excepcional sin ID (PC-01): AdminClinica aprueba (igual o menor alcance/vigencia) o rechaza. */
export function canResolveExceptionalRequest(
  actor: StaffAccount | null,
  grant: ExceptionalAccessGrant | undefined,
  decision: 'APROBAR' | 'RECHAZAR',
  approvedOperations: ExceptionalOperation[],
  approvedMonths: number,
): PolicyDecision {
  if (!actor || !actor.active || actor.role !== 'ADMIN_CLINICA') {
    return deny('FORBIDDEN_RESOLVER', 'Exclusivamente AdminClinica puede resolver solicitudes excepcionales.')
  }
  if (!grant || grant.tenantId !== actor.tenantId) {
    return deny('REQUEST_NOT_FOUND', 'Solicitud no encontrada dentro de esta clínica.')
  }
  if (grant.status !== 'PENDIENTE') {
    return deny('NOT_PENDING', 'Solo las solicitudes en estado PENDIENTE pueden resolverse.')
  }
  if (decision === 'APROBAR') {
    if (approvedOperations.length === 0) {
      return deny('APPROVED_OPS_REQUIRED', 'Debes conceder al menos una operación al aprobar.')
    }
    const exceedsOps = approvedOperations.some((op) => !grant.requestedOperations.includes(op))
    if (exceedsOps) {
      return deny(
        'EXCEEDS_REQUESTED_OPS',
        'No se pueden conceder operaciones que no fueron solicitadas originalmente.',
      )
    }
    if (!Number.isInteger(approvedMonths) || approvedMonths < 1 || approvedMonths > grant.requestedMonths) {
      return deny(
        'EXCEEDS_REQUESTED_DURATION',
        `La vigencia aprobada debe estar entre 1 y ${grant.requestedMonths} meses (nunca superior a la solicitada).`,
      )
    }
  }
  return allow()
}

export function canRevokeExceptionalGrant(
  actor: StaffAccount | null,
  grant: ExceptionalAccessGrant | undefined,
  nowIsoGmt6: string,
): PolicyDecision {
  if (!actor || !actor.active || actor.role !== 'ADMIN_CLINICA') {
    return deny('FORBIDDEN_REVOKE', 'Solo AdminClinica puede revocar permisos excepcionales.')
  }
  if (!grant || grant.tenantId !== actor.tenantId) {
    return deny('GRANT_NOT_FOUND', 'Permiso no encontrado dentro de esta clínica.')
  }
  if (!isGrantCurrentlyActive(grant, nowIsoGmt6)) {
    return deny('NOT_ACTIVE_GRANT', 'Solo se pueden revocar permisos aprobados y actualmente vigentes.')
  }
  return allow()
}
