import { useId, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ClinicIcon, EyeIcon, EyeOffIcon, ShieldIcon } from '../../design-system/Icons.tsx'
import { StatusBadge } from '../../design-system/StatusBadge.tsx'
import { defaultRouteForRole } from '../../guards/policy.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'

interface DemoCredentialPreset {
  label: string
  note: string
  clinicSlug: string
  email: string
  password: string
}

const DEMO_CASES: DemoCredentialPreset[] = [
  {
    label: 'AdminClinica (Clínica Norte)',
    note: 'ACTIVA',
    clinicSlug: 'clinica-norte',
    email: 'admin@norte.vital.demo',
    password: 'Vital2026!',
  },
  {
    label: 'Dra. Sofía Mendoza (Cardiología, c/ receta)',
    note: 'ACTIVA',
    clinicSlug: 'clinica-norte',
    email: 'dra.mendoza@norte.vital.demo',
    password: 'Vital2026!',
  },
  {
    label: 'Dr. Mateo Salazar (sin cédula registrada)',
    note: 'ACTIVA',
    clinicSlug: 'clinica-norte',
    email: 'dr.salazar@norte.vital.demo',
    password: 'Vital2026!',
  },
  {
    label: 'Enf. Clara Ramírez (Auxiliar)',
    note: 'ACTIVA',
    clinicSlug: 'clinica-norte',
    email: 'aux.ramirez@norte.vital.demo',
    password: 'Vital2026!',
  },
  {
    label: 'Prueba negativa: Dr. Vega (cuenta desactivada)',
    note: 'CU-13 A3',
    clinicSlug: 'clinica-norte',
    email: 'dr.vega@norte.vital.demo',
    password: 'Vital2026!',
  },
  {
    label: 'Prueba negativa: Admin en clínica SUSPENDIDA',
    note: 'CU-13 A3',
    clinicSlug: 'clinica-valle',
    email: 'admin@valle.vital.demo',
    password: 'Vital2026!',
  },
  {
    label: 'Prueba negativa: Dra. Mendoza Valle usada en Norte',
    note: 'CU-13 A2',
    clinicSlug: 'clinica-norte',
    email: 'dra.mendoza@valle.vital.demo',
    password: 'Vital2026!',
  },
]

