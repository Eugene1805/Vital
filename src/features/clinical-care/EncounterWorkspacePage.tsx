import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { formatDateTimeGmt6, nowGmt6Iso } from '../../design-system/gmt6.ts'
import { LockIcon, RxIcon } from '../../design-system/Icons.tsx'
import { ModalDialog } from '../../design-system/ModalDialog.tsx'
import { StatusBadge, type BadgeTone } from '../../design-system/StatusBadge.tsx'
import type { Prescription, PrescriptionItem } from '../../domain/types.ts'
import { evaluateObjectAccess } from '../../guards/objectAccess.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'

function rxTone(status: Prescription['status']): BadgeTone {
  switch (status) {
    case 'BORRADOR':
      return 'warning'
    case 'EMITIDA':
      return 'positive'
    case 'ANULADA':
      return 'critical'
  }
}

function EncounterWorkspaceInner({
  recordIdParam,
  encounterId,
}: {
  recordIdParam: string | undefined
  encounterId: string | undefined
}) {
  const navigate = useNavigate()

  const {
    currentUser,
    currentTenant,
    patients,
    records,
    grants,
    appointments,
    preparations,
    encounters,
    prescriptions,
    startEncounter,
    incorporatePreparation,
    saveEncounterDraft,
    finalizeEncounter,
    closeEncounterNote,
    appendClosedNoteAddendum,
    addEncounterIndication,
    createPrescriptionDraft,
    updatePrescriptionDraft,
    issuePrescription,
    issueDirectPrescription,
    cancelPrescription,
  } = useMockStore()

  const existingEncounter = encounterId
    ? encounters.find((e) => e.id === encounterId && e.recordId === recordIdParam)
    : undefined

  const [selectedAppointmentId, setSelectedAppointmentId] = useState('')
  const [chiefComplaint, setChiefComplaint] = useState(
    existingEncounter?.chiefComplaint ?? '',
  )
  const [noteContent, setNoteContent] = useState(existingEncounter?.noteContent ?? '')
  const [banner, setBanner] = useState<{ tone: 'positive' | 'critical'; text: string } | null>(null)

  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)
  const [addendumReason, setAddendumReason] = useState('')
  const [addendumDetail, setAddendumDetail] = useState('')

  const [indKind, setIndKind] = useState<'INDICACION_GENERAL' | 'SOLICITUD_ESTUDIO'>(
    'INDICACION_GENERAL',
  )
  const [indText, setIndText] = useState('')

  const [editingRxId, setEditingRxId] = useState<string | null>(null)
  const [rxMedication, setRxMedication] = useState('')
  const [rxDose, setRxDose] = useState('')
  const [rxFrequency, setRxFrequency] = useState('')
  const [rxDuration, setRxDuration] = useState('')
  const [rxInstructions, setRxInstructions] = useState('')
  const [rxError, setRxError] = useState<string | null>(null)

  const [previewRx, setPreviewRx] = useState<Prescription | null>(null)
  const [cancelTargetRx, setCancelTargetRx] = useState<Prescription | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)

  if (!currentUser || !currentTenant) return null

  const nowIso = nowGmt6Iso()
  const record = records.find((r) => r.id === recordIdParam && r.tenantId === currentTenant.id)
  const patient = record ? patients.find((p) => p.id === record.patientId) : undefined

  const access = evaluateObjectAccess({
    actor: currentUser,
    tenant: currentTenant,
    patient,
    record,
    operation: 'CLINICAL_RECORD_READ',
    grants,
    nowIsoGmt6: nowIso,
  })

  if (!access.allowed || !record || !patient) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-300 bg-surface p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-critical-bg p-2 text-critical-ink">
            <LockIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-mono text-xs font-semibold text-critical-ink">
              CONTROL TRANSVERSAL CU-10 ({access.allowed ? 'NOT_FOUND' : access.code})
            </p>
            <h1 className="mt-1 text-xl font-bold text-ink">Acceso denegado a la atención clínica</h1>
            <p className="mt-2 text-sm text-ink-muted">
              {access.allowed ? 'Expediente no encontrado.' : access.message}
            </p>
            <Link
              to="/clinical/records"
              className="mt-4 inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 text-sm font-semibold text-white"
            >
              Volver a mis expedientes
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // CU-03 A4: Si otro especialista intenta abrir un borrador ajeno, denegar lectura.
  if (
    existingEncounter &&
    existingEncounter.noteStatus === 'BORRADOR' &&
    existingEncounter.specialistId !== currentUser.id
  ) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-300 bg-surface p-6">
        <h1 className="text-xl font-bold text-ink">Borrador privado de otro especialista (CU-03 A4)</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Una nota en estado BORRADOR solo es visible para su autor hasta su cierre explícito.
        </p>
        <Link
          to={`/clinical/records/${record.id}`}
          className="mt-4 inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 text-sm font-semibold text-white"
        >
          Volver al Espacio Clínico
        </Link>
      </div>
    )
  }

  const patientAppointments = appointments.filter(
    (a) =>
      a.tenantId === currentTenant.id &&
      a.patientId === patient.id &&
      (a.status === 'PROGRAMADA' || a.status === 'CONFIRMADA' || a.status === 'EN_CURSO'),
  )

  const pendingPreps = preparations.filter(
    (p) => p.recordId === record.id && p.status === 'PENDIENTE_REVISION',
  )
  const linkedPreps = existingEncounter
    ? preparations.filter((p) => existingEncounter.linkedPreparationIds.includes(p.id))
    : []

  const encounterPrescriptions = existingEncounter
    ? prescriptions.filter((rx) => rx.encounterId === existingEncounter.id)
    : []

  const handleStartEncounter = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBanner(null)
    const res = startEncounter({
      recordId: record.id,
      appointmentId: selectedAppointmentId || null,
      chiefComplaint,
    })
    if (!res.allowed) {
      setBanner({ tone: 'critical', text: res.message })
      return
    }
    navigate(`/clinical/records/${record.id}/encounters/${res.encounterId}`, { replace: true })
  }

  const handleSaveDraft = () => {
    if (!existingEncounter) return
    const res = saveEncounterDraft(existingEncounter.id, chiefComplaint, noteContent)
    setBanner(
      res.allowed
        ? {
            tone: 'positive',
            text: 'Borrador guardado (CU-03). Guardar no cierra la nota ni finaliza la atención.',
          }
        : { tone: 'critical', text: res.message },
    )
  }

  const handleFinalizeEncounter = () => {
    if (!existingEncounter) return
    const res = finalizeEncounter(existingEncounter.id)
    setBanner(
      res.allowed
        ? {
            tone: 'positive',
            text: 'Atención finalizada en GMT-6 (CU-03). La nota puede permanecer en borrador o cerrarse aparte.',
          }
        : { tone: 'critical', text: res.message },
    )
  }

  const handleConfirmCloseNote = () => {
    if (!existingEncounter) return
    const res = closeEncounterNote(existingEncounter.id, noteContent)
    setConfirmCloseOpen(false)
    setBanner(
      res.allowed
        ? {
            tone: 'positive',
            text: 'Nota clínica CERRADA explícitamente. Otros tratantes autorizados ya pueden consultarla.',
          }
        : { tone: 'critical', text: res.message },
    )
  }

  const handleAddNoteAddendum = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!existingEncounter) return
    const res = appendClosedNoteAddendum(existingEncounter.id, addendumReason, addendumDetail)
    if (!res.allowed) {
      setBanner({ tone: 'critical', text: res.message })
      return
    }
    setAddendumReason('')
    setAddendumDetail('')
    setBanner({
      tone: 'positive',
      text: 'Adenda append-only agregada a la nota cerrada conservando el texto original (PC-04).',
    })
  }

  const handleAddIndication = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!existingEncounter) return
    const res = addEncounterIndication(existingEncounter.id, indKind, indText)
    if (!res.allowed) {
      setBanner({ tone: 'critical', text: res.message })
      return
    }
    setIndText('')
    setBanner({
      tone: 'positive',
      text: 'Indicación clínica registrada (separada de receta farmacológica CU-07).',
    })
  }

  const loadDraftIntoRxForm = (rx: Prescription) => {
    const first = rx.items[0]
    setEditingRxId(rx.id)
    setRxMedication(first?.medication ?? '')
    setRxDose(first?.dose ?? '')
    setRxFrequency(first?.frequency ?? '')
    setRxDuration(first?.duration ?? '')
    setRxInstructions(rx.generalInstructions)
    setRxError(null)
  }

  const buildItemsFromForm = (): PrescriptionItem[] => [
    {
      id: 'item-1',
      medication: rxMedication.trim(),
      dose: rxDose.trim(),
      frequency: rxFrequency.trim(),
      duration: rxDuration.trim(),
    },
  ]

  const handleSaveRxDraft = () => {
    if (!existingEncounter) return
    setRxError(null)
    const items = buildItemsFromForm()
    if (editingRxId) {
      const res = updatePrescriptionDraft(editingRxId, items, rxInstructions)
      if (!res.allowed) {
        setRxError(res.message)
        return
      }
      setBanner({ tone: 'positive', text: 'Borrador de receta actualizado.' })
    } else {
      const res = createPrescriptionDraft(existingEncounter.id, items, rxInstructions)
      if (!res.allowed) {
        setRxError(res.message)
        return
      }
      setEditingRxId(res.prescriptionId)
      setBanner({ tone: 'positive', text: 'Borrador de receta creado (BORRADOR).' })
    }
  }

  const handleIssueRx = () => {
    if (!existingEncounter) return
    setRxError(null)
    const items = buildItemsFromForm()

    const issued = editingRxId
      ? issuePrescription(editingRxId, items, rxInstructions)
      : issueDirectPrescription(existingEncounter.id, items, rxInstructions)
    if (!issued.allowed) {
      setRxError(issued.message)
      return
    }
    setEditingRxId(null)
    setRxMedication('')
    setRxDose('')
    setRxFrequency('')
    setRxDuration('')
    setRxInstructions('')
    setBanner({
      tone: 'positive',
      text: 'Receta EMITIDA en GMT-6. Ya no permite edición ordinaria.',
    })
  }

  const handleCancelRxSubmit = (duplicateAsNewDraft: boolean) => {
    if (!cancelTargetRx) return
    setCancelError(null)
    const res = cancelPrescription(cancelTargetRx.id, cancelReason, duplicateAsNewDraft)
    if (!res.allowed) {
      setCancelError(res.message)
      return
    }
    const duplicatedId = res.duplicatedPrescriptionId
    const sourceRx = cancelTargetRx
    setCancelTargetRx(null)
    setCancelReason('')
    if (duplicatedId) {
      const first = sourceRx.items[0]
      setEditingRxId(duplicatedId)
      setRxMedication(first?.medication ?? '')
      setRxDose(first?.dose ?? '')
      setRxFrequency(first?.frequency ?? '')
      setRxDuration(first?.duration ?? '')
      setRxInstructions(sourceRx.generalInstructions)
      setRxError(null)
      setBanner({
        tone: 'positive',
        text: 'Receta original ANULADA con motivo y duplicada como nuevo BORRADOR editable (CU-07).',
      })
    } else {
      setBanner({ tone: 'positive', text: 'Receta original marcada como ANULADA.' })
    }
  }

  const isAuthor = existingEncounter?.specialistId === currentUser.id
  const canEditDraft = Boolean(
    existingEncounter && isAuthor && existingEncounter.noteStatus === 'BORRADOR',
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-divider pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-medium text-clinical">
            ATENCIÓN CLÍNICA · {patient.patientCode} ({patient.fullName})
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
            {existingEncounter ? 'Registro de atención y nota clínica' : 'Iniciar nueva atención clínica'}
          </h1>
          {existingEncounter ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge
                tone={existingEncounter.encounterStatus === 'FINALIZADA' ? 'positive' : 'info'}
                label={`Atención: ${existingEncounter.encounterStatus}`}
              />
              <StatusBadge
                tone={existingEncounter.noteStatus === 'CERRADA' ? 'positive' : 'warning'}
                label={`Nota: ${existingEncounter.noteStatus}`}
              />
            </div>
          ) : null}
        </div>
        <Link
          to={`/clinical/records/${record.id}`}
          className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-100"
        >
          Volver al Espacio Clínico
        </Link>
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

      {!existingEncounter ? (
        <form
          onSubmit={handleStartEncounter}
          className="mx-auto max-w-2xl space-y-4 rounded-lg border border-divider bg-surface p-6 text-sm"
        >
          <h2 className="text-lg font-bold text-ink">Contexto de inicio (CU-03)</h2>
          <p className="text-ink-muted">
            Puedes asociar una cita existente o iniciar la atención <strong>sin cita previa</strong>.
          </p>

          <div>
            <label htmlFor="enc-appointment" className="block font-semibold text-ink">
              Cita asociada (opcional)
            </label>
            <select
              id="enc-appointment"
              value={selectedAppointmentId}
              onChange={(e) => setSelectedAppointmentId(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
            >
              <option value="">Atención sin cita previa</option>
              {patientAppointments.map((apt) => (
                <option key={apt.id} value={apt.id}>
                  {formatDateTimeGmt6(apt.scheduledStartGmt6)} ({apt.status}) - {apt.reason}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="enc-chief-complaint" className="block font-semibold text-ink">
              Motivo de atención / inicio <span aria-hidden="true">*</span>
            </label>
            <input
              id="enc-chief-complaint"
              type="text"
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              required
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="Ej. Seguimiento de presión arterial y revisión de síntomas"
            />
          </div>

          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
          >
            Iniciar atención clínica
          </button>
        </form>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-6">
            {/* Nota de evolución y estado de atención */}
            <section className="space-y-4 rounded-lg border border-divider bg-surface p-5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-ink">Nota de evolución (CU-03)</h2>
                <span className="font-mono text-xs text-ink-muted">
                  Inicio: {formatDateTimeGmt6(existingEncounter.startedAtGmt6)}
                </span>
              </div>

              <div>
                <label htmlFor="enc-edit-complaint" className="block font-semibold text-ink">
                  Motivo de atención
                </label>
                <input
                  id="enc-edit-complaint"
                  type="text"
                  value={chiefComplaint}
                  disabled={!canEditDraft}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label htmlFor="enc-note-content" className="block font-semibold text-ink">
                  Contenido de la nota profesional
                </label>
                <textarea
                  id="enc-note-content"
                  rows={5}
                  value={noteContent}
                  disabled={!canEditDraft}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 disabled:bg-slate-100"
                  placeholder="Evolución, exploración clínica y valoración"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                {canEditDraft ? (
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink hover:bg-slate-100"
                  >
                    Guardar borrador
                  </button>
                ) : null}

                {isAuthor && existingEncounter.encounterStatus === 'EN_CURSO' ? (
                  <button
                    type="button"
                    onClick={handleFinalizeEncounter}
                    className="inline-flex min-h-11 items-center rounded-md bg-platform px-4 py-2 font-semibold text-white hover:bg-platform-hover"
                  >
                    Finalizar atención
                  </button>
                ) : null}

                {canEditDraft ? (
                  <button
                    type="button"
                    onClick={() => setConfirmCloseOpen(true)}
                    className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
                  >
                    Cerrar nota
                  </button>
                ) : null}
              </div>

              {existingEncounter.noteStatus === 'CERRADA' ? (
                <div className="space-y-3 border-t border-divider pt-4">
                  <p className="text-xs font-semibold text-positive-ink">
                    Nota cerrada el{' '}
                    {existingEncounter.noteClosedAtGmt6
                      ? formatDateTimeGmt6(existingEncounter.noteClosedAtGmt6)
                      : ''}
                    . Solo admite adendas append-only (PC-04).
                  </p>
                  <form onSubmit={handleAddNoteAddendum} className="space-y-2 rounded-md border border-divider bg-slate-50 p-3.5">
                    <p className="text-xs font-bold text-ink">Agregar adenda a nota cerrada (PC-04)</p>
                    <input
                      type="text"
                      value={addendumReason}
                      onChange={(e) => setAddendumReason(e.target.value)}
                      placeholder="Motivo de adenda"
                      aria-label="Motivo de adenda"
                      className="w-full rounded-md border px-3 py-2 text-sm"
                    />
                    <textarea
                      rows={2}
                      value={addendumDetail}
                      onChange={(e) => setAddendumDetail(e.target.value)}
                      placeholder="Aclaración o complemento clínico"
                      aria-label="Aclaración o complemento clínico"
                      className="w-full rounded-md border px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
                    >
                      Registrar adenda
                    </button>
                  </form>

                  {existingEncounter.noteAddenda.length > 0 ? (
                    <ul className="space-y-2">
                      {existingEncounter.noteAddenda.map((add) => (
                        <li key={add.id} className="rounded border border-slate-200 bg-slate-50 p-3 text-xs">
                          <p className="font-mono text-ink-muted">
                            {formatDateTimeGmt6(add.occurredAtGmt6)} ({add.authorName})
                          </p>
                          <p className="font-semibold text-ink">Motivo: {add.reason}</p>
                          <p className="text-ink-muted">{add.detail}</p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </section>

            {/* Indicaciones y solicitudes de estudio (CU-06) */}
            <section className="space-y-4 rounded-lg border border-divider bg-surface p-5 text-sm">
              <div>
                <h2 className="text-lg font-bold text-ink">
                  Indicaciones y solicitud de estudios (CU-06)
                </h2>
                <p className="text-xs text-ink-muted">
                  Las solicitudes de estudio se documentan aquí como indicaciones clínicas (no son recetas farmacológicas ni órdenes formales).
                </p>
              </div>

              <form onSubmit={handleAddIndication} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
                  <div>
                    <label htmlFor="ind-kind" className="block text-xs font-semibold text-ink">
                      Tipo
                    </label>
                    <select
                      id="ind-kind"
                      value={indKind}
                      onChange={(e) =>
                        setIndKind(e.target.value as 'INDICACION_GENERAL' | 'SOLICITUD_ESTUDIO')
                      }
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    >
                      <option value="INDICACION_GENERAL">Indicación general</option>
                      <option value="SOLICITUD_ESTUDIO">Solicitud de estudio</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ind-text" className="block text-xs font-semibold text-ink">
                      Detalle de la indicación
                    </label>
                    <input
                      id="ind-text"
                      type="text"
                      value={indText}
                      onChange={(e) => setIndText(e.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="Ej. Solicitar biometría hemática y perfil lipídico en ayuno"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-slate-100"
                >
                  Agregar indicación
                </button>
              </form>

              {existingEncounter.indications.length > 0 ? (
                <ul className="space-y-2">
                  {existingEncounter.indications.map((ind) => (
                    <li key={ind.id} className="rounded border border-divider bg-slate-50 p-3 text-xs">
                      <span className="font-mono font-semibold text-clinical">{ind.kind}</span>
                      <p className="mt-1 text-sm text-ink">{ind.text}</p>
                      <p className="mt-1 text-ink-muted">
                        {ind.authorName} · {formatDateTimeGmt6(ind.createdAtGmt6)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            {/* Receta farmacológica formal (CU-07) */}
            <section className="space-y-4 rounded-lg border border-divider bg-surface p-5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-ink">Receta farmacológica (CU-07)</h2>
                <StatusBadge
                  tone={
                    currentUser.permissions.canPrescribe && currentUser.professionalAttribution
                      ? 'positive'
                      : 'warning'
                  }
                  icon={<RxIcon className="h-3.5 w-3.5 shrink-0" />}
                  label={
                    currentUser.permissions.canPrescribe && currentUser.professionalAttribution
                      ? `Habilitado (${currentUser.professionalAttribution.licenseCode})`
                      : 'Sin permiso de emisión (CU-14)'
                  }
                />
              </div>

              <div className="space-y-3 rounded-md border border-divider bg-slate-50 p-4">
                <p className="text-xs font-bold text-ink">
                  {editingRxId ? 'Editando borrador de receta' : 'Nuevo borrador de receta'}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="rx-med" className="block text-xs font-semibold text-ink">
                      Medicamento y presentación
                    </label>
                    <input
                      id="rx-med"
                      type="text"
                      value={rxMedication}
                      onChange={(e) => setRxMedication(e.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="Ej. Metformina 850 mg"
                    />
                  </div>
                  <div>
                    <label htmlFor="rx-dose" className="block text-xs font-semibold text-ink">
                      Dosis
                    </label>
                    <input
                      id="rx-dose"
                      type="text"
                      value={rxDose}
                      onChange={(e) => setRxDose(e.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="1 tableta"
                    />
                  </div>
                  <div>
                    <label htmlFor="rx-freq" className="block text-xs font-semibold text-ink">
                      Frecuencia
                    </label>
                    <input
                      id="rx-freq"
                      type="text"
                      value={rxFrequency}
                      onChange={(e) => setRxFrequency(e.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="Cada 12 horas"
                    />
                  </div>
                  <div>
                    <label htmlFor="rx-dur" className="block text-xs font-semibold text-ink">
                      Duración
                    </label>
                    <input
                      id="rx-dur"
                      type="text"
                      value={rxDuration}
                      onChange={(e) => setRxDuration(e.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="30 días"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="rx-inst" className="block text-xs font-semibold text-ink">
                    Indicaciones de receta
                  </label>
                  <input
                    id="rx-inst"
                    type="text"
                    value={rxInstructions}
                    onChange={(e) => setRxInstructions(e.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="Tomar junto con alimentos"
                  />
                </div>
                {rxError ? (
                  <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-xs font-medium text-critical-ink">
                    {rxError}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSaveRxDraft}
                    className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-slate-100"
                  >
                    Guardar borrador de receta
                  </button>
                  <button
                    type="button"
                    onClick={handleIssueRx}
                    className="inline-flex min-h-11 items-center rounded-md bg-clinical px-3.5 py-2 text-xs font-semibold text-white hover:bg-clinical-hover"
                  >
                    Emitir receta
                  </button>
                </div>
              </div>

              {encounterPrescriptions.length > 0 ? (
                <ul className="space-y-3">
                  {encounterPrescriptions.map((rx) => (
                    <li key={rx.id} className="rounded-md border border-divider p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-ink">{rx.folio}</span>
                          <StatusBadge tone={rxTone(rx.status)} label={rx.status} />
                        </div>
                        <span className="font-mono text-xs text-ink-muted">
                          {formatDateTimeGmt6(rx.issuedAtGmt6 ?? rx.updatedAtGmt6)}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1 text-xs text-ink">
                        {rx.items.map((item) => (
                          <li key={item.id}>
                            <strong>{item.medication}</strong>: {item.dose}, {item.frequency} durante{' '}
                            {item.duration}.
                          </li>
                        ))}
                      </ul>
                      {rx.status === 'ANULADA' ? (
                        <p className="mt-2 rounded bg-critical-bg px-2.5 py-1.5 text-xs font-medium text-critical-ink">
                          Receta ANULADA ({rx.cancelledAtGmt6 ? formatDateTimeGmt6(rx.cancelledAtGmt6) : ''}):{' '}
                          {rx.cancellationReason}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {rx.status === 'BORRADOR' && rx.authorAccountId === currentUser.id ? (
                          <button
                            type="button"
                            onClick={() => loadDraftIntoRxForm(rx)}
                            className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink"
                          >
                            Cargar borrador en editor
                          </button>
                        ) : null}
                        {rx.status === 'EMITIDA' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setPreviewRx(rx)}
                              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
                            >
                              Vista previa HTML imprimible
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCancelTargetRx(rx)
                                setCancelReason('')
                                setCancelError(null)
                              }}
                              className="inline-flex min-h-11 items-center rounded-md border border-red-700 bg-surface px-3 py-1.5 text-xs font-semibold text-critical-ink hover:bg-red-50"
                            >
                              Anular / Duplicar
                            </button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          </div>

          {/* Panel lateral: Preparaciones preliminares CU-19 */}
          <aside className="space-y-4">
            <section className="rounded-lg border border-divider bg-surface p-4 text-sm">
              <h2 className="text-base font-bold text-ink">
                Preparación preliminar pendiente (CU-19)
              </h2>
              <p className="mt-1 text-xs text-ink-muted">
                Al incorporarla a la atención cambia automáticamente a REVISADA y queda bloqueada para edición libre.
              </p>

              {pendingPreps.length === 0 ? (
                <p className="mt-3 rounded bg-slate-50 p-3 text-xs text-ink-muted">
                  Sin preparaciones `PENDIENTE_REVISION` en este expediente.
                </p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {pendingPreps.map((prep) => (
                    <li key={prep.id} className="rounded border border-amber-300 bg-warning-bg p-3 text-xs">
                      <p className="font-mono font-semibold text-warning-ink">
                        {formatDateTimeGmt6(prep.recordedAtGmt6)}
                      </p>
                      <p className="mt-1 text-ink">
                        Peso {prep.vitals.weightKg} kg | Temp {prep.vitals.temperatureC} °C | TA{' '}
                        {prep.vitals.bloodPressure}
                      </p>
                      {prep.declaredAllergies ? (
                        <p className="mt-1 text-ink">Alergias: {prep.declaredAllergies}</p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          const res = incorporatePreparation(existingEncounter.id, prep.id)
                          setBanner(
                            res.allowed
                              ? {
                                  tone: 'positive',
                                  text: 'Preparación incorporada y marcada como REVISADA (inmutable).',
                                }
                              : { tone: 'critical', text: res.message },
                          )
                        }}
                        className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-clinical px-3 py-1.5 font-semibold text-white hover:bg-clinical-hover"
                      >
                        Incorporar y marcar REVISADA
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {linkedPreps.length > 0 ? (
                <div className="mt-4 border-t border-divider pt-3">
                  <p className="text-xs font-bold text-ink">
                    Preparaciones revisadas en esta atención ({linkedPreps.length})
                  </p>
                  <ul className="mt-2 space-y-2">
                    {linkedPreps.map((prep) => (
                      <li key={prep.id} className="rounded border border-divider bg-slate-50 p-2.5 text-xs">
                        <StatusBadge tone="positive" label="REVISADA" />
                        <p className="mt-1 font-mono text-ink">
                          Peso {prep.vitals.weightKg} kg | Temp {prep.vitals.temperatureC} °C | TA{' '}
                          {prep.vitals.bloodPressure}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          </aside>
        </div>
      )}

      {/* Modal confirmar cierre explícito de nota */}
      <ModalDialog
        open={confirmCloseOpen}
        title="Confirmar cierre explícito de nota (CU-03)"
        description="Una vez cerrada, otros especialistas autorizados podrán consultarla y no permitirá edición libre."
        onClose={() => setConfirmCloseOpen(false)}
      >
        <div className="space-y-4 text-sm">
          <p className="text-ink-muted">
            Si aún no terminas de redactar, cancela y usa <strong>Guardar borrador</strong>.
          </p>
          <div className="flex justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setConfirmCloseOpen(false)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
            >
              Seguir en borrador
            </button>
            <button
              type="button"
              onClick={handleConfirmCloseNote}
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
            >
              Confirmar cierre de nota
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* Modal Vista previa HTML imprimible (CU-07) */}
      <ModalDialog
        open={Boolean(previewRx)}
        title="Plantilla HTML de receta farmacológica (CU-07)"
        description={previewRx ? `Folio ${previewRx.folio}` : undefined}
        onClose={() => setPreviewRx(null)}
      >
        {previewRx ? (
          <div className="space-y-4 text-sm">
            <div className="print-prescription-sheet rounded-md border border-divider bg-white p-5">
              <div className="flex flex-wrap justify-between gap-3 border-b border-divider pb-3">
                <div>
                  <p className="font-display text-lg font-bold text-ink">{currentTenant.name}</p>
                  <p className="text-xs text-ink-muted">
                    {previewRx.authorName} ({previewRx.authorSpecialty})
                  </p>
                  <p className="font-mono text-xs text-ink-muted">
                    Atribución: {previewRx.authorLicenseCode ?? 'N/D'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-bold text-ink">{previewRx.folio}</p>
                  <p className="font-mono text-xs text-ink-muted">
                    {previewRx.issuedAtGmt6 ? formatDateTimeGmt6(previewRx.issuedAtGmt6) : ''}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-ink-muted">
                Paciente: <strong className="text-ink">{patient.fullName}</strong> (
                <span className="font-mono">{patient.patientCode}</span>)
              </p>
              <ul className="mt-4 space-y-2 border-y border-divider py-3">
                {previewRx.items.map((item) => (
                  <li key={item.id}>
                    <p className="font-bold text-ink">{item.medication}</p>
                    <p className="text-xs text-ink-muted">
                      Dosis: {item.dose} | Frecuencia: {item.frequency} | Duración: {item.duration}
                    </p>
                  </li>
                ))}
              </ul>
              {previewRx.generalInstructions ? (
                <p className="mt-3 text-xs text-ink">
                  <strong>Indicaciones:</strong> {previewRx.generalInstructions}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
              >
                Imprimir receta (HTML)
              </button>
            </div>
          </div>
        ) : null}
      </ModalDialog>

      {/* Modal Anular / Anular y duplicar como nuevo borrador (CU-07) */}
      <ModalDialog
        open={Boolean(cancelTargetRx)}
        title="Anular receta emitida (CU-07)"
        description={cancelTargetRx ? `Folio ${cancelTargetRx.folio}` : undefined}
        onClose={() => setCancelTargetRx(null)}
      >
        <div className="space-y-4 text-sm">
          <p className="text-ink-muted">
            La receta original quedará conservada en estado <strong>ANULADA</strong> con aviso
            visible. Puedes duplicar su contenido como nuevo borrador para corregirlo sin recapturar.
          </p>
          <div>
            <label htmlFor="rx-cancel-reason" className="block font-semibold text-ink">
              Motivo obligatorio de anulación <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="rx-cancel-reason"
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              required
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="Ej. Ajuste de dosis por tolerancia del paciente"
            />
          </div>
          {cancelError ? (
            <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-critical-ink">
              {cancelError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setCancelTargetRx(null)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => handleCancelRxSubmit(false)}
              className="inline-flex min-h-11 items-center rounded-md border border-red-700 bg-surface px-4 py-2 font-semibold text-critical-ink hover:bg-red-50"
            >
              Solo anular
            </button>
            <button
              type="button"
              onClick={() => handleCancelRxSubmit(true)}
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
            >
              Anular y duplicar como nuevo borrador
            </button>
          </div>
        </div>
      </ModalDialog>
    </div>
  )
}

export function EncounterWorkspacePage() {
  const { id, encounterId } = useParams<{ id: string; encounterId?: string }>()
  return (
    <EncounterWorkspaceInner
      key={`${id ?? 'none'}:${encounterId ?? 'new'}`}
      recordIdParam={id}
      encounterId={encounterId}
    />
  )
}
