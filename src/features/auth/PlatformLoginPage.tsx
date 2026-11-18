import { useId, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ClinicIcon, EyeIcon, EyeOffIcon, ShieldIcon } from '../../design-system/Icons.tsx'
import { useMockStore } from '../../mocks/useMockStore.ts'

export function PlatformLoginPage() {
  const { loginPlatform } = useMockStore()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const titleId = useId()

  const emailError = !email.trim()
    ? 'Ingresa el correo del operador de plataforma.'
    : !email.includes('@')
      ? 'Ingresa un correo electrónico válido.'
      : undefined
  const passwordError = !password ? 'Ingresa la contraseña de plataforma.' : undefined

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setTouched({ email: true, password: true })
    setSubmitError(null)

    if (emailError) {
      emailRef.current?.focus()
      return
    }
    if (passwordError) {
      passwordRef.current?.focus()
      return
    }

    const decision = loginPlatform(email, password)
    if (!decision.allowed) {
      setSubmitError(decision.message)
      return
    }

    navigate('/platform/clinics', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-canvas px-4 py-8 text-ink sm:py-12">
      <a href="#main-content" className="skip-link">
        Saltar al formulario de acceso de plataforma
      </a>

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-platform text-white">
              <ShieldIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-xl font-bold leading-none">Vital Platform</p>
              <p className="text-xs text-ink-muted">Gobernanza SaaS global (SuperAdmin)</p>
            </div>
          </div>
          <span className="rounded border border-divider bg-surface px-2.5 py-1 font-mono text-xs text-ink-muted">
            GMT-6
          </span>
        </div>

        <section
          aria-labelledby={titleId}
          className="rounded-lg border border-divider bg-surface p-6 shadow-sm"
        >
          <h1 id={titleId} className="text-2xl font-bold text-ink">
            Acceso de Plataforma SaaS
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Entorno exclusivo para alta, suspensión y planes de clínicas. Sin acceso a datos clínicos.
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
            <div>
              <label htmlFor="platform-email" className="block text-sm font-semibold text-ink">
                Correo SuperAdmin <span aria-hidden="true">*</span>
              </label>
              <input
                ref={emailRef}
                id="platform-email"
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
                aria-describedby={touched.email && emailError ? 'platform-email-error' : undefined}
                className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="superadmin@vital.demo"
              />
              {touched.email && emailError ? (
                <p id="platform-email-error" role="alert" className="mt-1 text-sm font-medium text-critical-ink">
                  {emailError}
                </p>
              ) : null}
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="platform-password" className="block text-sm font-semibold text-ink">
                  Contraseña <span aria-hidden="true">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-pressed={showPassword}
                  aria-controls="platform-password"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded px-2 text-xs font-semibold text-platform hover:bg-slate-100"
                >
                  {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  <span>{showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}</span>
                </button>
              </div>
              <input
                ref={passwordRef}
                id="platform-password"
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
                aria-describedby={touched.password && passwordError ? 'platform-password-error' : undefined}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
              {touched.password && passwordError ? (
                <p id="platform-password-error" role="alert" className="mt-1 text-sm font-medium text-critical-ink">
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
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-platform px-4 py-2.5 text-sm font-semibold text-white hover:bg-platform-hover"
            >
              Ingresar a Plataforma
            </button>
          </form>

          <div className="mt-4 flex flex-col gap-2 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => {
                setEmail('superadmin@vital.demo')
                setPassword('Vital2026!')
                setTouched({})
                setSubmitError(null)
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-ink hover:bg-slate-100"
            >
              Rellenar credenciales demo SuperAdmin
            </button>
            <Link
              to="/login"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-surface px-3 py-2 text-sm font-semibold text-clinical hover:bg-slate-50"
            >
              <ClinicIcon className="h-4 w-4" />
              <span>Ir al acceso de clínica</span>
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
