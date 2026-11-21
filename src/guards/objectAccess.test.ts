import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PolicyDecision } from '../domain/types.ts'
import {
  INITIAL_ACCOUNTS,
  INITIAL_GRANTS,
  INITIAL_PATIENTS,
  INITIAL_RECORDS,
  INITIAL_TENANTS,
} from '../mocks/seedData.ts'
import {
  canCreateExceptionalRequest,
  canResolveExceptionalRequest,
  canRevokeExceptionalGrant,
  evaluateObjectAccess,
  getEffectiveGrantStatus,
  searchPatientsRestricted,
} from './objectAccess.ts'

function expectDenied(decision: PolicyDecision, expectedCode: string): void {
  assert.equal(decision.allowed, false)
  if (!decision.allowed) {
    assert.equal(decision.code, expectedCode)
  }
}

describe('Control granular por objeto CU-10 y flujos de Oleada 2', () => {
  const adminNorte = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-norte-admin')!
  const mendozaNorte = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-norte-mendoza')!
  const salazarNorte = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-norte-salazar')!
  const auxNorte = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-norte-aux')!
  const tenantNorte = INITIAL_TENANTS.find((t) => t.id === 'tenant-norte')!

  const pat0101 = INITIAL_PATIENTS.find((p) => p.id === 'pat-norte-0101')!
  const rec0101 = INITIAL_RECORDS.find((r) => r.id === 'rec-norte-0101')!

  const pat0102 = INITIAL_PATIENTS.find((p) => p.id === 'pat-norte-0102')!
  const rec0102 = INITIAL_RECORDS.find((r) => r.id === 'rec-norte-0102')!

  const pat0103 = INITIAL_PATIENTS.find((p) => p.id === 'pat-norte-0103')!
  const rec0103 = INITIAL_RECORDS.find((r) => r.id === 'rec-norte-0103')!

  const nowIso = '2026-11-19T10:00:00-06:00'

  it('CU-01 A6 y CU-08: Especialista registrante sin vínculo no entra al Espacio Clínico; tratante vigente sí', () => {
    expectDenied(
      evaluateObjectAccess({
        actor: mendozaNorte,
        tenant: tenantNorte,
        patient: pat0103,
        record: rec0103,
        operation: 'CLINICAL_RECORD_READ',
        grants: INITIAL_GRANTS,
        nowIsoGmt6: nowIso,
      }),
      'NO_CLINICAL_LINK',
    )

    assert.equal(
      evaluateObjectAccess({
        actor: salazarNorte,
        tenant: tenantNorte,
        patient: pat0101,
        record: rec0101,
        operation: 'CLINICAL_RECORD_READ',
        grants: INITIAL_GRANTS,
        nowIsoGmt6: nowIso,
      }).allowed,
      true,
    )

    expectDenied(
      evaluateObjectAccess({
        actor: adminNorte,
        tenant: tenantNorte,
        patient: pat0101,
        record: rec0101,
        operation: 'CLINICAL_RECORD_READ',
        grants: INITIAL_GRANTS,
        nowIsoGmt6: nowIso,
      }),
      'FORBIDDEN_CLINICAL_ROLE',
    )
  })

  it('CU-02, CU-24 y PC-02: diferencia asignación inicial, reasignación exclusiva AdminClinica y tratantes', () => {
    expectDenied(
      evaluateObjectAccess({
        actor: auxNorte,
        tenant: tenantNorte,
        patient: pat0101,
        record: rec0101,
        operation: 'RECORD_ASSIGN_INITIAL_PRIMARY',
        grants: INITIAL_GRANTS,
        nowIsoGmt6: nowIso,
      }),
      'ALREADY_HAS_PRIMARY',
    )

    assert.equal(
      evaluateObjectAccess({
        actor: auxNorte,
        tenant: tenantNorte,
        patient: pat0103,
        record: rec0103,
        operation: 'RECORD_ASSIGN_INITIAL_PRIMARY',
        grants: INITIAL_GRANTS,
        nowIsoGmt6: nowIso,
      }).allowed,
      true,
    )

    expectDenied(
      evaluateObjectAccess({
        actor: auxNorte,
        tenant: tenantNorte,
        patient: pat0101,
        record: rec0101,
        operation: 'RECORD_REASSIGN_PRIMARY',
        grants: INITIAL_GRANTS,
        nowIsoGmt6: nowIso,
      }),
      'FORBIDDEN_REASSIGN_PRIMARY',
    )

    expectDenied(
      evaluateObjectAccess({
        actor: auxNorte,
        tenant: tenantNorte,
        patient: pat0101,
        record: rec0101,
        operation: 'RECORD_MANAGE_TREATING',
        grants: INITIAL_GRANTS,
        nowIsoGmt6: nowIso,
      }),
      'FORBIDDEN_MANAGE_TREATING',
    )

    assert.equal(
      evaluateObjectAccess({
        actor: adminNorte,
        tenant: tenantNorte,
        patient: pat0101,
        record: rec0101,
        operation: 'RECORD_REASSIGN_PRIMARY',
        grants: INITIAL_GRANTS,
        nowIsoGmt6: nowIso,
      }).allowed,
      true,
    )
  })

  it('PC-03: buscador fuera de ámbito exige código exacto o >= 4 caracteres y expone solo 3 campos', () => {
    const tooShort = searchPatientsRestricted('Ca', auxNorte, INITIAL_PATIENTS)
    assert.equal(tooShort.valid, false)
    assert.equal(tooShort.results.length, 0)

    const exactCode = searchPatientsRestricted('PAT-0102', auxNorte, INITIAL_PATIENTS)
    assert.equal(exactCode.valid, true)
    assert.equal(exactCode.results.length, 1)
    assert.deepEqual(Object.keys(exactCode.results[0]).sort(), [
      'birthYear',
      'fullName',
      'patientCode',
      'patientId',
    ])
  })

  it('PC-01: solicitud, recorte al aprobar, vencimiento GMT-6, revocación y cero acceso clínico al auxiliar', () => {
    const expiredGrant = INITIAL_GRANTS.find((g) => g.id === 'grant-norte-expired')!
    assert.equal(getEffectiveGrantStatus(expiredGrant, nowIso), 'VENCIDA')

    // Fuera de ámbito ordinario y con permiso vencido -> bloqueado
    expectDenied(
      evaluateObjectAccess({
        actor: auxNorte,
        tenant: tenantNorte,
        patient: pat0102,
        record: rec0102,
        operation: 'PATIENT_ADMIN_READ',
        grants: [expiredGrant],
        nowIsoGmt6: nowIso,
      }),
      'OUT_OF_AUXILIARY_SCOPE',
    )

    // No puede solicitar sobre paciente ya en su ámbito ordinario (PAT-0101)
    expectDenied(
      canCreateExceptionalRequest(
        auxNorte,
        pat0101,
        rec0101,
        ['VIEW_ADMIN_SUMMARY'],
        'Necesario',
        3,
        [],
      ),
      'ALREADY_IN_ORDINARY_SCOPE',
    )

    const pendingGrant = INITIAL_GRANTS.find((g) => g.id === 'grant-norte-1')!
    // AdminClinica no puede aprobar duración ni operaciones mayores a las solicitadas
    expectDenied(
      canResolveExceptionalRequest(
        adminNorte,
        pendingGrant,
        'APROBAR',
        ['VIEW_ADMIN_SUMMARY'],
        12,
      ),
      'EXCEEDS_REQUESTED_DURATION',
    )
    expectDenied(
      canResolveExceptionalRequest(
        adminNorte,
        pendingGrant,
        'APROBAR',
        ['MANAGE_BILLING'],
        3,
      ),
      'EXCEEDS_REQUESTED_OPS',
    )

    const activeGrant = {
      ...pendingGrant,
      status: 'APROBADA' as const,
      approvedOperations: ['VIEW_ADMIN_SUMMARY'] as const,
      approvedMonths: 3,
      expiresAtGmt6: '2027-02-19T10:00:00-06:00',
    }
    assert.equal(
      evaluateObjectAccess({
        actor: auxNorte,
        tenant: tenantNorte,
        patient: pat0102,
        record: rec0102,
        operation: 'PATIENT_ADMIN_READ',
        grants: [{ ...activeGrant, approvedOperations: [...activeGrant.approvedOperations] }],
        nowIsoGmt6: nowIso,
      }).allowed,
      true,
    )

    // Aun con permiso excepcional vigente, auxiliar nunca lee Espacio Clínico
    expectDenied(
      evaluateObjectAccess({
        actor: auxNorte,
        tenant: tenantNorte,
        patient: pat0102,
        record: rec0102,
        operation: 'CLINICAL_RECORD_READ',
        grants: [{ ...activeGrant, approvedOperations: [...activeGrant.approvedOperations] }],
        nowIsoGmt6: nowIso,
      }),
      'FORBIDDEN_CLINICAL_ROLE',
    )

    assert.equal(
      canRevokeExceptionalGrant(
        adminNorte,
        { ...activeGrant, approvedOperations: [...activeGrant.approvedOperations] },
        nowIso,
      ).allowed,
      true,
    )
  })
})
