import type {
  AppointmentStatus,
  PatientAdminRecord,
  ScheduleDayOfWeek,
  ScheduleTimeSlot,
} from '../domain/types.ts'
import {
  clearIdentityTokens,
  createIdentityClient,
  getIdentityApiUrl,
  loadIdentityTokens,
} from './identityClient.ts'

export interface AgendaProblemError {
  status: number
  code: string
  message: string
  conflictingCount?: number
  conflictingAppointmentIds?: string[]
  conflictingSlotsGmt6?: string[]
}

export class AgendaApiError extends Error {
  readonly problem: AgendaProblemError

  constructor(problem: AgendaProblemError) {
    super(problem.message)
    this.name = 'AgendaApiError'
    this.problem = problem
  }
}

export interface AgendaAppointmentDto {
  id: string
  tenantId: string
  patientId: string
  specialistId: string
  scheduledStartGmt6: string
  scheduledEndGmt6: string
  durationMinutes: number
  reason: string
  status: AppointmentStatus
  allowedNextStatuses: AppointmentStatus[]
  createdByAccountId: string
  createdByName: string
  createdAtGmt6: string
  updatedAtGmt6: string
}

export interface AgendaAppointmentHistoryItemDto {
  id: string
  eventType: 'CREATED' | 'RESCHEDULED' | 'STATUS_CHANGED'
  fromStatus: AppointmentStatus | null
  toStatus: AppointmentStatus
  previousStartGmt6: string | null
  newStartGmt6: string | null
  previousDurationMinutes: number | null
  newDurationMinutes: number | null
  actorAccountId: string
  actorName: string
  note: string | null
  occurredAtGmt6: string
}

export interface AgendaAppointmentDetailDto extends AgendaAppointmentDto {
  history: AgendaAppointmentHistoryItemDto[]
}

export interface AgendaAppointmentListResponse {
  total: number
  items: AgendaAppointmentDto[]
}

export interface AgendaClinicScheduleDto {
  tenantId: string
  configured: boolean
  slots: ScheduleTimeSlot[]
  updatedByName: string | null
  updatedAtGmt6: string | null
}

export interface AgendaScheduleExceptionDto {
  id: string
  specialistId: string
  dateGmt6: string
  isUnavailable: boolean
  customStartTime: string | null
  customEndTime: string | null
  reason: string
  createdByName: string
  updatedAtGmt6: string
}

export interface AgendaSpecialistScheduleDto {
  tenantId: string
  specialistId: string
  configured: boolean
  useClinicFallback: boolean
  ownSlots: ScheduleTimeSlot[]
  effectiveWeeklySlots: ScheduleTimeSlot[]
  upcomingExceptions: AgendaScheduleExceptionDto[]
  updatedByName: string | null
  updatedAtGmt6: string | null
}

export interface AgendaAvailabilityBusyBlockDto {
  appointmentId: string
  scheduledStartGmt6: string
  scheduledEndGmt6: string
  status: AppointmentStatus
}

export interface AgendaAvailabilityFreeSlotDto {
  startTime: string
  endTime: string
  scheduledStartGmt6: string
  scheduledEndGmt6: string
}

export interface AgendaSpecialistAvailabilityDto {
  tenantId: string
  specialistId: string
  dateGmt6: string
  durationMinutes: number
  source: 'EXCEPTION' | 'SPECIALIST_SCHEDULE' | 'CLINIC_FALLBACK' | 'UNCONFIGURED'
  isUnavailable: boolean
  reason: string | null
  workingBlocks: ScheduleTimeSlot[]
  busyBlocks: AgendaAvailabilityBusyBlockDto[]
  availableSlots: AgendaAvailabilityFreeSlotDto[]
}

export interface AgendaMetricsEnvelopeDto {
  kpiKey: string
  status: 'AVAILABLE'
  data: {
    total: number
    byStatus: Record<AppointmentStatus, number>
  }
  evaluatedAtGmt6: string
  periodStartGmt6: string | null
  periodEndGmt6: string | null
}

