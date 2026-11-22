import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { INITIAL_PATIENTS } from '../mocks/seedData.ts'
import {
  isSameSpecialistBff,
  parseAgendaProblemDetails,
  resolveActiveSpecialistsBff,
  resolvePatientDisplayBff,
  toAgendaPatientUuid,
} from './agendaClient.ts'

describe('agendaClient helpers y cruce BFF (D-AG-05)', () => {
  it('extrae metadatos de conflictos 409 SCHEDULE_CHANGE_CONFLICTS_WITH_APPOINTMENTS', () => {
    const problem = parseAgendaProblemDetails(
      409,
      {
        title: 'SCHEDULE_CHANGE_CONFLICTS_WITH_APPOINTMENTS',
        code: 'SCHEDULE_CHANGE_CONFLICTS_WITH_APPOINTMENTS',
        detail: 'No es posible aplicar el cambio de horario porque 2 cita(s) quedarían fuera de jornada.',
        conflictingCount: 2,
        conflictingAppointmentIds: ['apt-1', 'apt-2'],
        conflictingSlotsGmt6: ['2026-11-23 10:00-10:30 (-06:00)', '2026-11-23 16:00-16:30 (-06:00)'],
      },
      'Error genérico',
    )

    assert.equal(problem.status, 409)
    assert.equal(problem.code, 'SCHEDULE_CHANGE_CONFLICTS_WITH_APPOINTMENTS')
    assert.equal(problem.conflictingCount, 2)
    assert.deepEqual(problem.conflictingAppointmentIds, ['apt-1', 'apt-2'])
    assert.equal(problem.conflictingSlotsGmt6?.length, 2)
  })

  it('mapea IDs de pacientes demo a UUID y cruza nombres desde Patients estilo BFF', () => {
    assert.equal(
      toAgendaPatientUuid('pat-norte-0101'),
      '30000000-0000-0000-0000-000000000101',
    )

    const resolved = resolvePatientDisplayBff(
      '30000000-0000-0000-0000-000000000101',
      INITIAL_PATIENTS,
    )
    assert.equal(resolved.patientCode, 'PAT-0101')
    assert.equal(resolved.fullName, 'Elena Torres Morales')
    assert.equal(resolved.linkPatientId, 'pat-norte-0101')

    const exceptionalOnly = resolvePatientDisplayBff(
      '30000000-0000-0000-0000-000000000104',
      INITIAL_PATIENTS,
    )
    assert.equal(exceptionalOnly.patientCode, 'PAT-0104')

    const norteSpecs = resolveActiveSpecialistsBff('tenant-norte', null)
    assert.equal(norteSpecs.length, 2)
    assert.equal(norteSpecs[0].id, '20000000-0000-0000-0000-000000000003')
    assert.equal(
      isSameSpecialistBff('acc-norte-mendoza', '20000000-0000-0000-0000-000000000003'),
      true,
    )
  })
})
