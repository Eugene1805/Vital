import type {
  OrgRole,
  ProfessionalAttribution,
  StaffPermissions,
  TenantStatus,
} from '../domain/types.ts'

export type IdentityAuthMode = 'mock' | 'identity'

export interface IdentityTokens {
  accessToken: string
  refreshToken: string
}

export interface IdentityProblemError {
  status: number
  code: string
  message: string
  retryAfterSeconds?: number
  lockoutUntilGmt6?: string
}

export class IdentityApiError extends Error {
  readonly problem: IdentityProblemError

  constructor(problem: IdentityProblemError) {
    super(problem.message)
    this.name = 'IdentityApiError'
    this.problem = problem
  }
}

export interface IdentityAccountProfileDto {
  id: string
  tenantId: string | null
  fullName: string
  email: string
  role: OrgRole
  active: boolean
  mustChangePassword: boolean
  specialty?: string | null
  professionalAttribution: ProfessionalAttribution | null
  permissions: StaffPermissions
  linkedSpecialistIds: string[]
  createdAtGmt6: string
}

export interface IdentityTenantSummaryDto {
  tenantId: string
  slug: string
  name: string
  state: TenantStatus
}

export interface IdentityAuthSessionResponse {
  accessToken: string
  tokenType: string
  accessTokenExpiresAtGmt6: string
  refreshToken: string
  refreshTokenExpiresAtGmt6: string
  account: IdentityAccountProfileDto
  tenant: IdentityTenantSummaryDto | null
}

export interface IdentityRoleAuditEntryDto {
  id: string
  previousRole: OrgRole
  nextRole: OrgRole
  previousCanPrescribe: boolean
  nextCanPrescribe: boolean
  actorName: string
  occurredAtGmt6: string
  note: string
}

export interface IdentityStaffMemberDto {
  id: string
  tenantId: string
  fullName: string
  email: string
  role: OrgRole
  active: boolean
  mustChangePassword: boolean
  specialty?: string | null
  professionalAttribution: ProfessionalAttribution | null
  permissions: StaffPermissions
  linkedSpecialistIds: string[]
  createdAtGmt6: string
  roleAuditLog: IdentityRoleAuditEntryDto[]
}

export interface IdentityStaffDirectoryResponse {
  tenantId: string
  tenantSlug: string
  tenantName: string
  activeCount: number
  maxActiveAccounts: number
  accounts: IdentityStaffMemberDto[]
}

export interface IdentityCreateStaffRequest {
  fullName: string
  email: string
  password?: string
  generateTemporaryPassword: boolean
  role: OrgRole
  specialty?: string
  licenseCode?: string
  title?: string
  permissions: StaffPermissions
}

export interface IdentityCreateStaffResponse {
  account: IdentityStaffMemberDto
  temporaryPassword: string | null
}

export interface IdentityUpdateStaffRoleRequest {
  role: OrgRole
  specialty?: string
  licenseCode?: string
  title?: string
  canPrescribe: boolean
  canRegisterPatients: boolean
  canAssignInitialPrimary: boolean
  canUploadStudies: boolean
  note?: string
}

const TOKENS_STORAGE_KEY = 'vital_identity_tokens_v1'
const TENANT_STORAGE_KEY = 'vital_identity_tenant_v1'
const AUTH_MODE_OVERRIDE_KEY = 'vital_auth_mode_override_v1'

function readImportMetaEnv(key: string): string | undefined {
  const meta = import.meta as { env?: Record<string, string | undefined> }
  return meta.env?.[key]
}

export function getIdentityApiUrl(): string {
  const configured = readImportMetaEnv('VITE_IDENTITY_API_URL')
  return (configured && configured.trim()) || 'http://localhost:8081'
}

export function getInitialAuthMode(): IdentityAuthMode {
  if (typeof window !== 'undefined') {
    try {
      const override = window.localStorage.getItem(AUTH_MODE_OVERRIDE_KEY)
      if (override === 'mock' || override === 'identity') {
        return override
      }
    } catch {
      // Ignorar errores de acceso a almacenamiento local.
    }
  }
  return readImportMetaEnv('VITE_AUTH_MODE') === 'identity' ? 'identity' : 'mock'
}

export function saveAuthModeOverride(mode: IdentityAuthMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(AUTH_MODE_OVERRIDE_KEY, mode)
  } catch {
    // Ignorar errores de acceso a almacenamiento local.
  }
}

export function loadIdentityTokens(): IdentityTokens | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(TOKENS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<IdentityTokens>
    if (
      typeof parsed.accessToken === 'string' &&
      parsed.accessToken.length > 0 &&
      typeof parsed.refreshToken === 'string' &&
      parsed.refreshToken.length > 0
    ) {
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
      }
    }
  } catch {
    // Ignorar payloads corruptos.
  }
  return null
}

export function saveIdentityTokens(tokens: IdentityTokens): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(tokens))
  } catch {
    // Ignorar errores de almacenamiento.
  }
}

export function saveIdentityTenantSummary(tenant: IdentityTenantSummaryDto | null): void {
  if (typeof window === 'undefined') return
  try {
    if (!tenant) {
      window.localStorage.removeItem(TENANT_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(TENANT_STORAGE_KEY, JSON.stringify(tenant))
  } catch {
    // Ignorar errores de almacenamiento.
  }
}

export function loadIdentityTenantSummary(): IdentityTenantSummaryDto | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(TENANT_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as IdentityTenantSummaryDto
  } catch {
    return null
  }
}

export function clearIdentityTokens(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(TOKENS_STORAGE_KEY)
    window.localStorage.removeItem(TENANT_STORAGE_KEY)
  } catch {
    // Ignorar errores de almacenamiento.
  }
}