/** Mapa determinista BFF entre IDs de pacientes demo locales y UUIDs de saas-agenda (D-AG-05). */
const MOCK_PATIENT_TO_UUID: Record<string, string> = {
  'pat-norte-0101': '30000000-0000-0000-0000-000000000101',
  'pat-norte-0102': '30000000-0000-0000-0000-000000000102',
  'pat-norte-0103': '30000000-0000-0000-0000-000000000103',
  'pat-norte-0104': '30000000-0000-0000-0000-000000000104',
  'pat-valle-0201': '30000000-0000-0000-0000-000000000201',
}

const UUID_TO_MOCK_PATIENT: Record<string, string> = Object.fromEntries(
  Object.entries(MOCK_PATIENT_TO_UUID).map(([mockId, uuid]) => [uuid, mockId]),
)

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const SCHEDULE_DAY_ORDER: ScheduleDayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]

export const SCHEDULE_DAY_LABELS: Record<ScheduleDayOfWeek, string> = {
  MONDAY: 'Lunes',
  TUESDAY: 'Martes',
  WEDNESDAY: 'Miércoles',
  THURSDAY: 'Jueves',
  FRIDAY: 'Viernes',
  SATURDAY: 'Sábado',
  SUNDAY: 'Domingo',
}

export interface BffSpecialistOption {
  id: string
  fullName: string
  specialty?: string
}

/** Mapa determinista BFF entre IDs locales de clínica/especialista y UUIDs de saas-agenda (D-AG-05). */
const MOCK_TENANT_TO_UUID: Record<string, string> = {
  'tenant-norte': '10000000-0000-0000-0000-000000000001',
  'tenant-valle': '10000000-0000-0000-0000-000000000002',
  'tenant-aurora': '10000000-0000-0000-0000-000000000003',
}

const SPECIALIST_MOCK_TO_UUID: Record<string, string> = {
  'acc-norte-mendoza': '20000000-0000-0000-0000-000000000003',
  'acc-norte-salazar': '20000000-0000-0000-0000-000000000004',
  'acc-valle-mendoza': '20000000-0000-0000-0000-000000000008',
}

const SPECIALIST_UUID_TO_MOCK: Record<string, string> = Object.fromEntries(
  Object.entries(SPECIALIST_MOCK_TO_UUID).map(([mockId, uuid]) => [uuid, mockId]),
)

const KNOWN_SEEDED_SPECIALISTS: Array<BffSpecialistOption & { tenantId: string; active: boolean }> = [
  {
    id: '20000000-0000-0000-0000-000000000003',
    tenantId: '10000000-0000-0000-0000-000000000001',
    fullName: 'Dra. Sofía Mendoza',
    specialty: 'Cardiología',
    active: true,
  },
  {
    id: '20000000-0000-0000-0000-000000000004',
    tenantId: '10000000-0000-0000-0000-000000000001',
    fullName: 'Dr. Mateo Salazar',
    specialty: 'Medicina General',
    active: true,
  },
  {
    id: '20000000-0000-0000-0000-000000000008',
    tenantId: '10000000-0000-0000-0000-000000000002',
    fullName: 'Dra. Sofía Mendoza (Cuenta Valle)',
    specialty: 'Cardiología',
    active: true,
  },
]

export function isSameSpecialistBff(leftId: string | null | undefined, rightId: string | null | undefined): boolean {
  if (!leftId || !rightId) return false
  const a = leftId.toLowerCase()
  const b = rightId.toLowerCase()
  if (a === b) return true
  const aUuid = SPECIALIST_MOCK_TO_UUID[a] ?? a
  const bUuid = SPECIALIST_MOCK_TO_UUID[b] ?? b
  if (aUuid === bUuid) return true
  const aMock = SPECIALIST_UUID_TO_MOCK[a] ?? a
  const bMock = SPECIALIST_UUID_TO_MOCK[b] ?? b
  return aMock === bMock
}

