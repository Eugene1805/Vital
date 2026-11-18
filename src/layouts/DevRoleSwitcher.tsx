import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { CloseIcon, RefreshIcon, ShieldIcon } from '../design-system/Icons.tsx'
import { ROLE_LABELS, defaultRouteForRole } from '../guards/policy.ts'
import { useMockStore } from '../mocks/useMockStore.ts'

const DEMO_PROFILE_IDS = [
  { id: 'acc-superadmin', label: 'SuperAdmin', hint: 'Plataforma global' },
  { id: 'acc-norte-admin', label: 'AdminClinica Norte', hint: 'Personal y roles' },
  { id: 'acc-norte-mendoza', label: 'Dra. Mendoza', hint: 'Especialista con cédula' },
  { id: 'acc-norte-salazar', label: 'Dr. Salazar', hint: 'Especialista sin cédula' },
  { id: 'acc-norte-aux', label: 'Enf. Clara Ramírez', hint: 'Auxiliar vinculada' },
] as const

/**
 * Conmutador de desarrollo para probar separación de rutas y bloqueos CU-10 en 1 clic.
 */
export function DevRoleSwitcher() {
  const { currentUser, currentTenant, impersonateAccount, logout, resetDemoData } = useMockStore()
  const [open, setOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const handleSelectProfile = (accountId: string) => {
    const decision = impersonateAccount(accountId)
    if (!decision.allowed) {
      setStatusMessage(decision.message)
      return
    }
    const targetRole =
      accountId === 'acc-superadmin'
        ? 'SUPER_ADMIN'
        : accountId === 'acc-norte-admin'
          ? 'ADMIN_CLINICA'
          : accountId === 'acc-norte-aux'
            ? 'AUXILIAR'
            : 'ESPECIALISTA'
    setStatusMessage(null)
    setOpen(false)
    navigate(defaultRouteForRole(targetRole))
  }

  const handleProbeForbiddenRoute = () => {
    if (!currentUser) {
      navigate('/admin/staff')
      setOpen(false)
      return
    }
    const forbiddenTarget =
      currentUser.role === 'SUPER_ADMIN'
        ? '/admin/staff'
        : currentUser.role === 'ADMIN_CLINICA'
          ? '/clinical/workspace'
          : currentUser.role === 'ESPECIALISTA'
            ? '/admin/staff'
            : '/clinical/workspace'
    setOpen(false)
    navigate(forbiddenTarget)
  }

  const handleReset = () => {
    resetDemoData()
    setStatusMessage('Datos ficticios restablecidos.')
    setOpen(false)
    navigate('/login')
  }

  return (
    <aside
      aria-label="Conmutador de roles de desarrollo"
      className="fixed right-3 bottom-3 z-40 sm:right-5 sm:bottom-5"
    >
      {open ? (
        <div className="w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border border-slate-700 bg-slate-900 p-4 text-white shadow-xl">
          <div className="flex items-start justify-between gap-3 border-b border-slate-700 pb-3">
            <div>
              <p className="text-xs font-semibold text-teal-300">ENTORNO PROTOTIPO</p>
              <h2 className="text-sm font-bold">Role Switcher (CU-10 / CU-13)</h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar conmutador de roles"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-slate-600 bg-slate-800 text-white hover:bg-slate-700"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 rounded-md bg-slate-800 px-3 py-2 text-xs">
            <p className="text-slate-300">
              Ruta actual: <span className="font-mono text-white">{location.pathname}</span>
            </p>
            <p className="mt-1 text-slate-300">
              Sesión:{' '}
              <span className="font-semibold text-white">
                {currentUser ? `${currentUser.fullName} (${ROLE_LABELS[currentUser.role]})` : 'Sin sesión'}
              </span>
            </p>
            {currentTenant ? (
              <p className="mt-0.5 text-slate-300">Clínica: {currentTenant.name}</p>
            ) : null}
          </div>

          {statusMessage ? (
            <p role="alert" className="mt-2 rounded bg-red-950 px-2.5 py-2 text-xs text-red-100">
              {statusMessage}
            </p>
          ) : null}

          <div className="mt-3 flex flex-col gap-1.5">
            {DEMO_PROFILE_IDS.map((profile) => {
              const isCurrent = currentUser?.id === profile.id
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => handleSelectProfile(profile.id)}
                  className={`flex min-h-11 items-center justify-between rounded-md border px-3 py-2 text-left text-xs ${
                    isCurrent
                      ? 'border-teal-400 bg-teal-900/60 text-white'
                      : 'border-slate-700 bg-slate-800/80 text-slate-100 hover:bg-slate-800'
                  }`}
                >
                  <span className="font-semibold">{profile.label}</span>
                  <span className="text-slate-300">{profile.hint}</span>
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex flex-col gap-2 border-t border-slate-700 pt-3">
            <button
              type="button"
              onClick={handleProbeForbiddenRoute}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-amber-400/60 bg-amber-950/60 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-900/70"
            >
              Probar bloqueo de ruta prohibida (CU-10)
            </button>
            <div className="flex gap-2">
              {currentUser ? (
                <button
                  type="button"
                  onClick={() => {
                    logout()
                    setOpen(false)
                    navigate('/login')
                  }}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  Cerrar sesión
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
              >
                <RefreshIcon className="h-3.5 w-3.5" />
                <span>Restablecer datos</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-lg hover:bg-slate-800"
        >
          <ShieldIcon className="h-4 w-4 text-teal-300" />
          <span>Cambiar rol (Demo)</span>
        </button>
      )}
    </aside>
  )
}