/** Política de contraseñas ratificada: 8 a 40 caracteres con al menos letra, número y símbolo. */
export function validatePasswordPolicy(password: string): string | null {
  if (!password || password.length < 8 || password.length > 40) {
    return 'La contraseña debe tener entre 8 y 40 caracteres e incluir al menos una letra, un número y un símbolo.'
  }

  let hasLetter = false
  let hasDigit = false
  let hasSymbol = false

  for (const ch of password) {
    const code = ch.charCodeAt(0)
    if (code < 32 || code === 127) {
      return 'La contraseña contiene caracteres de control no permitidos.'
    }
    if (/\p{L}/u.test(ch)) {
      hasLetter = true
    } else if (/\p{N}/u.test(ch)) {
      hasDigit = true
    } else if (!/\s/u.test(ch)) {
      hasSymbol = true
    }
  }

  if (!hasLetter || !hasDigit || !hasSymbol) {
    return 'La contraseña debe tener entre 8 y 40 caracteres e incluir al menos una letra, un número y un símbolo.'
  }

  return null
}

export function parseProblemDetails(
  status: number,
  payload: unknown,
  fallbackMessage: string,
): IdentityProblemError {
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
    const retryAfterSeconds =
      typeof record.retryAfterSeconds === 'number' && Number.isFinite(record.retryAfterSeconds)
        ? record.retryAfterSeconds
        : undefined
    const lockoutUntilGmt6 =
      typeof record.lockoutUntilGmt6 === 'string' ? record.lockoutUntilGmt6 : undefined

    return {
      status,
      code,
      message,
      retryAfterSeconds,
      lockoutUntilGmt6,
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

export function createIdentityClient(baseUrl: string) {
  const normalizedBase = baseUrl.replace(/\/+$/, '')

  async function rawRequest<T>(
    path: string,
    init: RequestInit,
    accessToken?: string,
  ): Promise<T> {
    const headers = new Headers(init.headers)
    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`)
    }

    const response = await fetch(`${normalizedBase}${path}`, {
      ...init,
      headers,
    })

    if (!response.ok) {
      const payload = await readJsonSafe(response)
      throw new IdentityApiError(
        parseProblemDetails(
          response.status,
          payload,
          `Error de identidad (${response.status}).`,
        ),
      )
    }

    if (response.status === 204) {
      return undefined as T
    }

    return (await response.json()) as T
  }

  async function refreshTokens(refreshToken: string): Promise<IdentityAuthSessionResponse> {
    const session = await rawRequest<IdentityAuthSessionResponse>('/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    })
    saveIdentityTokens({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    })
    return session
  }

  async function requestWithAutoRefresh<T>(path: string, init: RequestInit): Promise<T> {
    const tokens = loadIdentityTokens()
    if (!tokens) {
      throw new IdentityApiError({
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'No existe una sesión activa en Identity.',
      })
    }

    try {
      return await rawRequest<T>(path, init, tokens.accessToken)
    } catch (err) {
      if (err instanceof IdentityApiError && err.problem.status === 401) {
        try {
          const refreshed = await refreshTokens(tokens.refreshToken)
          return await rawRequest<T>(path, init, refreshed.accessToken)
        } catch (refreshErr) {
          clearIdentityTokens()
          throw refreshErr
        }
      }
      throw err
    }
  }

  return {
    async loginClinic(
      clinicSlug: string,
      email: string,
      password: string,
    ): Promise<IdentityAuthSessionResponse> {
      const session = await rawRequest<IdentityAuthSessionResponse>('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ clinicSlug, email, password }),
      })
      saveIdentityTokens({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      })
      return session
    },

    async loginPlatform(email: string, password: string): Promise<IdentityAuthSessionResponse> {
      const session = await rawRequest<IdentityAuthSessionResponse>('/v1/auth/platform/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      saveIdentityTokens({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      })
      return session
    },

    refresh: refreshTokens,

    async logout(): Promise<void> {
      const tokens = loadIdentityTokens()
      clearIdentityTokens()
      if (!tokens) return
      try {
        await rawRequest<void>('/v1/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        })
      } catch {
        // El cierre local de sesión siempre se completa aunque el token ya estuviera expirado.
      }
    },

    getMe(): Promise<IdentityAccountProfileDto> {
      return requestWithAutoRefresh<IdentityAccountProfileDto>('/v1/auth/me', {
        method: 'GET',
      })
    },

    changePassword(currentPassword: string, newPassword: string): Promise<void> {
      return requestWithAutoRefresh<void>('/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
    },

    listStaff(): Promise<IdentityStaffDirectoryResponse> {
      return requestWithAutoRefresh<IdentityStaffDirectoryResponse>('/v1/staff', {
        method: 'GET',
      })
    },

    createStaff(payload: IdentityCreateStaffRequest): Promise<IdentityCreateStaffResponse> {
      return requestWithAutoRefresh<IdentityCreateStaffResponse>('/v1/staff', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },

    updateStaffRole(
      accountId: string,
      payload: IdentityUpdateStaffRoleRequest,
    ): Promise<IdentityStaffMemberDto> {
      return requestWithAutoRefresh<IdentityStaffMemberDto>(`/v1/staff/${accountId}/role`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
    },

    updateStaffStatus(accountId: string, active: boolean): Promise<IdentityStaffMemberDto> {
      return requestWithAutoRefresh<IdentityStaffMemberDto>(`/v1/staff/${accountId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      })
    },

    updateAuxiliaryLinks(
      accountId: string,
      specialistIds: string[],
    ): Promise<IdentityStaffMemberDto> {
      return requestWithAutoRefresh<IdentityStaffMemberDto>(`/v1/staff/${accountId}/links`, {
        method: 'PUT',
        body: JSON.stringify({ specialistIds }),
      })
    },
  }
}