export function ClinicLoginPage() {
  const { tenants, authMode, identityApiUrl, loginClinic } = useMockStore()
  const navigate = useNavigate()

  const [clinicSlug, setClinicSlug] = useState('clinica-norte')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [touched, setTouched] = useState<{ slug?: boolean; email?: boolean; password?: boolean }>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showDemoCases, setShowDemoCases] = useState(false)

  const slugInputRef = useRef<HTMLInputElement>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()

  const normalizedSlug = clinicSlug.trim().toLowerCase()
  const resolvedTenant = tenants.find((t) => t.slug.toLowerCase() === normalizedSlug)

  const slugError = !normalizedSlug ? 'Ingresa el identificador de la clínica.' : undefined
  const emailError = !email.trim()
    ? 'Ingresa el correo electrónico de tu cuenta.'
    : !email.includes('@')
      ? 'Ingresa un correo electrónico válido.'
      : undefined
  const passwordError = !password ? 'Ingresa tu contraseña.' : undefined

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setTouched({ slug: true, email: true, password: true })
    setSubmitError(null)

    if (slugError) {
      slugInputRef.current?.focus()
      return
    }
    if (emailError) {
      emailInputRef.current?.focus()
      return
    }
    if (passwordError) {
      passwordInputRef.current?.focus()
      return
    }

    setSubmitting(true)
    const decision = await loginClinic(clinicSlug, email, password)
    setSubmitting(false)

    if (!decision.allowed) {
      setSubmitError(decision.message)
      return
    }

    navigate(defaultRouteForRole(decision.role), { replace: true })
  }

  const applyPreset = (preset: DemoCredentialPreset) => {
    setClinicSlug(preset.clinicSlug)
    setEmail(preset.email)
    setPassword(preset.password)
    setTouched({})
    setSubmitError(null)
  }

  return (
    <div className="min-h-dvh bg-canvas px-4 py-8 text-ink sm:py-12">
      <a href="#main-content" className="skip-link">
        Saltar al formulario de acceso
      </a>

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-clinical text-white">
              <ClinicIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-xl font-bold leading-none">Vital</p>
              <p className="text-xs text-ink-muted">Portal de clínica (CU-13)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-divider bg-surface px-2 py-1 font-mono text-xs text-ink-muted">
              {authMode === 'identity' ? 'Identity API' : 'Mock local'}
            </span>
            <span className="rounded border border-divider bg-surface px-2.5 py-1 font-mono text-xs text-ink-muted">
              GMT-6
            </span>
          </div>
        </div>

        <section
          aria-labelledby={titleId}
          className="rounded-lg border border-divider bg-surface p-6 shadow-sm"
        >
          <h1 id={titleId} className="text-2xl font-bold text-ink">
            Iniciar sesión en clínica
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Confirma el identificador de tu clínica antes de validar tus credenciales.
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
            <div>
              <label htmlFor="clinic-slug" className="block text-sm font-semibold text-ink">
                Identificador de clínica (tenant) <span aria-hidden="true">*</span>
              </label>
              <input
                ref={slugInputRef}
                id="clinic-slug"
                name="clinicSlug"
                type="text"
                value={clinicSlug}
                onChange={(e) => {
                  setClinicSlug(e.target.value)
                  setSubmitError(null)
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, slug: true }))}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="next"
                required
                aria-invalid={Boolean(touched.slug && slugError)}
                aria-describedby="clinic-context-status"
                className="mt-1.5 w-full rounded-md border px-3 py-2 font-mono text-sm"
                placeholder="clinica-norte"
              />
              <div id="clinic-context-status" className="mt-2">
                {touched.slug && slugError ? (
                  <p role="alert" className="text-sm font-medium text-critical-ink">
                    {slugError}
                  </p>
                ) : resolvedTenant ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <span className="font-semibold text-ink">{resolvedTenant.name}</span>
                    <StatusBadge
                      tone={
                        resolvedTenant.status === 'ACTIVA'
                          ? 'positive'
                          : resolvedTenant.status === 'PENDIENTE_ADMIN'
                            ? 'warning'
                            : 'critical'
                      }
                      label={resolvedTenant.status}
                    />
                  </div>
                ) : normalizedSlug ? (
                  <p className="text-xs text-ink-muted">
                    Clínica no identificada localmente; el envío validará el contexto en identidad.
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <label htmlFor="clinic-email" className="block text-sm font-semibold text-ink">
                Correo institucional <span aria-hidden="true">*</span>
              </label>
              <input
                ref={emailInputRef}
                id="clinic-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setSubmitError(null)
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                autoComplete="username"
                spellCheck={false}
                enterKeyHint="next"
                required
                aria-invalid={Boolean(touched.email && emailError)}
                aria-describedby={touched.email && emailError ? 'clinic-email-error' : undefined}
                className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="nombre@norte.vital.demo"
              />
              {touched.email && emailError ? (
                <p id="clinic-email-error" role="alert" className="mt-1 text-sm font-medium text-critical-ink">
                  {emailError}
                </p>
              ) : null}
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="clinic-password" className="block text-sm font-semibold text-ink">
                  Contraseña <span aria-hidden="true">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-pressed={showPassword}
                  aria-controls="clinic-password"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded px-2 text-xs font-semibold text-clinical hover:bg-slate-100"
                >
                  {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  <span>{showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}</span>
                </button>
              </div>
              <input
                ref={passwordInputRef}
                id="clinic-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setSubmitError(null)
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                autoComplete="current-password"
                enterKeyHint="done"
                required
                aria-invalid={Boolean(touched.password && passwordError)}
                aria-describedby={touched.password && passwordError ? 'clinic-password-error' : undefined}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
              {touched.password && passwordError ? (
                <p id="clinic-password-error" role="alert" className="mt-1 text-sm font-medium text-critical-ink">
                  {passwordError}
                </p>
              ) : null}
            </div>

            {submitError ? (
              <div
                role="alert"
                className="rounded-md border border-red-300 bg-critical-bg px-3.5 py-2.5 text-sm font-medium text-critical-ink"
              >
                {submitError}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-clinical px-4 py-2.5 text-sm font-semibold text-white hover:bg-clinical-hover disabled:opacity-60"
            >
              {submitting ? 'Validando acceso...' : 'Ingresar a la clínica'}
            </button>
          </form>

          {authMode === 'identity' ? (
            <p className="mt-3 font-mono text-xs text-ink-muted">
              Conectado a saas-identity ({identityApiUrl})
            </p>
          ) : null}

          <div className="mt-5 border-t border-divider pt-4">
            <Link
              to="/platform/login"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-platform hover:bg-slate-100"
            >
              <ShieldIcon className="h-4 w-4" />
              <span>Acceso para SuperAdmin de plataforma</span>
            </Link>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-divider bg-surface p-4">
          <button
            type="button"
            onClick={() => setShowDemoCases((prev) => !prev)}
            aria-expanded={showDemoCases}
            aria-controls="demo-credentials-panel"
            className="flex min-h-11 w-full items-center justify-between text-left text-sm font-semibold text-ink"
          >
            <span>Cuentas ficticias y casos de prueba (CU-13)</span>
            <span className="font-mono text-xs text-ink-muted">
              {showDemoCases ? 'Ocultar' : 'Ver lista'}
            </span>
          </button>

          {showDemoCases ? (
            <div id="demo-credentials-panel" className="mt-3 space-y-2 border-t border-divider pt-3">
              <p className="text-xs text-ink-muted">
                Selecciona cualquier perfil para rellenar el formulario y probar tanto accesos válidos como rechazos multitenant.
              </p>
              <div className="grid gap-2">
                {DEMO_CASES.map((preset) => (
                  <button
                    key={`${preset.clinicSlug}-${preset.email}`}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-left text-xs hover:bg-slate-100"
                  >
                    <span className="font-semibold text-ink">{preset.label}</span>
                    <span className="font-mono text-ink-muted">
                      {preset.clinicSlug} ({preset.note})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}
