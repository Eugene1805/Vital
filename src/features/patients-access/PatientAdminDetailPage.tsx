import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { formatDateGmt6, formatDateTimeGmt6, nowGmt6Iso } from '../../design-system/gmt6.ts'
import { LockIcon } from '../../design-system/Icons.tsx'
import { ModalDialog } from '../../design-system/ModalDialog.tsx'
import { StatusBadge } from '../../design-system/StatusBadge.tsx'
import { canCreatePreparation } from '../../guards/clinicalFlow.ts'
import {
  evaluateObjectAccess,
  getActiveGrantForOperation,
  isInAuxiliaryOrdinaryScope,
} from '../../guards/objectAccess.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'

type DetailModal =
  | { type: 'editAdmin' }
  | { type: 'assignInitial' }
  | { type: 'reassignPrimary' }
  | { type: 'addTreating' }
  | { type: 'uploadStudy' }
  | null

export function PatientAdminDetailPage() {
  const { id } = useParams<{ id: string }>()
  const {
    currentUser,
    currentTenant,
    patients,
    records,
    accounts,
    grants,
    studies,
    updatePatientAdminData,
    assignInitialPrimarySpecialist,
    reassignPrimarySpecialist,
    addTreatingSpecialist,
    removeTreatingSpecialist,
    uploadStudyPdf,
  } = useMockStore()

  const [modal, setModal] = useState<DetailModal>(null)
  const [banner, setBanner] = useState<{ tone: 'positive' | 'critical'; text: string } | null>(null)

  const [editName, setEditName] = useState('')
  const [editBirth, setEditBirth] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editEmergency, setEditEmergency] = useState('')
  const [modalError, setModalError] = useState<string | null>(null)

  const [selectedSpecialistId, setSelectedSpecialistId] = useState('')
  const [reassignNote, setReassignNote] = useState('')

  const [studyTitle, setStudyTitle] = useState('')
  const [studyFileName, setStudyFileName] = useState('')
  const [studyMimeType, setStudyMimeType] = useState('')
  const [studySizeKb, setStudySizeKb] = useState(0)
  const [studyNote, setStudyNote] = useState('')

  if (!currentUser || !currentTenant) return null

  const nowIso = nowGmt6Iso()
  const patient = patients.find((p) => p.id === id && p.tenantId === currentTenant.id)
  const record = patient ? records.find((r) => r.patientId === patient.id) : undefined

  const readAccess = evaluateObjectAccess({
    actor: currentUser,
    tenant: currentTenant,
    patient,
    record,
    operation: 'PATIENT_ADMIN_READ',
    grants,
    nowIsoGmt6: nowIso,
  })

  if (!readAccess.allowed || !patient || !record) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-300 bg-surface p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-critical-bg p-2 text-critical-ink">
            <LockIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-mono text-xs font-semibold text-critical-ink">
              CONTROL TRANSVERSAL CU-10 ({readAccess.allowed ? 'NOT_FOUND' : readAccess.code})
            </p>
            <h1 className="mt-1 text-xl font-bold text-ink">
              No es posible abrir la ficha administrativa
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              {readAccess.allowed
                ? 'Paciente no localizado dentro de esta clínica.'
                : readAccess.message}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to="/admin/patients"
                className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 text-sm font-semibold text-white hover:bg-clinical-hover"
              >
                Volver a Pacientes
              </Link>
              {currentUser.role === 'AUXILIAR' ? (
                <Link
                  to="/admin/exceptional-access"
                  className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-100"
                >
                  Solicitar acceso excepcional
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const canUpdateAdmin = evaluateObjectAccess({
    actor: currentUser,
    tenant: currentTenant,
    patient,
    record,
    operation: 'PATIENT_ADMIN_UPDATE',
    grants,
    nowIsoGmt6: nowIso,
  }).allowed

  const canAssignInitial = evaluateObjectAccess({
    actor: currentUser,
    tenant: currentTenant,
    patient,
    record,
    operation: 'RECORD_ASSIGN_INITIAL_PRIMARY',
    grants,
    nowIsoGmt6: nowIso,
  }).allowed

  const canReassignPrimary = evaluateObjectAccess({
    actor: currentUser,
    tenant: currentTenant,
    patient,
    record,
    operation: 'RECORD_REASSIGN_PRIMARY',
    grants,
    nowIsoGmt6: nowIso,
  }).allowed

  const canManageTreating = evaluateObjectAccess({
    actor: currentUser,
    tenant: currentTenant,
    patient,
    record,
    operation: 'RECORD_MANAGE_TREATING',
    grants,
    nowIsoGmt6: nowIso,
  }).allowed

  const canAuxPrepare = canCreatePreparation(
    currentUser,
    currentTenant,
    patient,
    record,
    grants,
    nowIso,
  ).allowed

  const canAuxUploadStudy =
    currentUser.role === 'AUXILIAR' &&
    ((isInAuxiliaryOrdinaryScope(currentUser, record) && currentUser.permissions.canUploadStudies) ||
      Boolean(
        getActiveGrantForOperation(currentUser, patient.id, 'UPLOAD_STUDY_PDF', grants, nowIso),
      ))

  const ownUploadedStudies = studies.filter(
    (s) => s.recordId === record.id && s.uploadedByAccountId === currentUser.id,
  )

  const activeSpecialists = accounts.filter(
    (a) => a.tenantId === currentTenant.id && a.role === 'ESPECIALISTA' && a.active,
  )

  const primarySpecialist = record.primarySpecialistId
    ? accounts.find((a) => a.id === record.primarySpecialistId)
    : undefined

  const treatingSpecialists = record.treatingSpecialistIds
    .map((specId) => accounts.find((a) => a.id === specId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  const availableForTreating = activeSpecialists.filter(
    (s) => s.id !== record.primarySpecialistId && !record.treatingSpecialistIds.includes(s.id),
  )

  const availableForReassign = activeSpecialists.filter((s) => s.id !== record.primarySpecialistId)

  const openEditAdminModal = () => {
    setEditName(patient.fullName)
    setEditBirth(patient.birthDateGmt6)
    setEditPhone(patient.phone)
    setEditEmail(patient.email ?? '')
    setEditEmergency(patient.emergencyContact ?? '')
    setModalError(null)
    setModal({ type: 'editAdmin' })
  }

  const handleEditAdminSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setModalError(null)
    const decision = updatePatientAdminData({
      patientId: patient.id,
      fullName: editName,
      birthDateGmt6: editBirth,
      phone: editPhone,
      email: editEmail,
      emergencyContact: editEmergency,
    })
    if (!decision.allowed) {
      setModalError(decision.message)
      return
    }
    setModal(null)
    setBanner({
      tone: 'positive',
      text: 'Datos administrativos actualizados sin modificar notas ni historia clínica.',
    })
  }

  const handleAssignInitialSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setModalError(null)
    const decision = assignInitialPrimarySpecialist(record.id, selectedSpecialistId)
    if (!decision.allowed) {
      setModalError(decision.message)
      return
    }
    setModal(null)
    setBanner({
      tone: 'positive',
      text: 'Responsable principal inicial asignado (CU-02). No se contabiliza como reasignación CU-24.',
    })
  }

  const handleReassignSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setModalError(null)
    const decision = reassignPrimarySpecialist(record.id, selectedSpecialistId, reassignNote)
    if (!decision.allowed) {
      setModalError(decision.message)
      return
    }
    setModal(null)
    setBanner({
      tone: 'positive',
      text: 'Responsable principal reasignado (CU-24 candidato). El titular anterior perdió el permiso derivado del vínculo previo.',
    })
  }

  const handleAddTreatingSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setModalError(null)
    const decision = addTreatingSpecialist(record.id, selectedSpecialistId)
    if (!decision.allowed) {
      setModalError(decision.message)
      return
    }
    setModal(null)
    setBanner({
      tone: 'positive',
      text: 'Especialista tratante adicional vinculado al expediente (CU-02 / PC-02).',
    })
  }

  const handleRemoveTreating = (specialistId: string) => {
    const decision = removeTreatingSpecialist(record.id, specialistId)
    if (!decision.allowed) {
      setBanner({ tone: 'critical', text: decision.message })
      return
    }
    setBanner({
      tone: 'positive',
      text: 'Especialista tratante desvinculado; la autoría de registros previos permanece intacta.',
    })
  }

  const openUploadStudyModal = () => {
    setStudyTitle('')
    setStudyFileName('')
    setStudyMimeType('')
    setStudySizeKb(0)
    setStudyNote('')
    setModalError(null)
    setModal({ type: 'uploadStudy' })
  }

  const handleUploadStudySubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setModalError(null)
    const decision = uploadStudyPdf({
      patientId: patient.id,
      recordId: record.id,
      encounterId: null,
      title: studyTitle,
      fileName: studyFileName,
      mimeType: studyMimeType,
      fileSizeKb: studySizeKb,
      previewNote: studyNote,
    })
    if (!decision.allowed) {
      setModalError(decision.message)
      return
    }
    setModal(null)
    setBanner({
      tone: 'positive',
      text: `Estudio PDF "${studyTitle || studyFileName}" cargado al expediente sin exponer el Espacio Clínico.`,
    })
  }

  const lookupSpecialistName = (specId: string | null) => {
    if (!specId) return 'Sin asignar'
    return accounts.find((a) => a.id === specId)?.fullName ?? specId
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-divider pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-medium text-clinical">
            FICHA ADMINISTRATIVA ({patient.patientCode})
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">{patient.fullName}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Vista separada del Espacio Clínico del Expediente. No muestra notas médicas, diagnósticos ni recetas.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/patients"
            className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-100"
          >
            Volver a Pacientes
          </Link>
          {currentTenant.usesBilling ? (
            <Link
              to="/admin/billing"
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-100"
            >
              Cargos y cobros (CU-20)
            </Link>
          ) : null}
          <Link
            to={`/clinical/records/${record.id}`}
            className="inline-flex min-h-11 items-center rounded-md border border-amber-700 bg-warning-bg px-3.5 py-2 text-xs font-semibold text-warning-ink hover:bg-amber-100"
          >
            Comprobar bloqueo Espacio Clínico (CU-10)
          </Link>
        </div>
      </div>

      {banner ? (
        <div
          role={banner.tone === 'critical' ? 'alert' : 'status'}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm font-medium ${
            banner.tone === 'critical'
              ? 'border-red-300 bg-critical-bg text-critical-ink'
              : 'border-green-300 bg-positive-bg text-positive-ink'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="min-h-11 rounded px-2 text-xs font-semibold underline"
          >
            Ocultar aviso
          </button>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Bloque 1: Datos demográficos */}
        <section className="rounded-lg border border-divider bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-ink">Datos administrativos</h2>
            {canUpdateAdmin ? (
              <button
                type="button"
                onClick={openEditAdminModal}
                className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
              >
                Editar datos
              </button>
            ) : null}
          </div>

          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-ink-muted">Código de paciente</dt>
              <dd className="font-mono font-semibold text-ink">{patient.patientCode}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-ink-muted">Fecha de nacimiento</dt>
              <dd className="font-mono font-semibold text-ink">
                {formatDateGmt6(patient.birthDateGmt6)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-ink-muted">Teléfono</dt>
              <dd className="font-mono font-semibold text-ink">{patient.phone}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-ink-muted">Correo</dt>
              <dd className="text-ink">{patient.email ?? 'No registrado'}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-ink-muted">Contacto de emergencia</dt>
              <dd className="text-ink">{patient.emergencyContact ?? 'No registrado'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Registrado por</dt>
              <dd className="text-right text-xs text-ink-muted">
                {patient.registeredByName} ({formatDateTimeGmt6(patient.createdAtGmt6)})
              </dd>
            </div>
          </dl>
        </section>

        {/* Bloque 2: Responsable principal del expediente */}
        <section className="rounded-lg border border-divider bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-ink">
              Responsable principal del expediente (CU-02 / CU-24)
            </h2>
            <StatusBadge
              tone={primarySpecialist ? 'positive' : 'warning'}
              label={primarySpecialist ? 'Asignado' : 'Pendiente de asignación'}
            />
          </div>

          {primarySpecialist ? (
            <div className="mt-4 space-y-3 rounded-md border border-divider bg-slate-50 p-4">
              <div>
                <p className="text-base font-bold text-ink">{primarySpecialist.fullName}</p>
                <p className="text-xs text-ink-muted">
                  Especialidad: {primarySpecialist.specialty ?? 'General'}
                </p>
              </div>
              {canReassignPrimary ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSpecialistId(availableForReassign[0]?.id ?? '')
                    setReassignNote('')
                    setModalError(null)
                    setModal({ type: 'reassignPrimary' })
                  }}
                  className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-slate-100"
                >
                  Reasignar responsable (CU-24 candidato)
                </button>
              ) : (
                <p className="text-xs text-ink-muted">
                  Solo AdminClinica puede reasignar al responsable principal vigente.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3 rounded-md border border-amber-300 bg-warning-bg p-4 text-sm text-warning-ink">
              <p>
                El expediente se creó automáticamente al registrar al paciente, pero aún no tiene un
                especialista responsable principal asignado.
              </p>
              {canAssignInitial ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSpecialistId(activeSpecialists[0]?.id ?? '')
                    setModalError(null)
                    setModal({ type: 'assignInitial' })
                  }}
                  className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 text-xs font-semibold text-white hover:bg-clinical-hover"
                >
                  Asignar responsable inicial (CU-02)
                </button>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {/* Bloque 3: Tratantes adicionales (CU-02 / PC-02) */}
      <section className="rounded-lg border border-divider bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">
              Especialistas tratantes adicionales (CU-02 · PC-02)
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Pueden consultar notas cerradas de otras especialidades en el Espacio Clínico sin cambiar al principal. Solo AdminClinica vincula o desvincula.
            </p>
          </div>
          {canManageTreating ? (
            <button
              type="button"
              onClick={() => {
                setSelectedSpecialistId(availableForTreating[0]?.id ?? '')
                setModalError(null)
                setModal({ type: 'addTreating' })
              }}
              disabled={availableForTreating.length === 0}
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-3.5 py-2 text-xs font-semibold text-white hover:bg-clinical-hover disabled:opacity-50"
            >
              Vincular tratante adicional
            </button>
          ) : null}
        </div>

        {treatingSpecialists.length === 0 ? (
          <p className="mt-4 rounded-md border border-divider bg-slate-50 p-3 text-sm text-ink-muted">
            No hay especialistas tratantes adicionales vinculados a este expediente.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200 rounded-md border border-divider">
            {treatingSpecialists.map((spec) => (
              <li
                key={spec.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-ink">{spec.fullName}</p>
                  <p className="text-xs text-ink-muted">{spec.specialty ?? 'General'}</p>
                </div>
                {canManageTreating ? (
                  <button
                    type="button"
                    onClick={() => handleRemoveTreating(spec.id)}
                    className="inline-flex min-h-11 items-center rounded-md border border-red-700 bg-surface px-3 py-1.5 text-xs font-semibold text-critical-ink hover:bg-red-50"
                  >
                    Desvincular tratante
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bloque 4: Historial administrativo de asignaciones */}
      <section className="rounded-lg border border-divider bg-surface p-5">
        <h2 className="text-lg font-bold text-ink">Historial de asignaciones del expediente (GMT-6)</h2>
        {record.assignmentHistory.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">
            Sin asignaciones registradas hasta el momento.
          </p>
        ) : (
          <ol className="mt-3 space-y-2.5">
            {record.assignmentHistory.map((evt) => (
              <li key={evt.id} className="rounded-md border border-divider bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-ink">{evt.type}</span>
                  <span className="font-mono text-xs text-ink-muted">
                    {formatDateTimeGmt6(evt.occurredAtGmt6)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink">
                  {evt.previousSpecialistId
                    ? `${lookupSpecialistName(evt.previousSpecialistId)} -> ${lookupSpecialistName(evt.nextSpecialistId)}`
                    : `Profesional: ${lookupSpecialistName(evt.nextSpecialistId)}`}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {evt.note} (Por: {evt.actorName})
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {currentUser.role === 'AUXILIAR' ? (
        <section className="rounded-lg border border-divider bg-surface p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink">
                Operación auxiliar autorizada (CU-19 · CU-04)
              </h2>
              <p className="text-xs text-ink-muted">
                Prepara al paciente y adjunta estudios en PDF dentro de tu ámbito u autorización excepcional, sin leer notas ni diagnósticos.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canAuxPrepare ? (
                <Link
                  to={`/admin/patients/${patient.id}/triage`}
                  className="inline-flex min-h-11 items-center rounded-md bg-clinical px-3.5 py-2 text-xs font-semibold text-white hover:bg-clinical-hover"
                >
                  Preparación preliminar (CU-19)
                </Link>
              ) : null}
              {canAuxUploadStudy ? (
                <button
                  type="button"
                  onClick={openUploadStudyModal}
                  className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-slate-100"
                >
                  Cargar estudio PDF (CU-04)
                </button>
              ) : null}
            </div>
          </div>

          {!canAuxPrepare && !canAuxUploadStudy ? (
            <p className="mt-3 rounded-md border border-divider bg-slate-50 p-3 text-xs text-ink-muted">
              Para preparar al paciente o cargar estudios PDF en esta ficha requieres ámbito ordinario vigente o permiso excepcional aprobado (`PREPARE_PATIENT` / `UPLOAD_STUDY_PDF`).
            </p>
          ) : null}

          {ownUploadedStudies.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                Estudios PDF cargados por ti ({ownUploadedStudies.length})
              </p>
              <ul className="mt-2 space-y-2">
                {ownUploadedStudies.map((study) => (
                  <li
                    key={study.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-divider bg-slate-50 px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-ink">{study.title}</p>
                      <p className="font-mono text-ink-muted">
                        {study.fileName} ({study.fileSizeKb} KB)
                      </p>
                    </div>
                    <span className="font-mono text-ink-muted">
                      {formatDateTimeGmt6(study.uploadedAtGmt6)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Modal edición administrativa */}
      <ModalDialog
        open={modal?.type === 'editAdmin'}
        title="Actualizar datos administrativos (CU-01)"
        description="Modifica contacto y datos generales sin alterar historia clínica ni notas."
        onClose={() => setModal(null)}
      >
        <form onSubmit={handleEditAdminSubmit} className="space-y-4 text-sm">
          <div>
            <label htmlFor="edit-pat-name" className="block font-semibold text-ink">
              Nombre completo
            </label>
            <input
              id="edit-pat-name"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
              className="mt-1 w-full rounded-md border px-3 py-2"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-pat-birth" className="block font-semibold text-ink">
                Fecha de nacimiento
              </label>
              <input
                id="edit-pat-birth"
                type="date"
                value={editBirth}
                onChange={(e) => setEditBirth(e.target.value)}
                required
                className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label htmlFor="edit-pat-phone" className="block font-semibold text-ink">
                Teléfono
              </label>
              <input
                id="edit-pat-phone"
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                required
                className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-pat-email" className="block font-semibold text-ink">
                Correo (opcional)
              </label>
              <input
                id="edit-pat-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="edit-pat-emerg" className="block font-semibold text-ink">
                Contacto de emergencia
              </label>
              <input
                id="edit-pat-emerg"
                type="text"
                value={editEmergency}
                onChange={(e) => setEditEmergency(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2"
              />
            </div>
          </div>
          {modalError ? (
            <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-critical-ink">
              {modalError}
            </p>
          ) : null}
          <div className="flex justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setModal(null)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
            >
              Guardar cambios
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal CU-02 asignación inicial */}
      <ModalDialog
        open={modal?.type === 'assignInitial'}
        title="Asignar responsable principal inicial (CU-02)"
        description="Completa la primera asignación del expediente. No constituye reasignación CU-24."
        onClose={() => setModal(null)}
      >
        <form onSubmit={handleAssignInitialSubmit} className="space-y-4 text-sm">
          <div>
            <label htmlFor="assign-initial-spec" className="block font-semibold text-ink">
              Especialista activo de la clínica
            </label>
            <select
              id="assign-initial-spec"
              value={selectedSpecialistId}
              onChange={(e) => setSelectedSpecialistId(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
            >
              {activeSpecialists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.specialty ?? 'General'})
                </option>
              ))}
            </select>
          </div>
          {modalError ? (
            <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-critical-ink">
              {modalError}
            </p>
          ) : null}
          <div className="flex justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setModal(null)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
            >
              Confirmar asignación inicial
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal CU-24 reasignar principal */}
      <ModalDialog
        open={modal?.type === 'reassignPrimary'}
        title="Reasignar responsable principal (CU-24 candidato)"
        description={`Responsable vigente: ${primarySpecialist?.fullName ?? ''}`}
        onClose={() => setModal(null)}
      >
        <form onSubmit={handleReassignSubmit} className="space-y-4 text-sm">
          <div className="rounded-md border border-amber-300 bg-warning-bg p-3 text-xs text-warning-ink">
            Al confirmar, el responsable anterior perderá el acceso clínico derivado de su condición
            de responsable principal (salvo si conserva otro vínculo vigente). Las notas y autorías
            históricas permanecerán intactas.
          </div>
          <div>
            <label htmlFor="reassign-spec" className="block font-semibold text-ink">
              Nuevo responsable principal
            </label>
            <select
              id="reassign-spec"
              value={selectedSpecialistId}
              onChange={(e) => setSelectedSpecialistId(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
            >
              {availableForReassign.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.specialty ?? 'General'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="reassign-note" className="block font-semibold text-ink">
              Motivo / nota administrativa
            </label>
            <input
              id="reassign-note"
              type="text"
              value={reassignNote}
              onChange={(e) => setReassignNote(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="Cambio de turno o cobertura de especialidad"
            />
          </div>
          {modalError ? (
            <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-critical-ink">
              {modalError}
            </p>
          ) : null}
          <div className="flex justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setModal(null)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
            >
              Confirmar reasignación
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal PC-02 vincular tratante adicional */}
      <ModalDialog
        open={modal?.type === 'addTreating'}
        title="Vincular especialista tratante adicional (CU-02 · PC-02)"
        description="Concede acceso clínico vigente como tratante adicional sin modificar al responsable principal."
        onClose={() => setModal(null)}
      >
        <form onSubmit={handleAddTreatingSubmit} className="space-y-4 text-sm">
          <div>
            <label htmlFor="add-treating-spec" className="block font-semibold text-ink">
              Especialista disponible en la clínica
            </label>
            <select
              id="add-treating-spec"
              value={selectedSpecialistId}
              onChange={(e) => setSelectedSpecialistId(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
            >
              {availableForTreating.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.specialty ?? 'General'})
                </option>
              ))}
            </select>
          </div>
          {modalError ? (
            <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-critical-ink">
              {modalError}
            </p>
          ) : null}
          <div className="flex justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setModal(null)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
            >
              Vincular tratante
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal CU-04 carga de estudio PDF desde ficha administrativa auxiliar */}
      <ModalDialog
        open={modal?.type === 'uploadStudy'}
        title="Cargar estudio diagnóstico en PDF (CU-04)"
        description="Solo formato PDF en el MVP. Los archivos quedan disponibles para lectura clínica dentro del expediente."
        onClose={() => setModal(null)}
      >
        <form onSubmit={handleUploadStudySubmit} className="space-y-4 text-sm">
          <div>
            <label htmlFor="admin-study-title" className="block font-semibold text-ink">
              Título o descripción del estudio
            </label>
            <input
              id="admin-study-title"
              type="text"
              value={studyTitle}
              onChange={(e) => setStudyTitle(e.target.value)}
              required
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="Ej. Biometría hemática de control"
            />
          </div>

          <div>
            <label htmlFor="admin-study-file" className="block font-semibold text-ink">
              Archivo PDF (máximo 10 MB)
            </label>
            <input
              id="admin-study-file"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setStudyFileName(file.name)
                setStudyMimeType(file.type)
                setStudySizeKb(Math.max(1, Math.round(file.size / 1024)))
                if (!studyTitle.trim()) {
                  setStudyTitle(file.name.replace(/\.[^/.]+$/, ''))
                }
              }}
              className="mt-1 block w-full rounded-md border border-slate-500 bg-surface px-3 py-2 text-xs text-ink"
            />
            {studyFileName ? (
              <p className="mt-1 font-mono text-xs text-ink-muted">
                Archivo seleccionado: {studyFileName} ({studySizeKb} KB)
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="admin-study-note" className="block font-semibold text-ink">
              Nota administrativa de recepción (opcional)
            </label>
            <input
              id="admin-study-note"
              type="text"
              value={studyNote}
              onChange={(e) => setStudyNote(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="Ej. Entregado por el paciente en recepción"
            />
          </div>

          {modalError ? (
            <p
              role="alert"
              className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-critical-ink"
            >
              {modalError}
            </p>
          ) : null}

          <div className="flex justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setModal(null)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
            >
              Subir estudio PDF
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  )
}
