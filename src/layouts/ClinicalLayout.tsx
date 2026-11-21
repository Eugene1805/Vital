import type { ReactNode } from 'react'
import { ClinicIcon } from '../design-system/Icons.tsx'
import { useMockStore } from '../mocks/useMockStore.ts'
import { AppShell } from './AppShell.tsx'

export function ClinicalLayout({ children }: { children: ReactNode }) {
  const { currentUser, currentTenant } = useMockStore()

  const badge = currentUser?.specialty
    ? `Espacio Clínico (${currentUser.specialty})`
    : 'Espacio Clínico'

  const navItems = [
    { to: '/clinical/records', label: 'Mis expedientes' },
    { to: '/clinical/open-notes', label: 'Notas abiertas' },
    { to: '/clinical/my-cuts', label: 'Mis cortes' },
    { to: '/clinical/workspace', label: 'Espacio clínico' },
  ]
  if (currentUser?.permissions.canRegisterPatients) {
    navItems.push({ to: '/admin/patients/new', label: 'Registrar paciente' })
  }

  return (
    <AppShell
      accent="clinical"
      brandIcon={<ClinicIcon className="h-5 w-5" />}
      contextBadge={badge}
      subtitle={
        currentTenant
          ? `${currentTenant.name} (${currentTenant.slug})`
          : 'Operación clínica por especialidad'
      }
      navItems={navItems}
    >
      {children}
    </AppShell>
  )
}
