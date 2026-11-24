import type {
  ChargeConceptCategory,
  ChargeSheetStatus,
  ClinicKpiKey,
  ClinicalEncounter,
  ClinicalNoteStatus,
  CutsStatusData,
  EncounterStatus,
  KpiEnvelope,
  PaymentMethod,
  RecordedPaymentsData,
  SpecialistCutStatus,
} from '../domain/types.ts'
import {
  clearIdentityTokens,
  createIdentityClient,
  getIdentityApiUrl,
  loadIdentityTokens,
} from './identityClient.ts'

export interface BillingProblemError {
  status: number
  code: string
  message: string
}

export class BillingApiError extends Error {
  readonly problem: BillingProblemError

  constructor(problem: BillingProblemError) {
    super(problem.message)
    this.name = 'BillingApiError'
    this.problem = problem
  }
}

export interface BillableConceptDto {
  code: string
  label: string
  category: ChargeConceptCategory
  defaultPriceMxn: number
}

export interface BillableConceptCatalogResponse {
  total: number
  items: BillableConceptDto[]
}

export interface BillingChargeLineItemInput {
  conceptCode: string
  description: string
  category: ChargeConceptCategory
  quantity: number
  unitPriceMxn: number
}

export interface BillingChargeLineItemDto {
  id: string
  conceptCode: string
  description: string
  category: ChargeConceptCategory
  quantity: number
  unitPriceMxn: number
  lineTotalMxn: number
}

export interface BillingChargeSheetAuditEventDto {
  id: string
  actorName: string
  occurredAtGmt6: string
  action: string
  detail: string
}

export interface BillingChargeSheetDto {
  id: string
  tenantId: string
  encounterId: string
  recordId: string
  patientId: string
  specialistId: string
  status: ChargeSheetStatus
  totalMxn: number
  items: BillingChargeLineItemDto[]
  reviewedByName: string | null
  reviewedAtGmt6: string | null
  createdAtGmt6: string
  updatedAtGmt6: string
  auditLog?: BillingChargeSheetAuditEventDto[] | null
}

export interface BillingChargeSheetListResponse {
  total: number
  items: BillingChargeSheetDto[]
}

