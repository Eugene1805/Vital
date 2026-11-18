import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { CloseIcon, LogoutIcon, MenuIcon } from '../design-system/Icons.tsx'
import { useMockStore } from '../mocks/useMockStore.ts'

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
  const { currentUser, logout } = useMockStore()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = () => {
    const targetLogin = currentUser?.role === 'SUPER_ADMIN' ? '/platform/login' : '/login'
    logout()
    navigate(targetLogin, { replace: true })
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

          <nav aria-label="Navegación principal" className="hidden items-center gap-2 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center rounded-md px-3.5 py-2 text-sm transition-colors ${
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

          <div className="hidden items-center gap-3 md:flex">
            <div className="text-right">
              <p className="text-sm font-semibold leading-tight">{currentUser?.fullName}</p>
              <p className="font-mono text-xs text-white/85">Horario fijo GMT-6</p>
            </div>
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
        {children}
      </main>

      <footer className="border-t border-divider bg-surface px-4 py-3 text-xs text-ink-muted sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span>Vital Prototipo SaaS (Oleada 1: Identidad, Tenants, Personal y Roles)</span>
          <span className="font-mono">Zona horaria operativa: GMT-6 (Hora estándar de México)</span>
        </div>
      </footer>
    </div>
  )
}
