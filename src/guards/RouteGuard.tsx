import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router'
import { LockIcon } from '../design-system/Icons.tsx'
import type { RouteScope } from '../domain/types.ts'
import { ROLE_LABELS, defaultRouteForRole, evaluateRouteAccess } from '../guards/policy.ts'
import { useMockStore } from '../mocks/useMockStore.ts'

interface RouteGuardProps {
  scope: RouteScope
  children: ReactNode
}

/**
 * Guardia transversal por rol, contexto de tenant y estado operativo (CU-10).
 * Nunca expone datos clínicos ni administrativos de otro tenant al denegar.
 */
export function RouteGuard({ scope, children }: RouteGuardProps) {
  const { currentUser, currentTenant, authLoading } = useMockStore()

  if (authLoading) {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-xl px-4 py-12 text-center">
        <p role="status" className="text-sm font-medium text-ink-muted">
          Verificando sesión vigente en Identity...
        </p>
      </main>
    )
  }

  if (!currentUser) {
    return <Navigate to={scope === 'PLATFORM' ? '/platform/login' : '/login'} replace />
  }

  const decision = evaluateRouteAccess(currentUser, currentTenant, scope)
  if (decision.allowed) {
    return <>{children}</>
  }

  const fallbackHref = defaultRouteForRole(currentUser.role)

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-lg border border-red-300 bg-surface p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-critical-bg p-2 text-critical-ink">
            <LockIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs font-medium text-critical-ink">
              CONTROL TRANSVERSAL CU-10 ({decision.code})
            </p>
            <h1 className="mt-1 text-xl font-bold text-ink">Acceso denegado a esta vista</h1>
            <p className="mt-2 text-sm text-ink-muted">{decision.message}</p>
            <p className="mt-3 text-xs text-ink-muted">
              Sesión activa: <span className="font-semibold text-ink">{currentUser.fullName}</span> (
              {ROLE_LABELS[currentUser.role]})
              {currentTenant ? ` en ${currentTenant.name}` : ''}.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to={fallbackHref}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-clinical px-4 py-2 text-sm font-semibold text-white hover:bg-clinical-hover"
              >
                Ir a mi espacio autorizado
              </Link>
              <Link
                to="/login"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-100"
              >
                Cambiar cuenta en login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
