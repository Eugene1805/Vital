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

test.describe('Vital Oleada 3 E2E', () => {
  test('CU-18 y CU-19: agenda con empalme, transición de cita y preparación preliminar sin cita previa', async ({
    page,
  }) => {
    const errors = trackBrowserErrors(page)

    await page.goto('/login')
    await switchDemoProfile(page, /Enf\. Clara Ramírez/)
    await expect(page).toHaveURL(/\/admin\/patients$/)

    await clickNavLink(page, 'Agenda')
    await expect(page).toHaveURL(/\/admin\/appointments$/)
    await expect(page.getByRole('heading', { name: /Agenda interna de citas/i })).toBeVisible()

    // Intentar agendar con empalme exacto en GMT-6 (Dra. Mendoza ya tiene apt-norte-1 a las 10:00 por 30 min)
    await page.getByRole('button', { name: 'Nueva cita' }).click()
    const createDialog = page.locator('dialog[open]')
    await expect(createDialog).toBeVisible()
    await createDialog.locator('#apt-patient').selectOption('pat-norte-0101')
    await createDialog.locator('#apt-specialist').selectOption('acc-norte-mendoza')
    await createDialog.locator('#apt-date').fill('2026-11-20')
    await createDialog.locator('#apt-time').fill('10:15')
    await createDialog.locator('#apt-reason').fill('Cita con empalme E2E')
    await createDialog.getByRole('button', { name: 'Programar cita' }).click()
    await expect(createDialog.getByRole('alert')).toContainText('Conflicto de horario')

    // Corregir a horario libre y confirmar programación
    await createDialog.locator('#apt-time').fill('14:00')
    await createDialog.locator('#apt-reason').fill('Control vespertino E2E')
    await createDialog.getByRole('button', { name: 'Programar cita' }).click()
    await expect(createDialog).toHaveCount(0)
    await expect(page.getByText('Control vespertino E2E')).toBeVisible()

    // Transicionar cita PROGRAMADA -> CONFIRMADA
    const aptRow = page.locator('tbody tr', { hasText: 'Control cardiológico mensual' })
    await aptRow.getByRole('button', { name: 'Pasar a CONFIRMADA' }).click()
    await expect(aptRow).toContainText('CONFIRMADA')

    // Entrar a Ficha administrativa del paciente e ir a Preparación preliminar (CU-19) sin requerir cita
    await aptRow.getByRole('link', { name: 'Ficha' }).click()
    await expect(page).toHaveURL(/\/admin\/patients\/pat-norte-0101$/)
    await page.getByRole('link', { name: 'Preparación preliminar (CU-19)' }).click()
    await expect(page).toHaveURL(/\/admin\/patients\/pat-norte-0101\/triage$/)

    await page.locator('#triage-allergies').fill('Niega nuevas alergias en admisión')
    await page.locator('#triage-weight').fill('65.0')
    await page.locator('#triage-temp').fill('36.5')
    await page.locator('#triage-bp').fill('118/76')
    await page.getByRole('button', { name: 'Guardar en PENDIENTE_REVISION' }).click()
    await expect(page.getByText('Peso 65.0 kg')).toBeVisible()

    // Editar mientras está en PENDIENTE_REVISION
    const firstPendingCard = page.locator('ol li', { hasText: 'Peso 65.0 kg' }).first()
    await firstPendingCard.getByRole('button', { name: 'Editar preliminar' }).click()
    await page.locator('#triage-weight').fill('65.4')
    await page.getByRole('button', { name: 'Guardar corrección preliminar' }).click()
    await expect(page.getByText('Peso 65.4 kg')).toBeVisible()

    await expectNoHorizontalOverflow(page)
    expect(errors).toEqual([])
  })

  test('CU-03, CU-19, CU-06, CU-08 y PC-04: atención sin cita, finalización con borrador, cierre y adenda', async ({
    page,
  }) => {
    const errors = trackBrowserErrors(page)

    await page.goto('/login')
    await switchDemoProfile(page, /Dra\. Mendoza/)
    await expect(page).toHaveURL(/\/clinical\/records$/)

    const martaRow = page.locator('tbody tr', { hasText: 'PAT-0101' })
    await martaRow.getByRole('link', { name: 'Abrir Espacio Clínico' }).click()
    await expect(page).toHaveURL(/\/clinical\/records\/rec-norte-0101$/)

    await page.getByRole('tab', { name: /Atención y notas/i }).click()
    await page.getByRole('link', { name: 'Iniciar nueva atención' }).click()
    await expect(page).toHaveURL(/\/clinical\/records\/rec-norte-0101\/encounters\/new$/)

    await page.locator('#enc-chief-complaint').fill('Seguimiento E2E sin cita previa')
    await page.getByRole('button', { name: 'Iniciar atención clínica' }).click()
    await expect(page).toHaveURL(/\/clinical\/records\/rec-norte-0101\/encounters\/enc-/)

    // Incorporar preparación preliminar PENDIENTE_REVISION -> pasa a REVISADA
    await page.getByRole('button', { name: 'Incorporar y marcar REVISADA' }).first().click()
    await expect(page.getByText(/Preparaciones revisadas en esta atención/i)).toBeVisible()

    // Guardar nota como BORRADOR y registrar indicación clínica (CU-06)
    await page.locator('#enc-note-content').fill('Evolución clínica estable durante prueba E2E.')
    await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()

    await page.locator('#ind-kind').selectOption('SOLICITUD_ESTUDIO')
    await page.locator('#ind-text').fill('Electrocardiograma de control en 3 meses')
    await page.getByRole('button', { name: 'Agregar indicación' }).click()
    await expect(page.getByText('Electrocardiograma de control en 3 meses')).toBeVisible()

    // Finalizar atención manteniendo la nota en BORRADOR (CU-03)
    await page.getByRole('button', { name: 'Finalizar atención' }).click()
    await expect(page.getByText('Atención: FINALIZADA')).toBeVisible()
    await expect(page.getByText('Nota: BORRADOR')).toBeVisible()

    // Retomar desde bandeja privada de Notas abiertas
    await clickNavLink(page, 'Notas abiertas')
    await expect(page).toHaveURL(/\/clinical\/open-notes$/)
    const draftCard = page.locator('li', { hasText: 'Seguimiento E2E sin cita previa' })
    await expect(draftCard).toBeVisible()
    await draftCard.getByRole('link', { name: 'Retomar nota' }).click()
    await expect(page).toHaveURL(/\/clinical\/records\/rec-norte-0101\/encounters\/enc-/)

    // Cerrar nota explícitamente
    await page.getByRole('button', { name: 'Cerrar nota' }).click()
    const closeDialog = page.locator('dialog[open]')
    await expect(closeDialog).toBeVisible()
    await closeDialog.getByRole('button', { name: 'Confirmar cierre de nota' }).click()
    await expect(closeDialog).toHaveCount(0)
    await expect(page.getByText('Nota: CERRADA')).toBeVisible()

    // Registrar adenda PC-04 sobre la nota cerrada y comprobar en CU-08
    await page.getByLabel('Motivo de adenda').fill('Complemento postcierre E2E')
    await page.getByLabel('Aclaración o complemento clínico').fill('Pulso en reposo: 70 lpm.')
    await page.getByRole('button', { name: 'Registrar adenda' }).click()
    await expect(page.getByText(/Motivo: Complemento postcierre E2E/)).toBeVisible()

    await page.getByRole('link', { name: 'Volver al Espacio Clínico' }).click()
    await expect(page).toHaveURL(/\/clinical\/records\/rec-norte-0101$/)
    await expect(page.getByText('Complemento postcierre E2E')).toBeVisible()

    await expectNoHorizontalOverflow(page)
    expect(errors).toEqual([])
  })

  test('CU-04 y CU-07: validación PDF auxiliar, bloqueo sin atribución y vista previa/anulación de receta', async ({
    page,
  }) => {
    const errors = trackBrowserErrors(page)

    await page.goto('/login')
    await switchDemoProfile(page, /Enf\. Clara Ramírez/)
    await expect(page).toHaveURL(/\/admin\/patients$/)

    await clickNavLink(page, 'Pacientes')
    await expect(page).toHaveURL(/\/admin\/patients$/)
    const martaAdminRow = page.locator('tbody tr', { hasText: 'PAT-0101' })
    await martaAdminRow.getByRole('link', { name: 'Abrir ficha administrativa' }).click()
    await expect(page).toHaveURL(/\/admin\/patients\/pat-norte-0101$/)

    // CU-04: rechazar no-PDF y aceptar PDF sin exponer notas clínicas
    await page.getByRole('button', { name: 'Cargar estudio PDF (CU-04)' }).click()
    const uploadDialog = page.locator('dialog[open]')
    await expect(uploadDialog).toBeVisible()

    await uploadDialog.locator('#admin-study-title').fill('Archivo no permitido')
    await uploadDialog.locator('#admin-study-file').setInputFiles({
      name: 'archivo.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('contenido no pdf'),
    })
    await uploadDialog.getByRole('button', { name: 'Subir estudio PDF' }).click()
    await expect(uploadDialog.getByRole('alert')).toContainText('Solo se admiten documentos en formato PDF')

    await uploadDialog.locator('#admin-study-title').fill('Química sanguínea E2E')
    await uploadDialog.locator('#admin-study-file').setInputFiles({
      name: 'laboratorio-e2e.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%Demo vital\n'),
    })
    await uploadDialog.getByRole('button', { name: 'Subir estudio PDF' }).click()
    await expect(uploadDialog).toHaveCount(0)
    await expect(page.getByText('laboratorio-e2e.pdf (1 KB)', { exact: true })).toBeVisible()

    // CU-07 A1 / CU-14: Dr. Salazar sin atribución no puede emitir recetas
    await switchDemoProfile(page, /Dr\. Salazar/)
    await expect(page).toHaveURL(/\/clinical\/records$/)

    const carlosRow = page.locator('tbody tr', { hasText: 'PAT-0102' })
    await carlosRow.getByRole('link', { name: 'Abrir Espacio Clínico' }).click()
    await page.getByRole('tab', { name: /Atención y notas/i }).click()
    await page.getByRole('link', { name: 'Abrir atención' }).first().click()
    await expect(page).toHaveURL(/\/clinical\/records\/rec-norte-0102\/encounters\/enc-0102-1$/)

    await page.locator('#rx-med').fill('Metformina 850 mg')
    await page.locator('#rx-dose').fill('1 tableta')
    await page.locator('#rx-freq').fill('Cada 12 horas')
    await page.locator('#rx-dur').fill('30 días')
    await page.getByRole('button', { name: 'Guardar borrador de receta' }).click()
    await page.getByRole('button', { name: 'Emitir receta' }).click()
    await expect(page.getByRole('alert').filter({ hasText: /atribución profesional/i })).toBeVisible()

    // CU-07 + CU-04: Dra. Mendoza visualiza estudio cargado, vista previa RX y anula + duplica
    await switchDemoProfile(page, /Dra\. Mendoza/)
    await expect(page).toHaveURL(/\/clinical\/records$/)

    await page.locator('tbody tr', { hasText: 'PAT-0101' }).getByRole('link', { name: 'Abrir Espacio Clínico' }).click()
    await page.getByRole('tab', { name: /Estudios y recetas/i }).click()

    await expect(page.getByText('Química sanguínea E2E')).toBeVisible()
    const rxCard = page.locator('li', { hasText: 'RX-2026-0001' })
    await expect(rxCard).toBeVisible()

    await rxCard.getByRole('button', { name: 'Vista previa / Imprimir' }).click()
    const previewDialog = page.locator('dialog[open]')
    await expect(previewDialog).toContainText('Losartán 50 mg tableta')
    await expect(previewDialog).toContainText('CED-FICT-4012')
    await previewDialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await expect(previewDialog).toHaveCount(0)

    await rxCard.getByRole('button', { name: 'Anular / Duplicar' }).click()
    const cancelDialog = page.locator('dialog[open]')
    await cancelDialog.getByRole('button', { name: 'Anular y duplicar como nuevo borrador' }).click()
    await expect(cancelDialog.getByRole('alert')).toContainText('motivo de anulación es obligatorio')

    await cancelDialog.locator('#space-cancel-rx-reason').fill('Ajuste posológico E2E')
    await cancelDialog.getByRole('button', { name: 'Anular y duplicar como nuevo borrador' }).click()

    await expect(page).toHaveURL(/\/clinical\/records\/rec-norte-0101\/encounters\/enc-0101-1$/)
    await expect(page.getByText(/Receta ANULADA.*Ajuste posológico E2E/i)).toBeVisible()
    await page.getByRole('button', { name: 'Cargar borrador en editor' }).first().click()
    await expect(page.locator('#rx-med')).toHaveValue('Losartán 50 mg tableta')

    await expectNoHorizontalOverflow(page)
    expect(errors).toEqual([])
  })
})
