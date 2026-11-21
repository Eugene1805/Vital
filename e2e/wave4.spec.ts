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

async function clickNavLink(page: Page, label: string) {
  const isMobile = (page.viewportSize()?.width ?? 1280) < 768
  if (isMobile) {
    const mobileMenu = page.getByRole('button', { name: 'Menú' })
    await mobileMenu.click()
    await page.locator('#mobile-primary-nav').getByRole('link', { name: label, exact: true }).click()
  } else {
    await page.getByRole('link', { name: label, exact: true }).first().click()
  }
}

test.describe('Vital Oleada 4 E2E', () => {
  test('CU-19 signos flexibles, CU-20 y CU-21: revisión de cargos, rechazo de pago parcial y cobro completo con nota BORRADOR', async ({
    page,
  }) => {
    const errors = trackBrowserErrors(page)

    await page.goto('/login')
    await switchDemoProfile(page, /Enf\. Clara Ramírez/)
    await expect(page).toHaveURL(/\/admin\/patients$/)

    // CU-19 ratificado: captura preliminar parcial sin requerir los 3 signos vitales
    await page
      .locator('tbody tr', { hasText: 'PAT-0101' })
      .getByRole('link', { name: 'Abrir ficha administrativa' })
      .click()
    await page.getByRole('link', { name: 'Preparación preliminar (CU-19)' }).click()
    await expect(page).toHaveURL(/\/admin\/patients\/pat-norte-0101\/triage$/)

    await page.locator('#triage-allergies').fill('Solo intolerancia a lactosa declarada')
    await page.getByRole('button', { name: 'Guardar en PENDIENTE_REVISION' }).click()
    await expect(page.getByText('Solo intolerancia a lactosa declarada')).toBeVisible()
    await expect(page.getByText(/Peso N\/D kg/)).toBeVisible()

    // CU-20 y CU-21 en Billing y cortes
    await clickNavLink(page, 'Billing y cortes')
    await expect(page).toHaveURL(/\/admin\/billing$/)
    await expect(page.getByRole('heading', { name: /Cargos, cobros completos y cortes/i })).toBeVisible()

    const encDraftCard = page.locator('li', { hasText: 'enc-0101-2' })
    await expect(encDraftCard).toContainText('Atención: FINALIZADA')
    await expect(encDraftCard).toContainText('Nota: BORRADOR')
    await expect(encDraftCard).toContainText('Cargos: ABIERTA')
    await expect(encDraftCard.getByRole('button', { name: 'Registrar cobro completo (CU-21)' })).toHaveCount(0)

    await encDraftCard.getByRole('button', { name: 'Confirmar cargos revisados' }).click()
    await expect(encDraftCard).toContainText('Cargos: REVISADA')
    await encDraftCard.getByRole('button', { name: 'Registrar cobro completo (CU-21)' }).click()

    const payDialog = page.locator('dialog[open]')
    await expect(payDialog).toBeVisible()
    await payDialog.locator('#pay-amount').fill('500')
    await payDialog.getByRole('button', { name: 'Confirmar cobro completo' }).click()
    await expect(payDialog.getByRole('alert')).toContainText('solo se registran cobros completos')

    await payDialog.locator('#pay-amount').fill('1200')
    await payDialog.locator('#pay-method').selectOption('TRANSFERENCIA')
    await payDialog.getByRole('button', { name: 'Confirmar cobro completo' }).click()
    await expect(payDialog).toHaveCount(0)

    await expect(encDraftCard).toContainText('Cargos: COBRADA')
    await expect(page.locator('tbody tr', { hasText: 'COB-2026-0003' })).toBeVisible()

    await expectNoHorizontalOverflow(page)
    expect(errors).toEqual([])
  })

  test('CU-22, CU-23 y PC-05: observación con comentario obligatorio, corrección trazable, nuevo corte y confirmación', async ({
    page,
  }) => {
    const errors = trackBrowserErrors(page)

    await page.goto('/login')
    await switchDemoProfile(page, /Dra\. Mendoza/)
    await expect(page).toHaveURL(/\/clinical\/records$/)

    await clickNavLink(page, 'Mis cortes')
    await expect(page).toHaveURL(/\/clinical\/my-cuts$/)

    const mendozaCut = page.locator('li', { hasText: 'CORTE-2026-0001' })
    await expect(mendozaCut).toContainText('PREPARADO')
    await expect(mendozaCut).toContainText('$1,850.00 MXN')

    // Reportar discrepancia exige comentario obligatorio (PC-05 / CU-23 A3)
    await mendozaCut.getByRole('button', { name: 'Reportar discrepancia (Observar)' }).click()
    const obsDialog = page.locator('dialog[open]')
    await obsDialog.getByRole('button', { name: 'Marcar como OBSERVADO' }).click()
    await expect(obsDialog.getByRole('alert')).toContainText('comentario describiendo la discrepancia')

    await obsDialog.locator('#obs-cut-comment').fill('Revisar folio COB-2026-0001 en terminal')
    await obsDialog.getByRole('button', { name: 'Marcar como OBSERVADO' }).click()
    await expect(obsDialog).toHaveCount(0)
    await expect(mendozaCut).toContainText('OBSERVADO')

    // Auxiliar atiende OBSERVADO y prepara nuevo corte para Dr. Salazar
    await switchDemoProfile(page, /Enf\. Clara Ramírez/)
    await expect(page).toHaveURL(/\/admin\/patients$/)

    await clickNavLink(page, 'Billing y cortes')
    await page.getByRole('tab', { name: /Cortes por especialista/i }).click()
    await expect(page.getByText(/Cortes observados con discrepancia reportada/i)).toBeVisible()
    await expect(page.getByText('Revisar folio COB-2026-0001 en terminal')).toBeVisible()

    const cutRow = page.locator('tbody tr', { hasText: 'CORTE-2026-0001' })
    await cutRow.getByRole('button', { name: 'Corregir y reenviar a PREPARADO' }).click()
    const reviseDialog = page.locator('dialog[open]')
    await reviseDialog.locator('#revise-cut-note').fill('Voucher verificado y corte reenviado')
    await reviseDialog.getByRole('button', { name: 'Reenviar a PREPARADO' }).click()
    await expect(reviseDialog).toHaveCount(0)
    await expect(cutRow).toContainText('PREPARADO')

    await page.getByRole('button', { name: 'Preparar nuevo corte (CU-22)' }).click()
    const prepDialog = page.locator('dialog[open]')
    await prepDialog.locator('#cut-specialist').selectOption('acc-norte-salazar')
    await expect(prepDialog).toContainText('COB-2026-0002')
    await expect(prepDialog).toContainText('$1,150.00 MXN')
    await prepDialog.getByRole('button', { name: 'Guardar corte en PREPARADO' }).click()
    await expect(prepDialog).toHaveCount(0)
    await expect(page.locator('tbody tr', { hasText: 'CORTE-2026-0002' })).toBeVisible()

    // Dra. Mendoza solo ve su corte y lo confirma (CONFIRMADO)
    await switchDemoProfile(page, /Dra\. Mendoza/)
    await clickNavLink(page, 'Mis cortes')
    await expect(page.getByText('CORTE-2026-0002')).toHaveCount(0)

    await mendozaCut.getByRole('button', { name: 'Confirmar corte registrado' }).click()
    const confirmDialog = page.locator('dialog[open]')
    await confirmDialog.getByRole('button', { name: 'Confirmar corte' }).click()
    await expect(confirmDialog).toHaveCount(0)
    await expect(mendozaCut).toContainText('CONFIRMADO')

    await expectNoHorizontalOverflow(page)
    expect(errors).toEqual([])
  })

  test('CU-16 BI Plataforma y Clínica: distingue 0 AVAILABLE, No disponible UNAVAILABLE y No aplica sin Billing', async ({
    page,
  }) => {
    const errors = trackBrowserErrors(page)

    await page.goto('/platform/login')
    await page.getByRole('button', { name: 'Rellenar credenciales demo SuperAdmin' }).click()
    await page.getByRole('button', { name: 'Ingresar a Plataforma' }).click()
    await expect(page).toHaveURL(/\/platform\/clinics$/)

    await clickNavLink(page, 'Indicadores BI')
    await expect(page).toHaveURL(/\/platform\/bi$/)
    await expect(page.getByText('Zona horaria fija: GMT-6 (México)')).toBeVisible()

    // Periodo vacío muestra 0 como AVAILABLE, distinto de UNAVAILABLE
    await page.getByRole('button', { name: 'Periodo vacío (probar 0)' }).click()
    const agendaGlobalCard = page.locator('article', { hasText: 'Actividad de citas' })
    await expect(agendaGlobalCard).toContainText('AVAILABLE')
    await expect(agendaGlobalCard).toContainText('0')

    await page.getByLabel('Simular fallo en Agenda').check()
    await expect(agendaGlobalCard).toContainText('No disponible')
    await page.getByLabel('Simular fallo en Agenda').uncheck()

    // Deshabilitar Billing en Clínica Norte para validar NOT_APPLICABLE (CU-16 A2)
    await clickNavLink(page, 'Clínicas y planes')
    await page
      .locator('tbody tr', { hasText: 'clinica-norte' })
      .getByRole('button', { name: 'Plan y cuotas' })
      .click()
    const planDialog = page.locator('dialog[open]')
    await planDialog.getByLabel(/Clínica habilitada para Billing de pacientes/i).uncheck()
    await planDialog.getByRole('button', { name: 'Guardar condiciones' }).click()
    await expect(planDialog).toHaveCount(0)

    await switchDemoProfile(page, /AdminClinica Norte/)
    await expect(page).toHaveURL(/\/admin\/staff$/)
    await expectNoHorizontalOverflow(page)

    await clickNavLink(page, 'Indicadores BI')
    await expect(page).toHaveURL(/\/admin\/bi$/)

    const paymentsCard = page.locator('article', { hasText: 'Cobros registrados' })
    const cutsCard = page.locator('article', { hasText: 'Estado de cortes' })
    const consultationsCard = page.locator('article', { hasText: 'Consultas realizadas' })

    await expect(paymentsCard).toContainText('No aplica')
    await expect(cutsCard).toContainText('No aplica')
    await expect(consultationsCard).toContainText('AVAILABLE')
    await expect(consultationsCard).toContainText('3')

    await page.getByLabel('Simular fallo en Clinical').check()
    await expect(consultationsCard).toContainText('No disponible')

    await clickNavLink(page, 'Billing y cortes')
    await expect(page).toHaveURL(/\/admin\/billing$/)
    await expect(page.getByText('Clínica sin Billing de pacientes habilitado')).toBeVisible()

    await expectNoHorizontalOverflow(page)
    expect(errors).toEqual([])
  })
})
