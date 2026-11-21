import { useState, type FormEvent, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { CloseIcon, LogoutIcon, MenuIcon } from '../design-system/Icons.tsx'
import { ModalDialog } from '../design-system/ModalDialog.tsx'
import { useMockStore } from '../mocks/useMockStore.ts'
import { validatePasswordPolicy } from '../services/identityClient.ts'

export interface NavItem {
  to: string
  label: string
}

interface AppShellProps {
  accent: 'platform' | 'admin' | 'clinical'
  brandIcon: ReactNode
  contextBadge: string
  subtitle: string
  navItems: NavItem[]
  children: ReactNode
}

const HEADER_THEME: Record<AppShellProps['accent'], string> = {
  platform: 'bg-platform text-white border-b border-blue-950',
  admin: 'bg-admin-bar text-white border-b border-slate-900',
  clinical: 'bg-clinical text-white border-b border-teal-900',
}

const ACTIVE_LINK_THEME: Record<AppShellProps['accent'], string> = {
  platform: 'bg-white text-platform font-semibold',
  admin: 'bg-white text-admin-bar font-semibold',
  clinical: 'bg-white text-clinical font-semibold',
}

/** Cascarón institucional compartido por Plataforma, Administración de Clínica y Espacio Clínico. */
export function AppShell({
  accent,
  brandIcon,
  contextBadge,
  subtitle,
  navItems,
  children,
}: AppShellProps) {
  const { currentUser, authMode, logout, changeOwnPassword } = useMockStore()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [dismissedTempPrompt, setDismissedTempPrompt] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [savingPassword, setSavingPassword] = useState(false)

  const effectivePasswordModalOpen =
    passwordModalOpen ||
    (authMode === 'identity' && Boolean(currentUser?.mustChangePassword) && !dismissedTempPrompt)

  const handleLogout = async () => {
    const targetLogin = currentUser?.role === 'SUPER_ADMIN' ? '/platform/login' : '/login'
    await logout()
    navigate(targetLogin, { replace: true })
  }

  const handlePasswordSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(null)

    if (!currentPassword) {
      setPasswordError('Ingresa tu contraseña actual o temporal.')
      return
    }

    const policyError = validatePasswordPolicy(newPassword)
    if (policyError) {
      setPasswordError(policyError)
      return
    }

    setSavingPassword(true)
    const decision = await changeOwnPassword(currentPassword, newPassword)
    setSavingPassword(false)

    if (!decision.allowed) {
      setPasswordError(decision.message)
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setPasswordModalOpen(false)
    setPasswordSuccess('Contraseña actualizada correctamente.')
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <a href="#main-content" className="skip-link">
        Saltar al contenido principal
      </a>

      <header className={`header-dark ${HEADER_THEME[accent]}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/15 text-white">
              {brandIcon}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg font-bold tracking-tight">Vital</span>
                <span className="rounded border border-white/30 bg-white/10 px-2 py-0.5 text-xs font-semibold">
                  {contextBadge}
                </span>
              </div>
              <p className="truncate text-xs text-white/90">{subtitle}</p>
            </div>
          </div>

          <nav aria-label="Navegación principal" className="hidden flex-wrap items-center gap-1.5 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2.5 py-2 text-xs transition-colors lg:text-sm ${
                    isActive
                      ? ACTIVE_LINK_THEME[accent]
                      : 'text-white/95 hover:bg-white/15'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden shrink-0 items-center gap-3 md:flex">
            <div className="text-right">
              <p className="text-sm font-semibold leading-tight">{currentUser?.fullName}</p>
              <p className="font-mono text-xs text-white/85">Horario fijo GMT-6</p>
            </div>
            {authMode === 'identity' ? (
              <button
                type="button"
                onClick={() => {
                  setPasswordError(null)
                  setPasswordModalOpen(true)
                }}
                className="inline-flex min-h-11 items-center rounded-md border border-white/35 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
              >
                {currentUser?.mustChangePassword ? 'Cambiar clave temporal' : 'Cambiar contraseña'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/35 bg-white/10 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/20"
            >
              <LogoutIcon className="h-4 w-4" />
              <span>Cerrar sesión</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-primary-nav"
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/35 bg-white/10 px-3 py-2 text-sm font-semibold text-white md:hidden"
          >
            {mobileMenuOpen ? <CloseIcon className="h-4 w-4" /> : <MenuIcon className="h-4 w-4" />}
            <span>Menú</span>
          </button>
        </div>

        {mobileMenuOpen ? (
          <div id="mobile-primary-nav" className="border-t border-white/20 px-4 py-3 md:hidden">
            <div className="mb-3 border-b border-white/15 pb-3">
              <p className="text-sm font-semibold">{currentUser?.fullName}</p>
              <p className="font-mono text-xs text-white/85">Horario fijo GMT-6</p>
            </div>
            <nav aria-label="Navegación móvil" className="flex flex-col gap-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `inline-flex min-h-11 items-center rounded-md px-3.5 py-2 text-sm ${
                      isActive ? ACTIVE_LINK_THEME[accent] : 'bg-white/10 text-white'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              {authMode === 'identity' ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false)
                    setPasswordError(null)
                    setPasswordModalOpen(true)
                  }}
                  className="inline-flex min-h-11 items-center rounded-md border border-white/35 bg-white/10 px-3.5 py-2 text-sm font-semibold text-white"
                >
                  {currentUser?.mustChangePassword ? 'Cambiar clave temporal' : 'Cambiar contraseña'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/35 bg-white/10 px-3.5 py-2 text-sm font-semibold text-white"
              >
                <LogoutIcon className="h-4 w-4" />
                <span>Cerrar sesión</span>
              </button>
            </nav>
          </div>
        ) : null}
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {passwordSuccess ? (
          <div
            role="status"
            className="mb-4 rounded-md border border-green-300 bg-positive-bg px-4 py-3 text-sm font-medium text-positive-ink"
          >
            {passwordSuccess}
          </div>
        ) : null}
        {children}
      </main>

      <ModalDialog
        open={effectivePasswordModalOpen}
        title={
          currentUser?.mustChangePassword
            ? 'Cambio obligatorio de contraseña temporal'
            : 'Cambiar contraseña'
        }
        description="Política de seguridad: entre 8 y 40 caracteres con al menos una letra, un número y un símbolo."
        onClose={() => {
          setPasswordModalOpen(false)
          setDismissedTempPrompt(true)
        }}
      >
        <form onSubmit={handlePasswordSubmit} className="space-y-4 text-sm">
          <div>
            <label htmlFor="shell-current-pass" className="block font-semibold text-ink">
              Contraseña actual / temporal
            </label>
            <input
              id="shell-current-pass"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-md border px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="shell-new-pass" className="block font-semibold text-ink">
              Nueva contraseña (8 a 40 caracteres)
            </label>
            <input
              id="shell-new-pass"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-md border px-3 py-2"
            />
          </div>
          {passwordError ? (
            <p
              role="alert"
              className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 font-medium text-critical-ink"
            >
              {passwordError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => {
                setPasswordModalOpen(false)
                setDismissedTempPrompt(true)
              }}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingPassword}
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover disabled:opacity-60"
            >
              {savingPassword ? 'Guardando...' : 'Actualizar contraseña'}
            </button>
          </div>
        </form>
      </ModalDialog>

      <footer className="border-t border-divider bg-surface px-4 py-3 text-xs text-ink-muted sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span>Vital Prototipo SaaS (Oleada 1: Identidad, Tenants, Personal y Roles)</span>
          <span className="font-mono">Zona horaria operativa: GMT-6 (Hora estándar de México)</span>
        </div>
      </footer>
    </div>
  )
}
