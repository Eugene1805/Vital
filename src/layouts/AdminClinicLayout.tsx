import type { ReactNode } from 'react'
import { UsersIcon } from '../design-system/Icons.tsx'
import { useMockStore } from '../mocks/useMockStore.ts'
import { AppShell } from './AppShell.tsx'

export function AdminClinicLayout({ children }: { children: ReactNode }) {
  const { currentUser, currentTenant } = useMockStore()

  const navItems =
    currentUser?.role === 'ADMIN_CLINICA'
      ? [
          { to: '/admin/staff', label: 'Personal y roles' },
          { to: '/admin/plan', label: 'Plan y vigencia' },
        ]
      : [{ to: '/admin/workspace', label: 'Mi ámbito auxiliar' }]

  return (
    <AppShell
      accent="admin"
      brandIcon={<UsersIcon className="h-5 w-5" />}
      contextBadge={
        currentUser?.role === 'ADMIN_CLINICA' ? 'Admin de Clínica' : 'Auxiliar Administrativo'
      }
      subtitle={
        currentTenant
          ? `${currentTenant.name} (${currentTenant.slug})`
          : 'Administración del tenant'
      }
      navItems={navItems}
    >
      {children}
    </AppShell>
  )
}
