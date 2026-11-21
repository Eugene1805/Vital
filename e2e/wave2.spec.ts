import { expect, test, type Page } from '@playwright/test'

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth - window.innerWidth
  })
  expect(overflow).toBeLessThanOrEqual(1)
}

function trackBrowserErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
  })
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`)
  })
  return errors
}

async function switchDemoProfile(page: Page, profileName: RegExp) {
  await page.getByRole('button', { name: 'Cambiar rol (Demo)' }).click()
  await page.getByRole('button', { name: profileName }).click()
}

test.describe('Vital Oleada 2 E2E', () => {
  test('CU-15 ratificado: motivo obligatorio al suspender clínica en Platform', async ({ page }) => {
    const errors = trackBrowserErrors(page)

    await page.goto('/platform/login')
    await page.getByRole('button', { name: 'Rellenar credenciales demo SuperAdmin' }).click()
    await page.getByRole('button', { name: 'Ingresar a Plataforma' }).click()
    await expect(page).toHaveURL(/\/platform\/clinics$/)

    const norteRow = page.locator('tbody tr', { hasText: 'clinica-norte' })
    await norteRow.getByRole('button', { name: 'Suspender' }).click()

    const dialog = page.locator('dialog[open]')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Confirmar suspensión' }).click()
    await expect(dialog.getByRole('alert')).toContainText('motivo administrativo es obligatorio')

    await dialog.getByLabel(/Motivo administrativo de suspensión/i).fill('Prueba de suspensión E2E')
    await dialog.getByRole('button', { name: 'Confirmar suspensión' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(norteRow).toContainText('SUSPENDIDA')

    // Reactivar sin motivo (opcional)
    await norteRow.getByRole('button', { name: 'Reactivar' }).click()
    const reactivateDialog = page.locator('dialog[open]')
    await reactivateDialog.getByRole('button', { name: 'Confirmar reactivación' }).click()
    await expect(norteRow).toContainText('ACTIVA')

    await expectNoHorizontalOverflow(page)
    expect(errors).toEqual([])
  })

  test('CU-01, CU-02, CU-24, PC-02 y CU-10: alta conjunta, asignaciones y frontera clínica', async ({
    page,
  }) => {
    const errors = trackBrowserErrors(page)

    await page.goto('/login')
    await page.getByRole('button', { name: /Cuentas ficticias y casos de prueba/i }).click()
    await page.getByRole('button', { name: /AdminClinica \(Clínica Norte\)/i }).click()
    await page.getByRole('button', { name: 'Ingresar a la clínica' }).click()
    await expect(page).toHaveURL(/\/admin\/staff$/)
    await expect(page.getByRole('heading', { name: 'Personal, roles y vínculos auxiliares' })).toBeVisible()

    // Ir a Pacientes
    const mobileMenu = page.getByRole('button', { name: 'Menú' })
    if (await mobileMenu.isVisible()) {
      await mobileMenu.click()
      await page
        .locator('#mobile-primary-nav')
        .getByRole('link', { name: 'Pacientes', exact: true })
        .click()
    } else {
      await page.getByRole('link', { name: 'Pacientes', exact: true }).click()
    }
    await expect(page).toHaveURL(/\/admin\/patients$/)
    await expectNoHorizontalOverflow(page)

    // Registrar paciente sin responsable principal -> Pendiente de asignación
    await page.getByRole('link', { name: 'Registrar paciente' }).click()
    await expect(page).toHaveURL(/\/admin\/patients\/new$/)
    await page.getByLabel(/Nombre completo/i).fill('Valeria Mendoza Ríos')
    await page.getByLabel(/Fecha de nacimiento/i).fill('1991-07-18')
    await page.getByLabel(/Teléfono de contacto/i).fill('555-0199-3344')
    await page.getByRole('button', { name: 'Guardar paciente y crear expediente' }).click()

    await expect(page).toHaveURL(/\/admin\/patients\/pat-/)
    await expect(page.getByText('Pendiente de asignación')).toBeVisible()

    // CU-02: Asignar responsable inicial
    await page.getByRole('button', { name: /Asignar responsable inicial/i }).click()
    let dialog = page.locator('dialog[open]')
    await dialog.getByRole('button', { name: 'Confirmar asignación inicial' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText('Asignado', { exact: true })).toBeVisible()

    // CU-24 candidato: Reasignar responsable
    await page.getByRole('button', { name: /Reasignar responsable/i }).click()
    dialog = page.locator('dialog[open]')
    await dialog.getByLabel(/Motivo \/ nota administrativa/i).fill('Cambio de especialidad E2E')
    await dialog.getByRole('button', { name: 'Confirmar reasignación' }).click()
    await expect(dialog).toHaveCount(0)

    // PC-02: Vincular y desvincular tratante adicional
    await page.getByRole('button', { name: 'Vincular tratante adicional' }).click()
    dialog = page.locator('dialog[open]')
    await dialog.getByRole('button', { name: 'Vincular tratante' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Desvincular tratante' })).toBeVisible()
    await page.getByRole('button', { name: 'Desvincular tratante' }).click()
    await expect(page.getByText('No hay especialistas tratantes adicionales vinculados')).toBeVisible()

    // Frontera CU-10: AdminClinica no puede abrir Espacio Clínico
    await page.getByRole('link', { name: /Comprobar bloqueo Espacio Clínico/i }).click()
    await expect(page.getByRole('heading', { name: /Acceso denegado a esta vista/i })).toBeVisible()
    await expect(page.getByText(/CONTROL TRANSVERSAL CU-10/i)).toBeVisible()
    await expectNoHorizontalOverflow(page)
    expect(errors).toEqual([])
  })

  test('PC-01, PC-03 y CU-10: búsqueda restringida, aprobación reducida y revocación de permiso', async ({
    page,
  }) => {
    const errors = trackBrowserErrors(page)

    await page.goto('/login')
    await switchDemoProfile(page, /Enf\. Clara Ramírez/i)
    await expect(page).toHaveURL(/\/admin\/patients$/)

    // PAT-0102 está fuera de ámbito -> listado no lo expone
    await expect(page.locator('tbody')).not.toContainText('PAT-0102')

    const mobileMenu = page.getByRole('button', { name: 'Menú' })
    if (await mobileMenu.isVisible()) {
      await mobileMenu.click()
      await page
        .locator('#mobile-primary-nav')
        .getByRole('link', { name: 'Acceso excepcional' })
        .click()
    } else {
      await page.getByRole('link', { name: 'Acceso excepcional', exact: true }).click()
    }
    await expect(page).toHaveURL(/\/admin\/exceptional-access$/)

    // Probar bloqueo de búsqueda < 4 caracteres (PC-03) y búsqueda exacta
    await page.getByRole('button', { name: 'Solicitar acceso excepcional' }).click()
    const dialog = page.locator('dialog[open]')
    await dialog.getByLabel(/Buscar paciente/i).fill('Ca')
    await expect(dialog).toContainText('al menos 4 caracteres')

    await dialog.getByLabel(/Buscar paciente/i).fill('PAT-0102')
    await expect(dialog).toContainText('Carlos Aguilar Benítez')
    await expect(dialog).toContainText('(1971)')
    await dialog.getByRole('radio', { name: /Carlos Aguilar Benítez/i }).check()
    await dialog.getByLabel(/Motivo obligatorio/i).fill('Cobertura temporal vespertina')
    await dialog.getByRole('radio', { name: '6 meses' }).check()
    await dialog.getByRole('button', { name: 'Enviar solicitud' }).click()
    await expect(dialog).toContainText('solicitud pendiente')
    await page.keyboard.press('Escape')

    // Cambiar a AdminClinica, aprobar reduciendo duración a 3 meses y revocar después
    await switchDemoProfile(page, /AdminClinica Norte/i)
    await page.goto('/admin/exceptional-access')
    const grantRow = page.locator('tbody tr', { hasText: 'PAT-0102' }).first()
    await grantRow.getByRole('button', { name: 'Resolver solicitud' }).click()
    const resolveDialog = page.locator('dialog[open]')
    await resolveDialog.getByLabel(/Vigencia aprobada/i).selectOption('3')
    await resolveDialog.getByRole('button', { name: 'Confirmar resolución' }).click()
    await expect(grantRow).toContainText('APROBADA')

    // Auxiliar ahora sí puede abrir ficha de PAT-0102
    await switchDemoProfile(page, /Enf\. Clara Ramírez/i)
    await page.goto('/admin/patients/pat-norte-0102')
    await expect(page.getByRole('heading', { name: 'Carlos Aguilar Benítez' })).toBeVisible()
    await expectNoHorizontalOverflow(page)

    // AdminClinica revoca -> Auxiliar queda bloqueada inmediatamente
    await switchDemoProfile(page, /AdminClinica Norte/i)
    await page.goto('/admin/exceptional-access')
    const activeRow = page.locator('tbody tr', { hasText: 'PAT-0102' }).first()
    await activeRow.getByRole('button', { name: 'Revocar permiso' }).click()
    await expect(activeRow).toContainText('REVOCADA')

    await switchDemoProfile(page, /Enf\. Clara Ramírez/i)
    await page.goto('/admin/patients/pat-norte-0102')
    await expect(page.getByRole('heading', { name: /No es posible abrir la ficha administrativa/i })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('CU-08, CU-01 A6 y CU-10: Espacio Clínico con tabs, nota cerrada ajena y registrante bloqueado', async ({
    page,
  }) => {
    const errors = trackBrowserErrors(page)

    await page.goto('/login')
    await switchDemoProfile(page, /Dr\. Salazar/i)
    await expect(page).toHaveURL(/\/clinical\/records$/)

    // Dr. Salazar es tratante de PAT-0101: abre Espacio Clínico
    const row0101 = page.locator('tbody tr', { hasText: 'PAT-0101' })
    await row0101.getByRole('link', { name: 'Abrir Espacio Clínico' }).click()

    await expect(page).toHaveURL(/\/clinical\/records\/rec-norte-0101$/)
    await expect(page.getByText('Penicilina (reacción cutánea severa)').first()).toBeVisible()
    // Ve nota CERRADA de Dra. Mendoza (Cardiología), pero NO ve el BORRADOR privado de Dra. Mendoza
    await expect(page.getByText('Valoración cardiológica inicial cerrada')).toBeVisible()
    await expect(page.getByText('Borrador privado de revisión de electrocardiograma')).toHaveCount(0)

    // Navegación por teclado en pestañas
    const historyTab = page.getByRole('tab', { name: /Historial cronológico/i })
    await historyTab.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: /Atención y notas/i })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: /Atenciones clínicas y notas abiertas/i })).toBeVisible()

    // Dra. Mendoza intenta abrir PAT-0103 (que ella misma registró sin asignación) -> bloqueado CU-01 A6
    await switchDemoProfile(page, /Dra\. Mendoza/i)
    await page.goto('/clinical/records/rec-norte-0103')
    await expect(page.getByRole('heading', { name: /Acceso denegado al Espacio Clínico/i })).toBeVisible()
    await expect(page.getByText(/NO_CLINICAL_LINK/i)).toBeVisible()

    await expectNoHorizontalOverflow(page)
    expect(errors).toEqual([])
  })
})
