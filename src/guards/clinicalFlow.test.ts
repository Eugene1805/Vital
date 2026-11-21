import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  ClinicalEncounter,
  PolicyDecision,
  PreliminaryPreparation,
  Prescription,
} from '../domain/types.ts'
import {
  INITIAL_ACCOUNTS,
  INITIAL_APPOINTMENTS,
  INITIAL_ENCOUNTERS,
  INITIAL_GRANTS,
  INITIAL_PATIENTS,
  INITIAL_PREPARATIONS,
  INITIAL_PRESCRIPTIONS,
  INITIAL_RECORDS,
  INITIAL_TENANTS,
} from '../mocks/seedData.ts'
import {
  canAppendClosedNoteAddendum,
  canAppendPreparationAddendum,
  canCancelPrescription,
  canCreatePreparation,
  canEditOrCloseNote,
  canEditPreparation,
  canFinalizeEncounter,
  canIssuePrescription,
  canScheduleAppointment,
  canTransitionAppointmentStatus,
  canUploadStudyPdf,
} from './clinicalFlow.ts'

function expectDenied(decision: PolicyDecision, expectedCode: string): void {
  assert.equal(decision.allowed, false)
  if (!decision.allowed) {
    assert.equal(decision.code, expectedCode)
  }
}

describe('Flujos clínicos y agenda de Oleada 3 (clinicalFlow)', () => {
  const adminNorte = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-norte-admin')!
  const mendozaNorte = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-norte-mendoza')!
  const salazarNorte = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-norte-salazar')!
  const auxNorte = INITIAL_ACCOUNTS.find((a) => a.id === 'acc-norte-aux')!
  const tenantNorte = INITIAL_TENANTS.find((t) => t.id === 'tenant-norte')!

  const pat0101 = INITIAL_PATIENTS.find((p) => p.id === 'pat-norte-0101')!
  const rec0101 = INITIAL_RECORDS.find((r) => r.id === 'rec-norte-0101')!

  const pat0102 = INITIAL_PATIENTS.find((p) => p.id === 'pat-norte-0102')!
  const rec0102 = INITIAL_RECORDS.find((r) => r.id === 'rec-norte-0102')!

  const nowIso = '2026-11-19T10:00:00-06:00'

  it('CU-18: Agenda detecta empalmes exactos en GMT-6 y valida máquina de estados', () => {
    const conflict = canScheduleAppointment(
      auxNorte,
      tenantNorte,
      pat0101,
      rec0101,
      mendozaNorte,
      '2026-11-20T10:15:00-06:00',
      30,
      'Seguimiento empalmado',
      INITIAL_APPOINTMENTS,
      INITIAL_GRANTS,
      nowIso,
    )
    expectDenied(conflict, 'SCHEDULE_CONFLICT')

    const validSlot = canScheduleAppointment(
      auxNorte,
      tenantNorte,
      pat0101,
      rec0101,
      mendozaNorte,
      '2026-11-20T12:00:00-06:00',
      30,
      'Control cardiológico vespertino',
      INITIAL_APPOINTMENTS,
      INITIAL_GRANTS,
      nowIso,
    )
    assert.equal(validSlot.allowed, true)

    assert.equal(canTransitionAppointmentStatus('PROGRAMADA', 'CONFIRMADA').allowed, true)
    expectDenied(
      canTransitionAppointmentStatus('COMPLETADA', 'PROGRAMADA'),
      'INVALID_APPOINTMENT_TRANSITION',
    )
  })

  it('CU-19 + PC-04: Bloqueo por ámbito, bloqueo tras REVISADA y adenda append-only', () => {
    expectDenied(
      canCreatePreparation(auxNorte, tenantNorte, pat0102, rec0102, INITIAL_GRANTS, nowIso),
      'OUT_OF_PREPARATION_SCOPE',
    )

    const prepPending = INITIAL_PREPARATIONS[0]
    assert.equal(canEditPreparation(auxNorte, prepPending).allowed, true)

    const prepReviewed: PreliminaryPreparation = {
      ...prepPending,
      status: 'REVISADA',
      reviewedByName: mendozaNorte.fullName,
      reviewedAtGmt6: '2026-11-19T09:15:00-06:00',
    }
    expectDenied(canEditPreparation(auxNorte, prepReviewed), 'PREPARATION_LOCKED_REVISADA')

    assert.equal(
      canAppendPreparationAddendum(
        auxNorte,
        tenantNorte,
        pat0101,
        rec0101,
        prepReviewed,
        'Rectificación de peso',
        'Paciente se pesó con abrigo',
        INITIAL_GRANTS,
        nowIso,
      ).allowed,
      true,
    )
  })

  it('CU-03 + PC-04: Permite finalizar atención con nota en BORRADOR y protege borradores ajenos', () => {
    const openEncounter: ClinicalEncounter = {
      ...INITIAL_ENCOUNTERS[1],
      id: 'enc-open-test',
      encounterStatus: 'EN_CURSO',
      endedAtGmt6: null,
      noteStatus: 'BORRADOR',
    }
    assert.equal(
      canFinalizeEncounter(
        mendozaNorte,
        tenantNorte,
        pat0101,
        rec0101,
        openEncounter,
        '2026-11-19T10:45:00-06:00',
        INITIAL_GRANTS,
        nowIso,
      ).allowed,
      true,
    )

    const foreignDraft = INITIAL_ENCOUNTERS.find((e) => e.id === 'enc-0101-2')!
    expectDenied(
      canEditOrCloseNote(salazarNorte, foreignDraft, 'EDIT', 'Intento ajeno'),
      'FORBIDDEN_OTHER_AUTHOR_DRAFT',
    )

    const closedNote = INITIAL_ENCOUNTERS.find((e) => e.id === 'enc-0101-1')!
    expectDenied(
      canEditOrCloseNote(mendozaNorte, closedNote, 'EDIT', 'Edición directa tras cierre'),
      'NOTE_ALREADY_CLOSED',
    )

    assert.equal(
      canAppendClosedNoteAddendum(
        mendozaNorte,
        tenantNorte,
        pat0101,
        rec0101,
        closedNote,
        'Aclaración de frecuencia cardíaca',
        'Pulso en reposo medido a los 10 minutos: 70 lpm',
        INITIAL_GRANTS,
        nowIso,
      ).allowed,
      true,
    )
  })

  it('CU-04: Valida formato PDF exclusivo, límite 10 MB y bloqueo de AdminClinica / fuera de ámbito', () => {
    expectDenied(
      canUploadStudyPdf(
        adminNorte,
        tenantNorte,
        pat0101,
        rec0101,
        'estudio.pdf',
        'application/pdf',
        120,
        INITIAL_GRANTS,
        nowIso,
      ),
      'FORBIDDEN_STUDY_ROLE',
    )

    expectDenied(
      canUploadStudyPdf(
        auxNorte,
        tenantNorte,
        pat0101,
        rec0101,
        'laboratorio.txt',
        'text/plain',
        20,
        INITIAL_GRANTS,
        nowIso,
      ),
      'INVALID_PDF_FORMAT',
    )

    expectDenied(
      canUploadStudyPdf(
        auxNorte,
        tenantNorte,
        pat0102,
        rec0102,
        'perfil.pdf',
        'application/pdf',
        180,
        INITIAL_GRANTS,
        nowIso,
      ),
      'FORBIDDEN_STUDY_UPLOAD',
    )

    assert.equal(
      canUploadStudyPdf(
        auxNorte,
        tenantNorte,
        pat0101,
        rec0101,
        'biometria.pdf',
        'application/pdf',
        340,
        INITIAL_GRANTS,
        nowIso,
      ).allowed,
      true,
    )
  })

  it('CU-07 + CU-14: Exige atribución profesional al emitir y motivo obligatorio al anular', () => {
    const draftWithoutAttribution: Prescription = {
      ...INITIAL_PRESCRIPTIONS[0],
      id: 'rx-draft-salazar',
      status: 'BORRADOR',
      authorAccountId: salazarNorte.id,
      authorName: salazarNorte.fullName,
      authorLicenseCode: null,
      issuedAtGmt6: null,
    }
    expectDenied(
      canIssuePrescription(
        salazarNorte,
        tenantNorte,
        pat0102,
        rec0102,
        draftWithoutAttribution,
        draftWithoutAttribution.items,
        INITIAL_GRANTS,
        nowIso,
      ),
      'PRESCRIPTION_PERMISSION_REQUIRED',
    )

    const draftMendoza: Prescription = {
      ...INITIAL_PRESCRIPTIONS[0],
      id: 'rx-draft-mendoza',
      status: 'BORRADOR',
      issuedAtGmt6: null,
    }
    assert.equal(
      canIssuePrescription(
        mendozaNorte,
        tenantNorte,
        pat0101,
        rec0101,
        draftMendoza,
        draftMendoza.items,
        INITIAL_GRANTS,
        nowIso,
      ).allowed,
      true,
    )

    const issuedRx = INITIAL_PRESCRIPTIONS[0]
    expectDenied(
      canCancelPrescription(mendozaNorte, tenantNorte, pat0101, rec0101, issuedRx, '', INITIAL_GRANTS, nowIso),
      'CANCELLATION_REASON_REQUIRED',
    )
    assert.equal(
      canCancelPrescription(
        mendozaNorte,
        tenantNorte,
        pat0101,
        rec0101,
        issuedRx,
        'Ajuste de dosis por intolerancia gástrica',
        INITIAL_GRANTS,
        nowIso,
      ).allowed,
      true,
    )
  })
})
