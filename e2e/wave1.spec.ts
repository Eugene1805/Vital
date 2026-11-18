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
    if (msg.type() === 'error') {
      errors.push(`console.error: ${msg.text()}`)
    }
  })
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`)
  })
  return errors
}

test.describe('Vital Oleada 1 E2E', () => {
  test('CU-13 Login clínica: validación, rechazos multitenant y acceso válido', async ({ page }) => {
    const errors = trackBrowserErrors(page)

    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Iniciar sesión en clínica' })).toBeVisible()
    await expectNoHorizontalOverflow(page)

    // Submit vacío muestra validación accesible
    await page.getByRole('button', { name: 'Ingresar a la clínica' }).click()
    await expect(page.getByText('Ingresa el correo electrónico de tu cuenta.')).toBeVisible()

    // Abrir casos de prueba ficticios y probar clínica suspendida (CU-13 A3)
    await page.getByRole('button', { name: /Cuentas ficticias y casos de prueba/i }).click()
    await page.getByRole('button', { name: /Admin en clínica SUSPENDIDA/i }).click()
    await page.getByRole('button', { name: 'Ingresar a la clínica' }).click()
    await expect(page.getByRole('alert')).toContainText('SUSPENDIDA')

    // Probar cuenta desactivada (CU-13 A3)
    await page.getByRole('button', { name: /Dr\. Vega \(cuenta desactivada\)/i }).click()
    await page.getByRole('button', { name: 'Ingresar a la clínica' }).click()
    await expect(page.getByRole('alert')).toContainText('desactivada')

    // Probar aislamiento entre clínicas (CU-13 A2)
    await page.getByRole('button', { name: /Dra\. Mendoza Valle usada en Norte/i }).click()
    await page.getByRole('button', { name: 'Ingresar a la clínica' }).click()
    await expect(page.getByRole('alert')).toContainText('Credenciales inválidas')

    // Acceso válido como AdminClinica
    await page.getByRole('button', { name: /AdminClinica \(Clínica Norte\)/i }).click()
    await page.getByRole('button', { name: 'Ingresar a la clínica' }).click()

    await expect(page).toHaveURL(/\/admin\/staff$/)
    await expect(page.getByRole('heading', { name: 'Personal, roles y vínculos auxiliares' })).toBeVisible()
    await expectNoHorizontalOverflow(page)
    expect(errors).toEqual([])
  })

  test('CU-12, CU-14, CU-17: delegación limitada, estados UI y vista de plan', async ({ page }) => {
    const errors = trackBrowserErrors(page)

    await page.goto('/login')
    await page.getByRole('button', { name: /Cuentas ficticias y casos de prueba/i }).click()
    await page.getByRole('button', { name: /AdminClinica \(Clínica Norte\)/i }).click()
    await page.getByRole('button', { name: 'Ingresar a la clínica' }).click()
    await expect(page).toHaveURL(/\/admin\/staff$/)

    // Abrir modal Rol y facultades de Dr. Mateo Salazar (sin cédula registrada)
    const salazarRow = page.locator('tbody tr', { hasText: 'Dr. Mateo Salazar' })
    await salazarRow.getByRole('button', { name: 'Rol y facultades' }).click()

    const dialog = page.locator('dialog[open]')
    await expect(dialog).toBeVisible()
    const prescribeCheckbox = dialog.getByRole('checkbox', {
      name: /Habilitar emisión de prescripciones/i,
    })
    await expect(prescribeCheckbox).toBeDisabled()

    // Verificar bloqueo explícito al intentar escalar a SuperAdmin (CU-14 A1)
    await dialog.getByRole('button', { name: 'Probar asignar SuperAdmin' }).click()
    await expect(dialog).toContainText('PRIVILEGE_ESCALATION_BLOCKED')

    // Cerrar con tecla Escape (<dialog> nativo)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    // Probar estados de carga, error y reintento en vista de datos
    await page.getByLabel('Estado de vista').selectOption('loading')
    await expect(page.getByRole('status')).toContainText('Cargando personal de la clínica')
    await page.getByLabel('Estado de vista').selectOption('error')
    await expect(page.getByRole('alert')).toContainText('Error al consultar el directorio de personal')
    await page.getByRole('button', { name: 'Reintentar' }).click()
    await expect(page.getByRole('table')).toBeVisible()

    // Navegar a Plan y vigencia (usando menú móvil si está visible)
    const mobileMenuButton = page.getByRole('button', { name: 'Menú' })
    if (await mobileMenuButton.isVisible()) {
      await mobileMenuButton.click()
      await page.locator('#mobile-primary-nav').getByRole('link', { name: 'Plan y vigencia' }).click()
    } else {
      await page.getByRole('link', { name: 'Plan y vigencia' }).click()
    }

    await expect(page).toHaveURL(/\/admin\/plan$/)
    await expect(page.getByRole('heading', { name: 'Plan, vigencia y cuotas' })).toBeVisible()
    await expectNoHorizontalOverflow(page)
    expect(errors).toEqual([])
  })

  test('CU-11, CU-15, CU-10: alta PENDIENTE_ADMIN, recuperación a ACTIVA y bloqueo de ruta', async ({
    page,
  }) => {
    const errors = trackBrowserErrors(page)

    await page.goto('/platform/login')
    await page.getByRole('button', { name: 'Rellenar credenciales demo SuperAdmin' }).click()
    await page.getByRole('button', { name: 'Ingresar a Plataforma' }).click()

    await expect(page).toHaveURL(/\/platform\/clinics$/)
    await expect(page.getByRole('heading', { name: /Clínicas \(tenants\) y planes SaaS/i })).toBeVisible()
    await expectNoHorizontalOverflow(page)

    // Registrar nueva clínica simulando fallo en Identity -> PENDIENTE_ADMIN (CU-11 A3)
    await page.getByRole('button', { name: 'Registrar clínica' }).click()
    const createDialog = page.locator('dialog[open]')
    await expect(createDialog).toBeVisible()

    await createDialog.getByLabel(/Nombre de la clínica/i).fill('Clínica Prueba E2E')
    await createDialog.getByLabel(/Identificador \(slug\)/i).fill('clinica-e2e')
    await createDialog.getByLabel(/Nombre completo/i).fill('Lic. Demo E2E')
    await createDialog.getByLabel(/Correo institucional/i).fill('admin@e2e.vital.demo')
    await createDialog.getByRole('checkbox', { name: /Simular fallo parcial en Identity/i }).check()
    await createDialog.getByRole('button', { name: 'Confirmar registro' }).click()

    const e2eRow = page.locator('tbody tr', { hasText: 'clinica-e2e' })
    await expect(e2eRow).toContainText('PENDIENTE_ADMIN')

    // Completar habilitación del administrador inicial -> ACTIVA
    await e2eRow.getByRole('button', { name: 'Completar habilitación admin' }).click()
    const retryDialog = page.locator('dialog[open]')
    await retryDialog.getByRole('button', { name: 'Reintentar y habilitar administrador' }).click()
    await expect(e2eRow).toContainText('ACTIVA')

    // Probar bloqueo transversal CU-10 vía DevRoleSwitcher
    await page.getByRole('button', { name: 'Cambiar rol (Demo)' }).click()
    await page.getByRole('button', { name: /Probar bloqueo de ruta prohibida/i }).click()
    await expect(page.getByRole('heading', { name: 'Acceso denegado a esta vista' })).toBeVisible()
    await expect(page.getByText(/CONTROL TRANSVERSAL CU-10/i)).toBeVisible()

    await page.getByRole('link', { name: 'Ir a mi espacio autorizado' }).click()
    await expect(page).toHaveURL(/\/platform\/clinics$/)
    await expectNoHorizontalOverflow(page)
    expect(errors).toEqual([])
  })
})
