import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PolicyDecision } from '../domain/types.ts'
import { INITIAL_ACCOUNTS, INITIAL_TENANTS } from '../mocks/seedData.ts'
import {
  canAuthenticate,
  canChangeClinicStatus,
  canCompleteInitialAdmin,
  canCreateClinic,
  canCreateStaff,
  canManageTenantPlan,
  canToggleStaffActive,
  canUpdateAuxiliaryLinks,
  canUpdateStaffRoleAndPermissions,
  evaluateRouteAccess,
  getTenantAccessState,
} from './policy.ts'

function expectDenied(decision: PolicyDecision, expectedCode: string): void {
  assert.equal(decision.allowed, false)
  if (!decision.allowed) {
    assert.equal(decision.code, expectedCode)
  }
}

describe('Políticas de Oleada 1 (CU-10 a CU-17)', () => {
  const superAdmin = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-superadmin')!
  const adminNorte = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-norte-admin')!
  const mendozaNorte = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-norte-mendoza')!
  const salazarNorte = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-norte-salazar')!
  const auxNorte = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-norte-aux')!
  const vegaDisabled = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-norte-vega')!
  const mendozaValle = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-valle-mendoza')!
  const adminValle = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-valle-admin')!

  const tenantNorte = INITIAL_TENANTS.find((t) => t.id === 'tenant-norte')!
  const tenantValle = INITIAL_TENANTS.find((t) => t.id === 'tenant-valle')!
  const tenantAurora = INITIAL_TENANTS.find((t) => t.id === 'tenant-aurora')!

  it('CU-13: aísla cuentas entre clínicas y bloquea cuentas desactivadas o clínicas suspendidas', () => {
    assert.equal(canAuthenticate(adminNorte, tenantNorte, 'CLINIC').allowed, true)
    expectDenied(canAuthenticate(mendozaValle, tenantNorte, 'CLINIC'), 'TENANT_MISMATCH')
    expectDenied(canAuthenticate(adminValle, tenantValle, 'CLINIC'), 'TENANT_SUSPENDED')
    expectDenied(canAuthenticate(vegaDisabled, tenantNorte, 'CLINIC'), 'ACCOUNT_DISABLED')
  })

  it('CU-11 y CU-15: valida slugs duplicados, recuperación PENDIENTE_ADMIN y transición ACTIVA/SUSPENDIDA', () => {
    expectDenied(canCreateClinic(superAdmin, INITIAL_TENANTS, 'clinica-norte'), 'DUPLICATE_CLINIC')

    assert.equal(canCompleteInitialAdmin(superAdmin, tenantAurora).allowed, true)
    assert.equal(canCompleteInitialAdmin(superAdmin, tenantNorte).allowed, false)

    expectDenied(
      canChangeClinicStatus(superAdmin, tenantAurora, 'SUSPENDIDA'),
      'INVALID_STATE_PENDING_ADMIN',
    )

    assert.equal(canChangeClinicStatus(superAdmin, tenantNorte, 'SUSPENDIDA', '').allowed, false)
    expectDenied(
      canChangeClinicStatus(superAdmin, tenantNorte, 'SUSPENDIDA', ''),
      'REASON_REQUIRED',
    )
    assert.equal(
      canChangeClinicStatus(superAdmin, tenantNorte, 'SUSPENDIDA', 'Falta de renovación').allowed,
      true,
    )
    assert.equal(canChangeClinicStatus(superAdmin, tenantValle, 'ACTIVA', '').allowed, true)
  })

  it('CU-14: impide que AdminClinica conceda SuperAdmin o habilite prescripción sin atribución', () => {
    expectDenied(
      canUpdateStaffRoleAndPermissions(adminNorte, salazarNorte, 'SUPER_ADMIN', false, false),
      'PRIVILEGE_ESCALATION_BLOCKED',
    )

    expectDenied(
      canUpdateStaffRoleAndPermissions(adminNorte, salazarNorte, 'ESPECIALISTA', true, false),
      'ATTRIBUTION_REQUIRED',
    )

    assert.equal(
      canUpdateStaffRoleAndPermissions(adminNorte, salazarNorte, 'ESPECIALISTA', true, true)
        .allowed,
      true,
    )
  })

  it('CU-12 y CU-17: respeta cuota máxima, último AdminClinica y aislamiento en vínculos auxiliares', () => {
    expectDenied(canCreateStaff(adminNorte, tenantNorte, 8, 'AUXILIAR', false, false), 'QUOTA_REACHED')
    expectDenied(
      canToggleStaffActive(adminNorte, adminNorte, tenantNorte, 4, 1, false),
      'LAST_ADMIN_PROTECTED',
    )
    expectDenied(
      canUpdateAuxiliaryLinks(adminNorte, auxNorte, [mendozaValle.id], INITIAL_ACCOUNTS),
      'INVALID_LINKED_SPECIALIST',
    )
    assert.equal(
      canUpdateAuxiliaryLinks(adminNorte, auxNorte, [mendozaNorte.id], INITIAL_ACCOUNTS).allowed,
      true,
    )
  })

  it('CU-17 y CU-10: AdminClinica no modifica plan y las rutas mantienen separación estricta', () => {
    assert.equal(canManageTenantPlan(adminNorte, tenantNorte, 'READ').allowed, true)
    assert.equal(canManageTenantPlan(adminNorte, tenantNorte, 'WRITE').allowed, false)

    assert.equal(evaluateRouteAccess(superAdmin, null, 'CLINIC_ADMIN').allowed, false)
    assert.equal(evaluateRouteAccess(adminNorte, tenantNorte, 'CLINIC_CLINICAL').allowed, false)
    assert.equal(evaluateRouteAccess(auxNorte, tenantNorte, 'CLINIC_CLINICAL').allowed, false)
    assert.equal(evaluateRouteAccess(mendozaNorte, tenantNorte, 'CLINIC_ADMIN').allowed, false)
    assert.equal(evaluateRouteAccess(mendozaNorte, tenantNorte, 'CLINIC_CLINICAL').allowed, true)
  })

  it('Contrato Platform-Identity GetTenantAccessState: expone solo estado calculado sin PII', () => {
    const activeState = getTenantAccessState('tenant-norte', INITIAL_TENANTS, '2026-11-19T16:30:00-06:00')
    assert.deepEqual(activeState, {
      tenantId: 'tenant-norte',
      state: 'ACTIVA',
      mayAuthenticate: true,
      evaluatedAtGmt6: '2026-11-19T16:30:00-06:00',
    })

    const suspendedState = getTenantAccessState('tenant-valle', INITIAL_TENANTS, '2026-11-19T16:30:00-06:00')
    assert.equal(suspendedState?.mayAuthenticate, false)

    const pendingState = getTenantAccessState('tenant-aurora', INITIAL_TENANTS, '2026-11-19T16:30:00-06:00')
    assert.equal(pendingState?.mayAuthenticate, false)

    assert.equal(getTenantAccessState('no-existe', INITIAL_TENANTS, '2026-11-19T16:30:00-06:00'), null)
  })
})
