import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ClinicTenant, ClinicalEncounter, PolicyDecision } from '../domain/types.ts'
import {
  INITIAL_ACCOUNTS,
  INITIAL_APPOINTMENTS,
  INITIAL_CHARGE_SHEETS,
  INITIAL_CUTS,
  INITIAL_ENCOUNTERS,
  INITIAL_GRANTS,
  INITIAL_PATIENTS,
  INITIAL_PAYMENTS,
  INITIAL_RECORDS,
  INITIAL_STUDIES,
  INITIAL_TENANTS,
} from '../mocks/seedData.ts'
import {
  canMarkChargeSheetReviewed,
  canPrepareCut,
  canRecordFullPayment,
  canResolveSpecialistCut,
  canReviseCut,
  evaluateClinicKpis,
  evaluatePlatformKpis,
} from './billingBi.ts'

function expectDenied(decision: PolicyDecision, expectedCode: string): void {
  assert.equal(decision.allowed, false)
  if (!decision.allowed) {
    assert.equal(decision.code, expectedCode)
  }
}

describe('Billing opcional y paneles BI de Oleada 4 (CU-20 a CU-23, PC-05, CU-16)', () => {
  const adminNorte = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-norte-admin')!
  const auxNorte = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-norte-aux')!
  const mendozaNorte = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-norte-mendoza')!
  const salazarNorte = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-norte-salazar')!
  const tenantNorte = INITIAL_TENANTS.find((t) => t.id === 'tenant-norte')!
  const tenantValle = INITIAL_TENANTS.find((t) => t.id === 'tenant-valle')!

  const pat0101 = INITIAL_PATIENTS.find((p) => p.id === 'pat-norte-0101')!
  const rec0101 = INITIAL_RECORDS.find((r) => r.id === 'rec-norte-0101')!
  const encOpenDraft = INITIAL_ENCOUNTERS.find((e) => e.id === 'enc-0101-2')!
  const sheetOpen = INITIAL_CHARGE_SHEETS.find((c) => c.id === 'chg-0101-2')!

  const nowIso = '2026-11-20T12:00:00-06:00'

  it('CU-20 y CU-21: bloquea cobro en ABIERTA o parcial y permite cobro completo con nota en BORRADOR', () => {
    expectDenied(
      canRecordFullPayment(
        auxNorte,
        tenantNorte,
        encOpenDraft,
        pat0101,
        rec0101,
        sheetOpen,
        1200,
        'EFECTIVO',
        INITIAL_GRANTS,
        nowIso,
      ),
      'CHARGE_SHEET_NOT_REVIEWED',
    )

    assert.equal(
      canMarkChargeSheetReviewed(
        auxNorte,
        tenantNorte,
        encOpenDraft,
        pat0101,
        rec0101,
        sheetOpen,
        INITIAL_GRANTS,
        nowIso,
      ).allowed,
      true,
    )

    const reviewedSheet = { ...sheetOpen, status: 'REVISADA' as const }

    // Pago parcial bloqueado (CU-21 A4)
    expectDenied(
      canRecordFullPayment(
        auxNorte,
        tenantNorte,
        encOpenDraft,
        pat0101,
        rec0101,
        reviewedSheet,
        600,
        'TRANSFERENCIA',
        INITIAL_GRANTS,
        nowIso,
      ),
      'PARTIAL_PAYMENT_NOT_ALLOWED',
    )

    // Especialista no ejecuta cobros ordinarios
    expectDenied(
      canRecordFullPayment(
        mendozaNorte,
        tenantNorte,
        encOpenDraft,
        pat0101,
        rec0101,
        reviewedSheet,
        1200,
        'EFECTIVO',
        INITIAL_GRANTS,
        nowIso,
      ),
      'FORBIDDEN_COLLECTION_ROLE',
    )

    // Auxiliar registra cobro completo aunque encOpenDraft tenga noteStatus: BORRADOR (CU-21 A3)
    assert.equal(encOpenDraft.noteStatus, 'BORRADOR')
    assert.equal(
      canRecordFullPayment(
        auxNorte,
        tenantNorte,
        encOpenDraft,
        pat0101,
        rec0101,
        reviewedSheet,
        1200,
        'TRANSFERENCIA',
        INITIAL_GRANTS,
        nowIso,
      ).allowed,
      true,
    )

    // Si atención sigue EN_CURSO, cobro ordinario bloqueado (CU-21 A1)
    const encInProgress: ClinicalEncounter = {
      ...encOpenDraft,
      encounterStatus: 'EN_CURSO',
      endedAtGmt6: null,
    }
    expectDenied(
      canRecordFullPayment(
        auxNorte,
        tenantNorte,
        encInProgress,
        pat0101,
        rec0101,
        reviewedSheet,
        1200,
        'EFECTIVO',
        INITIAL_GRANTS,
        nowIso,
      ),
      'ENCOUNTER_NOT_FINALIZED',
    )
  })

  it('CU-22, CU-23 y PC-05: evita doble inclusión en cortes, exige comentario al observar y permite reenvío', () => {
    const payAlreadyInCut = INITIAL_PAYMENTS.find((p) => p.id === 'pay-0101-1')!
    const payFree = INITIAL_PAYMENTS.find((p) => p.id === 'pay-0102-1')!
    const cutMendoza = INITIAL_CUTS[0]

    expectDenied(
      canPrepareCut(
        auxNorte,
        tenantNorte,
        mendozaNorte,
        '2026-11-01',
        '2026-11-30',
        [payAlreadyInCut],
      ),
      'PAYMENT_ALREADY_IN_CUT',
    )

    assert.equal(
      canPrepareCut(
        adminNorte,
        tenantNorte,
        salazarNorte,
        '2026-11-01',
        '2026-11-30',
        [payFree],
      ).allowed,
      true,
    )

    // Otro especialista no puede confirmar corte ajeno (CU-23 A1)
    expectDenied(
      canResolveSpecialistCut(salazarNorte, tenantNorte, cutMendoza, 'CONFIRM', ''),
      'FORBIDDEN_CUT_OWNER',
    )

    // Observar exige comentario obligatorio (PC-05 / CU-23 A3)
    expectDenied(
      canResolveSpecialistCut(mendozaNorte, tenantNorte, cutMendoza, 'OBSERVE', '   '),
      'OBSERVATION_COMMENT_REQUIRED',
    )

    assert.equal(
      canResolveSpecialistCut(
        mendozaNorte,
        tenantNorte,
        cutMendoza,
        'OBSERVE',
        'Revisar referencia de voucher',
      ).allowed,
      true,
    )

    const observedCut = { ...cutMendoza, status: 'OBSERVADO' as const }
    expectDenied(
      canReviseCut(
        auxNorte,
        tenantNorte,
        observedCut,
        '2026-11-01',
        '2026-11-15',
        [payAlreadyInCut],
        '',
      ),
      'ADJUSTMENT_NOTE_REQUIRED',
    )
    assert.equal(
      canReviseCut(
        auxNorte,
        tenantNorte,
        observedCut,
        '2026-11-01',
        '2026-11-15',
        [payAlreadyInCut],
        'Voucher validado en terminal',
      ).allowed,
      true,
    )
  })

  it('CU-16 BI Plataforma: distingue valor real 0 (AVAILABLE) vs fallo de fuente (UNAVAILABLE)', () => {
    const emptyRangeKpis = evaluatePlatformKpis({
      tenants: INITIAL_TENANTS,
      accounts: INITIAL_ACCOUNTS,
      appointments: INITIAL_APPOINTMENTS,
      studies: INITIAL_STUDIES,
      periodStartGmt6: '2025-01-01',
      periodEndGmt6: '2025-01-31',
      evaluatedAtGmt6: nowIso,
    })

    assert.equal(emptyRangeKpis.appointmentActivity.status, 'AVAILABLE')
    assert.equal(emptyRangeKpis.appointmentActivity.data?.total, 0)
    assert.equal(emptyRangeKpis.documentConsumption.status, 'AVAILABLE')
    assert.equal(emptyRangeKpis.documentConsumption.data?.totalDocuments, 0)

    const faultedKpis = evaluatePlatformKpis({
      tenants: INITIAL_TENANTS,
      accounts: INITIAL_ACCOUNTS,
      appointments: INITIAL_APPOINTMENTS,
      studies: INITIAL_STUDIES,
      periodStartGmt6: '2026-11-01',
      periodEndGmt6: '2026-11-30',
      evaluatedAtGmt6: nowIso,
      faults: { identity: true, agenda: true },
    })

    assert.equal(faultedKpis.planOccupancy.status, 'UNAVAILABLE')
    assert.equal(faultedKpis.planOccupancy.data, null)
    assert.equal(faultedKpis.appointmentActivity.status, 'UNAVAILABLE')
  })

  it('CU-16 BI Clínica: cuenta atenciones FINALIZADAS y reporta NOT_APPLICABLE sin Billing', () => {
    const norteKpis = evaluateClinicKpis({
      tenant: tenantNorte,
      appointments: INITIAL_APPOINTMENTS,
      encounters: INITIAL_ENCOUNTERS,
      payments: INITIAL_PAYMENTS,
      cuts: INITIAL_CUTS,
      periodStartGmt6: '2026-11-01',
      periodEndGmt6: '2026-11-30',
      evaluatedAtGmt6: nowIso,
    })

    // En INITIAL_ENCOUNTERS hay 3 atenciones FINALIZADA en Norte (incluyendo enc-0101-2 con nota BORRADOR)
    assert.equal(norteKpis.completedConsultations.status, 'AVAILABLE')
    assert.equal(norteKpis.completedConsultations.data?.total, 3)
    assert.equal(norteKpis.recordedPayments.status, 'AVAILABLE')
    assert.equal(norteKpis.recordedPayments.data?.totalMxn, 3000)

    const valleNoBilling: ClinicTenant = { ...tenantValle, usesBilling: false }
    const noBillingKpis = evaluateClinicKpis({
      tenant: valleNoBilling,
      appointments: INITIAL_APPOINTMENTS,
      encounters: INITIAL_ENCOUNTERS,
      payments: INITIAL_PAYMENTS,
      cuts: INITIAL_CUTS,
      periodStartGmt6: '2026-11-01',
      periodEndGmt6: '2026-11-30',
      evaluatedAtGmt6: nowIso,
      faults: { billing: true },
    })

    // NOT_APPLICABLE tiene prioridad sobre fallo simulado y no se muestra como 0 (CU-16 A2)
    assert.equal(noBillingKpis.recordedPayments.status, 'NOT_APPLICABLE')
    assert.equal(noBillingKpis.cutsStatus.status, 'NOT_APPLICABLE')
  })
})