export function getAgendaApiUrl(): string {
  const meta = import.meta as { env?: Record<string, string | undefined> }
  const configured = meta.env?.VITE_AGENDA_API_URL
  return (configured && configured.trim()) || 'http://localhost:8083'
}

export function toAgendaPatientUuid(patientId: string): string {
  const mapped = MOCK_PATIENT_TO_UUID[patientId]
  if (mapped) return mapped
  if (UUID_REGEX.test(patientId)) return patientId.toLowerCase()
  return patientId
}

export function resolvePatientDisplayBff(
  patientUuid: string,
  patients: PatientAdminRecord[],
): { patientCode: string; fullName: string; linkPatientId: string | null } {
  const normalized = patientUuid.toLowerCase()
  const mockId = UUID_TO_MOCK_PATIENT[normalized]
  const matched = patients.find(
    (p) => p.id === normalized || (mockId ? p.id === mockId : false),
  )

  if (matched) {
    return {
      patientCode: matched.patientCode,
      fullName: matched.fullName,
      linkPatientId: matched.id,
    }
  }

  if (normalized === '30000000-0000-0000-0000-000000000104') {
    return {
      patientCode: 'PAT-0104',
      fullName: 'Paciente cobertura excepcional (PAT-0104)',
      linkPatientId: null,
    }
  }

  return {
    patientCode: patientUuid.slice(0, 8),
    fullName: `Paciente ${patientUuid.slice(0, 8)}`,
    linkPatientId: null,
  }
}

export function resolveActiveSpecialistsBff(
  tenantId: string | null,
  identityAccounts: Array<{
    id: string
    role: string
    active: boolean
    fullName: string
    specialty?: string | null
  }> | null,
): BffSpecialistOption[] {
  if (identityAccounts && identityAccounts.length > 0) {
    return identityAccounts
      .filter((a) => a.role === 'ESPECIALISTA' && a.active)
      .map((a) => ({
        id: a.id,
        fullName: a.fullName,
        specialty: a.specialty ?? undefined,
      }))
  }

  const normalizedTenantId = tenantId
    ? (MOCK_TENANT_TO_UUID[tenantId.toLowerCase()] ?? tenantId).toLowerCase()
    : null

  return KNOWN_SEEDED_SPECIALISTS.filter(
    (s) => s.active && (!normalizedTenantId || s.tenantId.toLowerCase() === normalizedTenantId),
  ).map((s) => ({
    id: s.id,
    fullName: s.fullName,
    specialty: s.specialty,
  }))
}

export function resolveSpecialistDisplayBff(
  specialistId: string,
  staffList: Array<{ id: string; fullName: string; specialty?: string | null }>,
): { fullName: string; specialty?: string } {
  const normalized = specialistId.toLowerCase()
  const matched = staffList.find((s) => s.id.toLowerCase() === normalized)
  if (matched) {
    return { fullName: matched.fullName, specialty: matched.specialty ?? undefined }
  }

  const seeded = KNOWN_SEEDED_SPECIALISTS.find((s) => s.id.toLowerCase() === normalized)
  if (seeded) {
    return { fullName: seeded.fullName, specialty: seeded.specialty }
  }

  return { fullName: `Especialista ${specialistId.slice(0, 8)}` }
}

export function parseAgendaProblemDetails(
  status: number,
  payload: unknown,
  fallbackMessage: string,
): AgendaProblemError {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const code =
      typeof record.code === 'string' && record.code
        ? record.code
        : typeof record.title === 'string' && record.title
          ? record.title
          : `HTTP_${status}`
    const message =
      typeof record.detail === 'string' && record.detail
        ? record.detail
        : typeof record.message === 'string' && record.message
          ? record.message
          : fallbackMessage
    const conflictingCount =
      typeof record.conflictingCount === 'number' && Number.isFinite(record.conflictingCount)
        ? record.conflictingCount
        : undefined
    const conflictingAppointmentIds = Array.isArray(record.conflictingAppointmentIds)
      ? record.conflictingAppointmentIds.filter((item): item is string => typeof item === 'string')
      : undefined
    const conflictingSlotsGmt6 = Array.isArray(record.conflictingSlotsGmt6)
      ? record.conflictingSlotsGmt6.filter((item): item is string => typeof item === 'string')
      : undefined

    return {
      status,
      code,
      message,
      conflictingCount,
      conflictingAppointmentIds,
      conflictingSlotsGmt6,
    }
  }

  return {
    status,
    code: `HTTP_${status}`,
    message: fallbackMessage,
  }
}

