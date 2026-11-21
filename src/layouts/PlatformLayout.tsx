import type { ReactNode } from 'react'
import { ShieldIcon } from '../design-system/Icons.tsx'
import { AppShell } from './AppShell.tsx'

export function PlatformLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      accent="platform"
      brandIcon={<ShieldIcon className="h-5 w-5" />}
      contextBadge="Plataforma SaaS"
      subtitle="Gobernanza global de clínicas y planes (sin acceso clínico)"
      navItems={[
        { to: '/platform/clinics', label: 'Clínicas y planes' },
        { to: '/platform/bi', label: 'Indicadores BI' },
      ]}
    >
      {children}
    </AppShell>
  )
}
