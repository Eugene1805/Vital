import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { INITIAL_ENCOUNTERS } from '../mocks/seedData.ts'
import {
  BillingApiError,
  createBillingClient,
  normalizeCutsKpiEnvelope,
  normalizePaymentsKpiEnvelope,
  normalizeTotalsByMethod,
  parseBillingProblemDetails,
  resolveEncounterDisplayBff,
  toBillingEncounterUuid,
} from './billingClient.ts'

describe('billingClient helpers y contrato HTTP', () => {
  it('parsea ProblemDetails RFC 7807 de saas-billing', () => {
    const disabled = parseBillingProblemDetails(
      403,
      {
        title: 'BILLING_DISABLED',
        code: 'BILLING_DISABLED',
        detail: 'Esta clínica no tiene habilitado el módulo Billing.',
      },
      'Error genérico',
    )
    assert.equal(disabled.status, 403)
    assert.equal(disabled.code, 'BILLING_DISABLED')
    assert.match(disabled.message, /no tiene habilitado/i)

    const partial = parseBillingProblemDetails(
      400,
      {
        title: 'PARTIAL_PAYMENT_NOT_ALLOWED',
        detail: 'Solo se permiten cobros completos.',
      },
      'Error genérico',
    )
    assert.equal(partial.status, 400)
    assert.equal(partial.code, 'PARTIAL_PAYMENT_NOT_ALLOWED')
    assert.equal(partial.message, 'Solo se permiten cobros completos.')

    const fallback = parseBillingProblemDetails(409, 'no-objeto', 'Conflicto de corte')
    assert.equal(fallback.status, 409)
    assert.equal(fallback.code, 'HTTP_409')
    assert.equal(fallback.message, 'Conflicto de corte')
  })

  it('normaliza totales por método y envelopes KPI de pagos y cortes', () => {
    const normalized = normalizeTotalsByMethod({
      efectivo: 1150,
      tarjeta: 1850,
      transferencia: 1250,
    })
    assert.deepEqual(normalized, {
      EFECTIVO: 1150,
      TARJETA: 1850,
      TRANSFERENCIA: 1250,
    })

    const availablePayments = normalizePaymentsKpiEnvelope({
      kpiKey: 'RECORDED_PAYMENTS',
      status: 'AVAILABLE',
      data: {
        totalMxn: 4250,
        paymentCount: 3,
        byMethod: {
          efectivo: 1150,
          tarjeta: 1850,
          transferencia: 1250,
        },
      },
      evaluatedAtGmt6: '2026-11-23T12:00:00-06:00',
    })
    assert.equal(availablePayments.status, 'AVAILABLE')
    assert.equal(availablePayments.data?.totalMxn, 4250)
    assert.deepEqual(availablePayments.data?.byMethod, {
      EFECTIVO: 1150,
      TARJETA: 1850,
      TRANSFERENCIA: 1250,
    })

    const notApplicablePayments = normalizePaymentsKpiEnvelope({
      kpiKey: 'RECORDED_PAYMENTS',
      status: 'NOT_APPLICABLE',
      data: null,
      evaluatedAtGmt6: '2026-11-23T12:00:00-06:00',
      reason: 'Clínica sin Billing habilitado.',
    })
    assert.equal(notApplicablePayments.status, 'NOT_APPLICABLE')
    assert.equal(notApplicablePayments.data, null)
    assert.equal(notApplicablePayments.reason, 'Clínica sin Billing habilitado.')

    const cutsEnvelope = normalizeCutsKpiEnvelope({
      kpiKey: 'CUTS_STATUS',
      status: 'AVAILABLE',
      data: {
        totalCuts: 2,
        preparadoCount: 1,
        observadoCount: 0,
        confirmadoCount: 1,
        confirmedAmountMxn: 2400,
        observedAmountMxn: 0,
      },
      evaluatedAtGmt6: '2026-11-23T12:00:00-06:00',
    })
    assert.equal(cutsEnvelope.status, 'AVAILABLE')
    assert.equal(cutsEnvelope.data?.confirmedAmountMxn, 2400)
  })

  it('mapea UUIDs de atenciones demo y resuelve estado administrativo/clínico sin texto privado', () => {
    assert.equal(
      toBillingEncounterUuid('enc-0101-2'),
      '40000000-0000-0000-0000-000000000102',
    )

    const draftNoteFinalized = resolveEncounterDisplayBff(
      '40000000-0000-0000-0000-000000000102',
      INITIAL_ENCOUNTERS,
    )
    assert.equal(draftNoteFinalized.displayId, 'enc-0101-2')
    assert.equal(draftNoteFinalized.encounterStatus, 'FINALIZADA')
    assert.equal(draftNoteFinalized.noteStatus, 'BORRADOR')

    const exceptional = resolveEncounterDisplayBff(
      '40000000-0000-0000-0000-000000000104',
      INITIAL_ENCOUNTERS,
    )
    assert.equal(exceptional.displayId, 'enc-0104-1')
    assert.equal(exceptional.encounterStatus, 'FINALIZADA')

    const openEncounter = resolveEncounterDisplayBff(
      '40000000-0000-0000-0000-000000000105',
      INITIAL_ENCOUNTERS,
    )
    assert.equal(openEncounter.displayId, 'enc-0101-open')
    assert.equal(openEncounter.encounterStatus, 'EN_CURSO')
  })

  it('envía Bearer JWT, mapea upsert/pago/ajuste/KPIs y propaga BillingApiError en 409', async () => {
    const previousFetch = globalThis.fetch
    const globalMutable = globalThis as unknown as {
      window?: { localStorage: Storage }
    }
    const previousWindow = globalMutable.window
    const storageMap = new Map<string, string>([
      [
        'vital_identity_tokens_v1',
        JSON.stringify({ accessToken: 'jwt-test-token', refreshToken: 'rt-test-token' }),
      ],
    ])
    const mockStorage: Storage = {
      get length() {
        return storageMap.size
      },
      clear: () => {
        storageMap.clear()
      },
      getItem: (key) => storageMap.get(key) ?? null,
      key: (index) => Array.from(storageMap.keys())[index] ?? null,
      removeItem: (key) => {
        storageMap.delete(key)
      },
      setItem: (key, value) => {
        storageMap.set(key, value)
      },
    }
    globalMutable.window = {
      localStorage: mockStorage,
    }

    const calls: Array<{ url: string; method: string; auth: string | null; body: string | null }> = []

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      const url = typeof input === 'string' ? input : input.toString()
      calls.push({
        url,
        method: init?.method ?? 'GET',
        auth: headers.get('Authorization'),
        body: typeof init?.body === 'string' ? init.body : null,
      })

      if (url.endsWith('/v1/encounters/40000000-0000-0000-0000-000000000104/charge-sheet')) {
        return new Response(
          JSON.stringify({
            id: 'sheet-1',
            tenantId: '10000000-0000-0000-0000-000000000001',
            encounterId: '40000000-0000-0000-0000-000000000104',
            recordId: '35000000-0000-0000-0000-000000000104',
            patientId: '30000000-0000-0000-0000-000000000104',
            specialistId: '20000000-0000-0000-0000-000000000004',
            status: 'ABIERTA',
            totalMxn: 1250,
            items: [],
            reviewedByName: null,
            reviewedAtGmt6: null,
            createdAtGmt6: '2026-11-23T12:00:00-06:00',
            updatedAtGmt6: '2026-11-23T12:00:00-06:00',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      if (url.endsWith('/v1/payments') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 'pay-1',
            folio: 'COB-2026-0003',
            tenantId: '10000000-0000-0000-0000-000000000001',
            chargeSheetId: 'sheet-1',
            encounterId: '40000000-0000-0000-0000-000000000104',
            patientId: '30000000-0000-0000-0000-000000000104',
            specialistId: '20000000-0000-0000-0000-000000000004',
            amountMxn: 1250,
            method: 'TRANSFERENCIA',
            paidAtGmt6: '2026-11-23T12:05:00-06:00',
            collectedByAccountId: '20000000-0000-0000-0000-000000000005',
            collectedByName: 'Enf. Clara Ramírez',
            cutId: null,
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        )
      }

      if (url.endsWith('/v1/adjustments') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 'adj-1',
            folio: 'AJU-2026-0001',
            tenantId: '10000000-0000-0000-0000-000000000001',
            targetType: 'CUT',
            targetId: 'cut-1',
            deltaMxn: -150,
            reason: 'Bonificación administrativa autorizada',
            actorAccountId: '20000000-0000-0000-0000-000000000002',
            actorName: 'Lic. Mariana Paredes',
            createdAtGmt6: '2026-11-23T12:10:00-06:00',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        )
      }

      if (url.includes('/v1/metrics/clinic/payments')) {
        return new Response(
          JSON.stringify({
            kpiKey: 'RECORDED_PAYMENTS',
            status: 'AVAILABLE',
            data: {
              totalMxn: 4250,
              paymentCount: 3,
              byMethod: { efectivo: 1150, tarjeta: 1850, transferencia: 1250 },
            },
            evaluatedAtGmt6: '2026-11-23T12:12:00-06:00',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      return new Response(
        JSON.stringify({
          title: 'CUT_ALREADY_CONFIRMED',
          code: 'CUT_ALREADY_CONFIRMED',
          detail: 'El corte confirmado es inmutable.',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof globalThis.fetch

    try {
      const client = createBillingClient('http://localhost:8084/')

      const sheet = await client.upsertChargeSheet('enc-0104-1', [
        {
          conceptCode: 'CON-GEN',
          description: 'Consulta médica general',
          category: 'CONSULTA',
          quantity: 1,
          unitPriceMxn: 800,
        },
      ])
      assert.equal(sheet.status, 'ABIERTA')

      const payment = await client.recordFullPayment({
        chargeSheetId: 'sheet-1',
        amountMxn: 1250,
        method: 'TRANSFERENCIA',
      })
      assert.equal(payment.folio, 'COB-2026-0003')

      const adjustment = await client.createAdjustment({
        targetType: 'CUT',
        targetId: 'cut-1',
        deltaMxn: -150,
        reason: 'Bonificación administrativa autorizada',
      })
      assert.equal(adjustment.folio, 'AJU-2026-0001')

      const kpi = await client.getClinicPaymentsMetric('2026-11-01', '2026-11-30')
      assert.equal(kpi.status, 'AVAILABLE')
      assert.equal(kpi.data?.byMethod.TRANSFERENCIA, 1250)

      assert.equal(calls.length, 4)
      for (const call of calls) {
        assert.equal(call.auth, 'Bearer jwt-test-token')
      }

      await assert.rejects(
        () =>
          client.reviseCut('cut-1', {
            periodStartGmt6: '2026-11-01',
            periodEndGmt6: '2026-11-30',
            paymentIds: ['pay-1'],
            adjustmentNote: 'Intento tras confirmar',
          }),
        (err: unknown) =>
          err instanceof BillingApiError &&
          err.problem.status === 409 &&
          err.problem.code === 'CUT_ALREADY_CONFIRMED',
      )
    } finally {
      globalThis.fetch = previousFetch
      globalMutable.window = previousWindow
    }
  })
})