async function readJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

export function createAgendaClient(baseUrl: string) {
  const normalizedBase = baseUrl.replace(/\/+$/, '')

  async function rawRequest<T>(
    path: string,
    init: RequestInit,
    accessToken: string,
  ): Promise<T> {
    const headers = new Headers(init.headers)
    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    headers.set('Authorization', `Bearer ${accessToken}`)

    const response = await fetch(`${normalizedBase}${path}`, {
      ...init,
      headers,
    })

    if (!response.ok) {
      const payload = await readJsonSafe(response)
      throw new AgendaApiError(
        parseAgendaProblemDetails(
          response.status,
          payload,
          `Error en saas-agenda (${response.status}).`,
        ),
      )
    }

    if (response.status === 204) {
      return undefined as T
    }

    return (await response.json()) as T
  }

  async function requestWithAutoRefresh<T>(path: string, init: RequestInit): Promise<T> {
    const tokens = loadIdentityTokens()
    if (!tokens) {
      throw new AgendaApiError({
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'No existe sesión JWT activa para consultar saas-agenda.',
      })
    }

    try {
      return await rawRequest<T>(path, init, tokens.accessToken)
    } catch (err) {
      if (err instanceof AgendaApiError && err.problem.status === 401) {
        try {
          const identityClient = createIdentityClient(getIdentityApiUrl())
          const refreshed = await identityClient.refresh(tokens.refreshToken)
          return await rawRequest<T>(path, init, refreshed.accessToken)
        } catch {
          clearIdentityTokens()
          throw err
        }
      }
      throw err
    }
  }

  return {
    listAppointments(params?: {
      specialistId?: string
      patientId?: string
      status?: AppointmentStatus
      fromDateGmt6?: string
      toDateGmt6?: string
    }): Promise<AgendaAppointmentListResponse> {
      const search = new URLSearchParams()
      if (params?.specialistId) search.set('specialistId', params.specialistId)
      if (params?.patientId) search.set('patientId', params.patientId)
      if (params?.status) search.set('status', params.status)
      if (params?.fromDateGmt6) search.set('fromDateGmt6', params.fromDateGmt6)
      if (params?.toDateGmt6) search.set('toDateGmt6', params.toDateGmt6)
      const qs = search.toString()
      return requestWithAutoRefresh<AgendaAppointmentListResponse>(
        qs ? `/v1/appointments?${qs}` : '/v1/appointments',
        { method: 'GET' },
      )
    },

    getAppointmentDetail(appointmentId: string): Promise<AgendaAppointmentDetailDto> {
      return requestWithAutoRefresh<AgendaAppointmentDetailDto>(
        `/v1/appointments/${appointmentId}`,
        { method: 'GET' },
      )
    },

    createAppointment(payload: {
      patientId: string
      specialistId: string
      scheduledStartGmt6: string
      durationMinutes: number
      reason: string
    }): Promise<AgendaAppointmentDto> {
      return requestWithAutoRefresh<AgendaAppointmentDto>('/v1/appointments', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          patientId: toAgendaPatientUuid(payload.patientId),
        }),
      })
    },

    rescheduleAppointment(
      appointmentId: string,
      payload: {
        scheduledStartGmt6: string
        durationMinutes: number
        note?: string
      },
    ): Promise<AgendaAppointmentDto> {
      return requestWithAutoRefresh<AgendaAppointmentDto>(
        `/v1/appointments/${appointmentId}/reschedule`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
      )
    },

    transitionAppointmentStatus(
      appointmentId: string,
      payload: {
        nextStatus: AppointmentStatus
        note?: string
      },
    ): Promise<AgendaAppointmentDto> {
      return requestWithAutoRefresh<AgendaAppointmentDto>(
        `/v1/appointments/${appointmentId}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      )
    },

    getClinicSchedule(): Promise<AgendaClinicScheduleDto> {
      return requestWithAutoRefresh<AgendaClinicScheduleDto>('/v1/schedules/clinic', {
        method: 'GET',
      })
    },

    updateClinicSchedule(slots: ScheduleTimeSlot[]): Promise<AgendaClinicScheduleDto> {
      return requestWithAutoRefresh<AgendaClinicScheduleDto>('/v1/schedules/clinic', {
        method: 'PUT',
        body: JSON.stringify({ slots }),
      })
    },

    getSpecialistSchedule(specialistId: string): Promise<AgendaSpecialistScheduleDto> {
      return requestWithAutoRefresh<AgendaSpecialistScheduleDto>(
        `/v1/schedules/specialists/${specialistId}`,
        { method: 'GET' },
      )
    },

    updateSpecialistSchedule(
      specialistId: string,
      payload: { useClinicFallback: boolean; slots: ScheduleTimeSlot[] },
    ): Promise<AgendaSpecialistScheduleDto> {
      return requestWithAutoRefresh<AgendaSpecialistScheduleDto>(
        `/v1/schedules/specialists/${specialistId}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
      )
    },

    upsertSpecialistException(
      specialistId: string,
      payload: {
        dateGmt6: string
        isUnavailable: boolean
        customStartTime: string | null
        customEndTime: string | null
        reason: string
      },
    ): Promise<AgendaScheduleExceptionDto> {
      return requestWithAutoRefresh<AgendaScheduleExceptionDto>(
        `/v1/schedules/specialists/${specialistId}/exceptions`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      )
    },

    deleteSpecialistException(specialistId: string, exceptionId: string): Promise<void> {
      return requestWithAutoRefresh<void>(
        `/v1/schedules/specialists/${specialistId}/exceptions/${exceptionId}`,
        { method: 'DELETE' },
      )
    },

    getSpecialistAvailability(
      specialistId: string,
      dateGmt6: string,
      durationMinutes = 30,
    ): Promise<AgendaSpecialistAvailabilityDto> {
      const search = new URLSearchParams({
        dateGmt6,
        durationMinutes: String(durationMinutes),
      })
      return requestWithAutoRefresh<AgendaSpecialistAvailabilityDto>(
        `/v1/schedules/specialists/${specialistId}/availability?${search.toString()}`,
        { method: 'GET' },
      )
    },

    getClinicMetrics(fromDateGmt6?: string, toDateGmt6?: string): Promise<AgendaMetricsEnvelopeDto> {
      const search = new URLSearchParams()
      if (fromDateGmt6) search.set('fromDateGmt6', fromDateGmt6)
      if (toDateGmt6) search.set('toDateGmt6', toDateGmt6)
      const qs = search.toString()
      return requestWithAutoRefresh<AgendaMetricsEnvelopeDto>(
        qs ? `/v1/metrics/clinic/activity?${qs}` : '/v1/metrics/clinic/activity',
        { method: 'GET' },
      )
    },

    getPlatformMetrics(
      fromDateGmt6?: string,
      toDateGmt6?: string,
    ): Promise<AgendaMetricsEnvelopeDto> {
      const search = new URLSearchParams()
      if (fromDateGmt6) search.set('fromDateGmt6', fromDateGmt6)
      if (toDateGmt6) search.set('toDateGmt6', toDateGmt6)
      const qs = search.toString()
      return requestWithAutoRefresh<AgendaMetricsEnvelopeDto>(
        qs ? `/v1/metrics/platform/activity?${qs}` : '/v1/metrics/platform/activity',
        { method: 'GET' },
      )
    },
  }
}