export interface BillingPatientPaymentDto {
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

export interface BillingPaymentListResponse {
  total: number
  items: BillingPatientPaymentDto[]
}

export interface BillingRecordPaymentRequest {
  chargeSheetId: string
  amountMxn: number
  method: PaymentMethod
}

export interface BillingTotalsByMethodRawDto {
  efectivo?: number
  tarjeta?: number
  transferencia?: number
  EFECTIVO?: number
  TARJETA?: number
  TRANSFERENCIA?: number
}

export interface BillingCutEventDto {
  id: string
  status: SpecialistCutStatus
  actorName: string
  occurredAtGmt6: string
  note: string
}

export type BillingAdjustmentTargetType = 'PAYMENT' | 'CUT'

export interface BillingAdjustmentDto {
  id: string
  folio: string
  tenantId: string
  targetType: BillingAdjustmentTargetType
  targetId: string
  deltaMxn: number
  reason: string
  actorAccountId: string
  actorName: string
  createdAtGmt6: string
}

export interface BillingAdjustmentListResponse {
  total: number
  items: BillingAdjustmentDto[]
}

export interface BillingCreateAdjustmentRequest {
  targetType: BillingAdjustmentTargetType
  targetId: string
  deltaMxn: number
  reason: string
}

export interface BillingSpecialistCutDto {
  id: string
  folio: string
  tenantId: string
  specialistId: string
  specialistName: string
  periodStartGmt6: string
  periodEndGmt6: string
  status: SpecialistCutStatus
  totalsByMethod: BillingTotalsByMethodRawDto
  totalMxn: number
  paymentCount: number
  preparedByAccountId: string
  preparedByName: string
  preparedAtGmt6: string
  updatedAtGmt6: string
  confirmedByName: string | null
  confirmedAtGmt6: string | null
  lastObservationNote: string | null
}

export interface BillingSpecialistCutDetailDto extends BillingSpecialistCutDto {
  payments: BillingPatientPaymentDto[]
  history: BillingCutEventDto[]
  adjustments: BillingAdjustmentDto[]
}

export interface BillingSpecialistCutListResponse {
  total: number
  items: BillingSpecialistCutDto[]
}

export interface BillingPrepareCutRequest {
  specialistId: string
  periodStartGmt6: string
  periodEndGmt6: string
  paymentIds: string[]
  note?: string
}

export interface BillingReviseCutRequest {
  periodStartGmt6: string
  periodEndGmt6: string
  paymentIds: string[]
  adjustmentNote: string
}

export interface BillingKpiEnvelopeDto<TData> {
  kpiKey: ClinicKpiKey
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_APPLICABLE'
  data: TData | null
  evaluatedAtGmt6: string
  periodStartGmt6?: string | null
  periodEndGmt6?: string | null
  reason?: string | null
}

export interface BillingRecordedPaymentsDataRaw {
  totalMxn: number
  paymentCount: number
  byMethod: BillingTotalsByMethodRawDto
}

export interface BillingCutsStatusDataDto {
  totalCuts: number
  preparadoCount: number
  observadoCount: number
  confirmadoCount: number
  confirmedAmountMxn: number
  observedAmountMxn: number
}

/** Mapa determinista BFF entre IDs locales de atenciones demo y UUIDs de saas-billing. */
const MOCK_ENCOUNTER_TO_UUID: Record<string, string> = {
  'enc-0101-1': '40000000-0000-0000-0000-000000000101',
  'enc-0101-2': '40000000-0000-0000-0000-000000000102',
  'enc-0102-1': '40000000-0000-0000-0000-000000000103',
  'enc-0104-1': '40000000-0000-0000-0000-000000000104',
  'enc-0101-open': '40000000-0000-0000-0000-000000000105',
}

const UUID_TO_MOCK_ENCOUNTER: Record<string, string> = Object.fromEntries(
  Object.entries(MOCK_ENCOUNTER_TO_UUID).map(([mockId, uuid]) => [uuid, mockId]),
)

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface KnownSeededEncounterOption {
  encounterId: string
  mockId: string
  patientId: string
  specialistId: string
  label: string
}

export const KNOWN_SEEDED_ENCOUNTERS: KnownSeededEncounterOption[] = [
  {
    encounterId: '40000000-0000-0000-0000-000000000101',
    mockId: 'enc-0101-1',
    patientId: 'pat-norte-0101',
    specialistId: 'acc-norte-mendoza',
    label: 'enc-0101-1 (PAT-0101 · Dra. Sofía Mendoza · FINALIZADA)',
  },
  {
    encounterId: '40000000-0000-0000-0000-000000000102',
    mockId: 'enc-0101-2',
    patientId: 'pat-norte-0101',
    specialistId: 'acc-norte-mendoza',
    label: 'enc-0101-2 (PAT-0101 · Dra. Sofía Mendoza · FINALIZADA, nota BORRADOR)',
  },
  {
    encounterId: '40000000-0000-0000-0000-000000000103',
    mockId: 'enc-0102-1',
    patientId: 'pat-norte-0102',
    specialistId: 'acc-norte-salazar',
    label: 'enc-0102-1 (PAT-0102 · Dr. Mateo Salazar · FINALIZADA)',
  },
  {
    encounterId: '40000000-0000-0000-0000-000000000104',
    mockId: 'enc-0104-1',
    patientId: 'pat-norte-0104',
    specialistId: 'acc-norte-salazar',
    label: 'enc-0104-1 (PAT-0104 · Cobertura excepcional · FINALIZADA)',
  },
  {
    encounterId: '40000000-0000-0000-0000-000000000105',
    mockId: 'enc-0101-open',
    patientId: 'pat-norte-0101',
    specialistId: 'acc-norte-mendoza',
    label: 'enc-0101-open (PAT-0101 · Dra. Sofía Mendoza · EN_CURSO)',
  },
]

export function getBillingApiUrl(): string {
  const meta = import.meta as { env?: Record<string, string | undefined> }
  const configured = meta.env?.VITE_BILLING_API_URL
  return (configured && configured.trim()) || 'http://localhost:8084'
}

export function toBillingEncounterUuid(encounterId: string): string {
  const mapped = MOCK_ENCOUNTER_TO_UUID[encounterId]
  if (mapped) return mapped
  if (UUID_REGEX.test(encounterId)) return encounterId.toLowerCase()
  return encounterId
}

export function resolveEncounterDisplayBff(
  encounterUuid: string,
  encounters: ClinicalEncounter[],
  fallbackCreatedAtGmt6 = '2026-11-18T11:00:00-06:00',
): {
  displayId: string
  encounterStatus: EncounterStatus
  noteStatus: ClinicalNoteStatus
  startedAtGmt6: string
} {
  const normalized = encounterUuid.toLowerCase()
  const mockId = UUID_TO_MOCK_ENCOUNTER[normalized]
  const matched = encounters.find(
    (enc) => enc.id.toLowerCase() === normalized || (mockId ? enc.id === mockId : false),
  )

  if (matched) {
    return {
      displayId: matched.id,
      encounterStatus: matched.encounterStatus,
      noteStatus: matched.noteStatus,
      startedAtGmt6: matched.startedAtGmt6,
    }
  }

  if (normalized === '40000000-0000-0000-0000-000000000104') {
    return {
      displayId: 'enc-0104-1',
      encounterStatus: 'FINALIZADA',
      noteStatus: 'CERRADA',
      startedAtGmt6: '2026-11-20T12:30:00-06:00',
    }
  }

  if (normalized === '40000000-0000-0000-0000-000000000105') {
    return {
      displayId: 'enc-0101-open',
      encounterStatus: 'EN_CURSO',
      noteStatus: 'BORRADOR',
      startedAtGmt6: '2026-11-21T10:00:00-06:00',
    }
  }

  return {
    displayId: mockId ?? encounterUuid.slice(0, 8),
    encounterStatus: 'FINALIZADA',
    noteStatus: 'BORRADOR',
    startedAtGmt6: fallbackCreatedAtGmt6,
  }
}

function finiteOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function normalizeTotalsByMethod(
  raw: BillingTotalsByMethodRawDto | null | undefined,
): Record<PaymentMethod, number> {
  if (!raw) {
    return { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0 }
  }

  return {
    EFECTIVO: finiteOrZero(raw.EFECTIVO ?? raw.efectivo),
    TARJETA: finiteOrZero(raw.TARJETA ?? raw.tarjeta),
    TRANSFERENCIA: finiteOrZero(raw.TRANSFERENCIA ?? raw.transferencia),
  }
}

export function normalizePaymentsKpiEnvelope(
  dto: BillingKpiEnvelopeDto<BillingRecordedPaymentsDataRaw>,
): KpiEnvelope<ClinicKpiKey, RecordedPaymentsData> {
  if (dto.status !== 'AVAILABLE' || !dto.data) {
    return {
      kpiKey: dto.kpiKey,
      status: dto.status,
      data: null,
      evaluatedAtGmt6: dto.evaluatedAtGmt6,
      reason: dto.reason ?? undefined,
    }
  }

  return {
    kpiKey: dto.kpiKey,
    status: 'AVAILABLE',
    data: {
      totalMxn: dto.data.totalMxn,
      paymentCount: dto.data.paymentCount,
      byMethod: normalizeTotalsByMethod(dto.data.byMethod),
    },
    evaluatedAtGmt6: dto.evaluatedAtGmt6,
  }
}

export function normalizeCutsKpiEnvelope(
  dto: BillingKpiEnvelopeDto<BillingCutsStatusDataDto>,
): KpiEnvelope<ClinicKpiKey, CutsStatusData> {
  if (dto.status !== 'AVAILABLE' || !dto.data) {
    return {
      kpiKey: dto.kpiKey,
      status: dto.status,
      data: null,
      evaluatedAtGmt6: dto.evaluatedAtGmt6,
      reason: dto.reason ?? undefined,
    }
  }

  return {
    kpiKey: dto.kpiKey,
    status: 'AVAILABLE',
    data: dto.data,
    evaluatedAtGmt6: dto.evaluatedAtGmt6,
  }
}

export function parseBillingProblemDetails(
  status: number,
  payload: unknown,
  fallbackMessage: string,
): BillingProblemError {
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

    return { status, code, message }
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

export function createBillingClient(baseUrl: string) {
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
      throw new BillingApiError(
        parseBillingProblemDetails(
          response.status,
          payload,
          `Error en saas-billing (${response.status}).`,
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
      throw new BillingApiError({
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'No existe sesión JWT activa para consultar saas-billing.',
      })
    }

    try {
      return await rawRequest<T>(path, init, tokens.accessToken)
    } catch (err) {
      if (err instanceof BillingApiError && err.problem.status === 401) {
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
    listCatalogConcepts(): Promise<BillableConceptCatalogResponse> {
      return requestWithAutoRefresh<BillableConceptCatalogResponse>('/v1/catalog/concepts', {
        method: 'GET',
      })
    },

    listChargeSheets(params?: {
      encounterId?: string
      patientId?: string
      specialistId?: string
      status?: ChargeSheetStatus
    }): Promise<BillingChargeSheetListResponse> {
      const search = new URLSearchParams()
      if (params?.encounterId) search.set('encounterId', toBillingEncounterUuid(params.encounterId))
      if (params?.patientId) search.set('patientId', params.patientId)
      if (params?.specialistId) search.set('specialistId', params.specialistId)
      if (params?.status) search.set('status', params.status)
      const qs = search.toString()
      return requestWithAutoRefresh<BillingChargeSheetListResponse>(
        qs ? `/v1/charge-sheets?${qs}` : '/v1/charge-sheets',
        { method: 'GET' },
      )
    },

    getChargeSheetById(chargeSheetId: string): Promise<BillingChargeSheetDto> {
      return requestWithAutoRefresh<BillingChargeSheetDto>(`/v1/charge-sheets/${chargeSheetId}`, {
        method: 'GET',
      })
    },

    upsertChargeSheet(
      encounterId: string,
      items: BillingChargeLineItemInput[],
    ): Promise<BillingChargeSheetDto> {
      return requestWithAutoRefresh<BillingChargeSheetDto>(
        `/v1/encounters/${toBillingEncounterUuid(encounterId)}/charge-sheet`,
        {
          method: 'PUT',
          body: JSON.stringify({ items }),
        },
      )
    },

    reviewChargeSheet(chargeSheetId: string): Promise<BillingChargeSheetDto> {
      return requestWithAutoRefresh<BillingChargeSheetDto>(
        `/v1/charge-sheets/${chargeSheetId}/review`,
        { method: 'POST' },
      )
    },

    reopenChargeSheet(chargeSheetId: string): Promise<BillingChargeSheetDto> {
      return requestWithAutoRefresh<BillingChargeSheetDto>(
        `/v1/charge-sheets/${chargeSheetId}/reopen`,
        { method: 'POST' },
      )
    },

    listPayments(params?: {
      specialistId?: string
      patientId?: string
      method?: PaymentMethod
      unassignedOnly?: boolean
      fromDateGmt6?: string
      toDateGmt6?: string
    }): Promise<BillingPaymentListResponse> {
      const search = new URLSearchParams()
      if (params?.specialistId) search.set('specialistId', params.specialistId)
      if (params?.patientId) search.set('patientId', params.patientId)
      if (params?.method) search.set('method', params.method)
      if (params?.unassignedOnly !== undefined) {
        search.set('unassignedOnly', String(params.unassignedOnly))
      }
      if (params?.fromDateGmt6) search.set('fromDateGmt6', params.fromDateGmt6)
      if (params?.toDateGmt6) search.set('toDateGmt6', params.toDateGmt6)
      const qs = search.toString()
      return requestWithAutoRefresh<BillingPaymentListResponse>(
        qs ? `/v1/payments?${qs}` : '/v1/payments',
        { method: 'GET' },
      )
    },

    recordFullPayment(payload: BillingRecordPaymentRequest): Promise<BillingPatientPaymentDto> {
      return requestWithAutoRefresh<BillingPatientPaymentDto>('/v1/payments', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },

    listCuts(params?: {
      specialistId?: string
      status?: SpecialistCutStatus
      fromDateGmt6?: string
      toDateGmt6?: string
    }): Promise<BillingSpecialistCutListResponse> {
      const search = new URLSearchParams()
      if (params?.specialistId) search.set('specialistId', params.specialistId)
      if (params?.status) search.set('status', params.status)
      if (params?.fromDateGmt6) search.set('fromDateGmt6', params.fromDateGmt6)
      if (params?.toDateGmt6) search.set('toDateGmt6', params.toDateGmt6)
      const qs = search.toString()
      return requestWithAutoRefresh<BillingSpecialistCutListResponse>(
        qs ? `/v1/cuts?${qs}` : '/v1/cuts',
        { method: 'GET' },
      )
    },

    getCutById(cutId: string): Promise<BillingSpecialistCutDetailDto> {
      return requestWithAutoRefresh<BillingSpecialistCutDetailDto>(`/v1/cuts/${cutId}`, {
        method: 'GET',
      })
    },

    prepareCut(payload: BillingPrepareCutRequest): Promise<BillingSpecialistCutDetailDto> {
      return requestWithAutoRefresh<BillingSpecialistCutDetailDto>('/v1/cuts', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },

    reviseCut(
      cutId: string,
      payload: BillingReviseCutRequest,
    ): Promise<BillingSpecialistCutDetailDto> {
      return requestWithAutoRefresh<BillingSpecialistCutDetailDto>(`/v1/cuts/${cutId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
    },

    confirmCut(cutId: string, note?: string): Promise<BillingSpecialistCutDetailDto> {
      return requestWithAutoRefresh<BillingSpecialistCutDetailDto>(`/v1/cuts/${cutId}/confirm`, {
        method: 'POST',
        body: JSON.stringify(note && note.trim() ? { note } : {}),
      })
    },

    observeCut(cutId: string, note: string): Promise<BillingSpecialistCutDetailDto> {
      return requestWithAutoRefresh<BillingSpecialistCutDetailDto>(`/v1/cuts/${cutId}/observe`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      })
    },

    listAdjustments(params?: {
      targetType?: BillingAdjustmentTargetType
      targetId?: string
    }): Promise<BillingAdjustmentListResponse> {
      const search = new URLSearchParams()
      if (params?.targetType) search.set('targetType', params.targetType)
      if (params?.targetId) search.set('targetId', params.targetId)
      const qs = search.toString()
      return requestWithAutoRefresh<BillingAdjustmentListResponse>(
        qs ? `/v1/adjustments?${qs}` : '/v1/adjustments',
        { method: 'GET' },
      )
    },

    createAdjustment(payload: BillingCreateAdjustmentRequest): Promise<BillingAdjustmentDto> {
      return requestWithAutoRefresh<BillingAdjustmentDto>('/v1/adjustments', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },

    async getClinicPaymentsMetric(
      fromDateGmt6?: string,
      toDateGmt6?: string,
    ): Promise<KpiEnvelope<ClinicKpiKey, RecordedPaymentsData>> {
      const search = new URLSearchParams()
      if (fromDateGmt6) search.set('fromDateGmt6', fromDateGmt6)
      if (toDateGmt6) search.set('toDateGmt6', toDateGmt6)
      const qs = search.toString()
      const dto = await requestWithAutoRefresh<BillingKpiEnvelopeDto<BillingRecordedPaymentsDataRaw>>(
        qs ? `/v1/metrics/clinic/payments?${qs}` : '/v1/metrics/clinic/payments',
        { method: 'GET' },
      )
      return normalizePaymentsKpiEnvelope(dto)
    },

    async getClinicCutsMetric(
      fromDateGmt6?: string,
      toDateGmt6?: string,
    ): Promise<KpiEnvelope<ClinicKpiKey, CutsStatusData>> {
      const search = new URLSearchParams()
      if (fromDateGmt6) search.set('fromDateGmt6', fromDateGmt6)
      if (toDateGmt6) search.set('toDateGmt6', toDateGmt6)
      const qs = search.toString()
      const dto = await requestWithAutoRefresh<BillingKpiEnvelopeDto<BillingCutsStatusDataDto>>(
        qs ? `/v1/metrics/clinic/cuts?${qs}` : '/v1/metrics/clinic/cuts',
        { method: 'GET' },
      )
      return normalizeCutsKpiEnvelope(dto)
    },
  }
}
