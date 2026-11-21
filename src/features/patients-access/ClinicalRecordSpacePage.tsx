import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { formatDateGmt6, formatDateTimeGmt6, nowGmt6Iso } from '../../design-system/gmt6.ts'
import { LockIcon, RxIcon } from '../../design-system/Icons.tsx'
import { ModalDialog } from '../../design-system/ModalDialog.tsx'
import { StatusBadge, type BadgeTone } from '../../design-system/StatusBadge.tsx'
import type {
  ClinicalHistoryCategory,
  ClinicalHistoryEntry,
  ClinicalStudyDocument,
  HistoryProvenance,
  Prescription,
} from '../../domain/types.ts'
import { evaluateObjectAccess } from '../../guards/objectAccess.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'

type ClinicalTabKey = 'history' | 'encounters' | 'clinical-history' | 'studies-rx'

const CLINICAL_TABS: Array<{ key: ClinicalTabKey; label: string }> = [
  { key: 'history', label: 'Historial cronológico (CU-08)' },
  { key: 'encounters', label: 'Atención y notas (CU-03)' },
  { key: 'clinical-history', label: 'Historia clínica (CU-05)' },
  { key: 'studies-rx', label: 'Estudios y recetas (CU-04 / CU-07)' },
]

function provenanceLabel(provenance: HistoryProvenance): { label: string; tone: BadgeTone } {
  switch (provenance) {
    case 'DECLARADO_PACIENTE':
      return { label: 'Declarado por paciente', tone: 'warning' }
    case 'CAPTURADO_AUXILIAR':
      return { label: 'Capturado por auxiliar', tone: 'info' }
    case 'REGISTRO_PROFESIONAL':
      return { label: 'Registro profesional', tone: 'positive' }
  }
}

function rxStatusTone(status: Prescription['status']): BadgeTone {
  switch (status) {
    case 'BORRADOR':
      return 'warning'
    case 'EMITIDA':
      return 'positive'
    case 'ANULADA':
      return 'critical'
  }
}

export function ClinicalRecordSpacePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    currentUser,
    currentTenant,
    patients,
    records,
    grants,
    preparations,
    encounters,
    historyEntries,
    studies,
    prescriptions,
    addClinicalHistoryEntry,
    appendClinicalHistoryAddendum,
    uploadStudyPdf,
    cancelPrescription,
  } = useMockStore()

  const [activeTab, setActiveTab] = useState<ClinicalTabKey>('history')
  const [specialtyFilter, setSpecialtyFilter] = useState('ALL')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const [banner, setBanner] = useState<{ tone: 'positive' | 'critical'; text: string } | null>(null)

  const [histCategory, setHistCategory] = useState<ClinicalHistoryCategory>('ANTECEDENTE')
  const [histProvenance, setHistProvenance] = useState<HistoryProvenance>('REGISTRO_PROFESIONAL')
  const [histDescription, setHistDescription] = useState('')
  const [addendumEntry, setAddendumEntry] = useState<ClinicalHistoryEntry | null>(null)
  const [addendumReason, setAddendumReason] = useState('')
  const [addendumDetail, setAddendumDetail] = useState('')
  const [addendumError, setAddendumError] = useState<string | null>(null)

  const [studyTitle, setStudyTitle] = useState('')
  const [studyFileName, setStudyFileName] = useState('')
  const [studyMimeType, setStudyMimeType] = useState('')
  const [studySizeKb, setStudySizeKb] = useState(0)
  const [studyNote, setStudyNote] = useState('')
  const [studyError, setStudyError] = useState<string | null>(null)
  const [previewStudy, setPreviewStudy] = useState<ClinicalStudyDocument | null>(null)

  const [previewRx, setPreviewRx] = useState<Prescription | null>(null)
  const [cancelTargetRx, setCancelTargetRx] = useState<Prescription | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)

  if (!currentUser || !currentTenant) return null

  const nowIso = nowGmt6Iso()
  const record = records.find((r) => r.id === id && r.tenantId === currentTenant.id)
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
            <h1 className="mt-1 text-xl font-bold text-ink">
              Acceso denegado al Espacio Clínico del Expediente
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              {access.allowed ? 'Expediente no localizado dentro de esta clínica.' : access.message}
            </p>
            <div className="mt-5">
              <Link
                to={
                  currentUser.role === 'ESPECIALISTA' ? '/clinical/records' : '/admin/patients'
                }
                className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 text-sm font-semibold text-white hover:bg-clinical-hover"
              >
                Volver a mi espacio autorizado
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const isPrimary = record.primarySpecialistId === currentUser.id

  const recordEncounters = encounters
    .filter((enc) => enc.recordId === record.id && enc.tenantId === currentTenant.id)
    .sort((a, b) => b.startedAtGmt6.localeCompare(a.startedAtGmt6))

  const closedEncounters = recordEncounters.filter((enc) => enc.noteStatus === 'CERRADA')
  const ownDraftEncounters = recordEncounters.filter(
    (enc) => enc.noteStatus === 'BORRADOR' && enc.specialistId === currentUser.id,
  )
  const accessibleEncounters = recordEncounters.filter(
    (enc) => enc.noteStatus === 'CERRADA' || enc.specialistId === currentUser.id,
  )

  const specialties = Array.from(new Set(closedEncounters.map((n) => n.specialty)))
  const visibleClosedEncounters = closedEncounters.filter(
    (n) => specialtyFilter === 'ALL' || n.specialty === specialtyFilter,
  )

  const pendingPreps = preparations.filter(
    (p) => p.recordId === record.id && p.status === 'PENDIENTE_REVISION',
  )

  const recordHistoryEntries = historyEntries
    .filter((h) => h.recordId === record.id && h.tenantId === currentTenant.id)
    .sort((a, b) => b.recordedAtGmt6.localeCompare(a.recordedAtGmt6))

  const recordStudies = studies
    .filter((s) => s.recordId === record.id && s.tenantId === currentTenant.id)
    .sort((a, b) => b.uploadedAtGmt6.localeCompare(a.uploadedAtGmt6))

  const recordPrescriptions = prescriptions
    .filter(
      (rx) =>
        rx.recordId === record.id &&
        rx.tenantId === currentTenant.id &&
        (rx.status === 'EMITIDA' ||
          rx.status === 'ANULADA' ||
          rx.authorAccountId === currentUser.id),
    )
    .sort((a, b) => b.createdAtGmt6.localeCompare(a.createdAtGmt6))

  const handleTabKeyDown = (index: number, e: KeyboardEvent<HTMLButtonElement>) => {
    let nextIndex: number | null = null
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % CLINICAL_TABS.length
    else if (e.key === 'ArrowLeft')
      nextIndex = (index - 1 + CLINICAL_TABS.length) % CLINICAL_TABS.length
    else if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = CLINICAL_TABS.length - 1

    if (nextIndex !== null) {
      e.preventDefault()
      const nextTab = CLINICAL_TABS[nextIndex]
      setActiveTab(nextTab.key)
      tabRefs.current[nextIndex]?.focus()
    }
  }

  const handleAddHistoryEntry = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const res = addClinicalHistoryEntry(record.id, histCategory, histDescription, histProvenance)
    if (!res.allowed) {
      setBanner({ tone: 'critical', text: res.message })
      return
    }
    setHistDescription('')
    setBanner({
      tone: 'positive',
      text: 'Registro agregado a la historia clínica común (CU-05).',
    })
  }

  const handleHistoryAddendumSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!addendumEntry) return
    setAddendumError(null)
    const res = appendClinicalHistoryAddendum(addendumEntry.id, addendumReason, addendumDetail)
    if (!res.allowed) {
      setAddendumError(res.message)
      return
    }
    setAddendumEntry(null)
    setAddendumReason('')
    setAddendumDetail('')
    setBanner({
      tone: 'positive',
      text: 'Adenda append-only registrada en historia clínica conservando la entrada original (PC-04).',
    })
  }

  const handleUploadStudySubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setStudyError(null)
    const res = uploadStudyPdf({
      patientId: patient.id,
      recordId: record.id,
      encounterId: null,
      title: studyTitle,
      fileName: studyFileName,
      mimeType: studyMimeType,
      fileSizeKb: studySizeKb,
      previewNote: studyNote,
    })
    if (!res.allowed) {
      setStudyError(res.message)
      return
    }
    setStudyTitle('')
    setStudyFileName('')
    setStudyMimeType('')
    setStudySizeKb(0)
    setStudyNote('')
    setBanner({ tone: 'positive', text: 'Estudio PDF cargado al expediente clínico (CU-04).' })
  }

  const handleCancelRxSubmit = (duplicateAsNewDraft: boolean) => {
    if (!cancelTargetRx) return
    setCancelError(null)
    const res = cancelPrescription(cancelTargetRx.id, cancelReason, duplicateAsNewDraft)
    if (!res.allowed) {
      setCancelError(res.message)
      return
    }
    const encounterTarget = cancelTargetRx.encounterId
    setCancelTargetRx(null)
    setCancelReason('')
    if (res.duplicatedPrescriptionId) {
      navigate(`/clinical/records/${record.id}/encounters/${encounterTarget}`)
      return
    }
    setBanner({ tone: 'positive', text: 'Receta ANULADA con motivo trazable (CU-07).' })
  }

  return (
    <div className="space-y-6">
      {/* Cabecera fija de seguridad clínica del paciente */}
      <section
        aria-label="Seguridad clínica del paciente"
        className="rounded-lg border border-teal-700/30 bg-surface p-5 shadow-sm"
      >
        <div className="flex flex-col gap-3 border-b border-divider pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-xs font-semibold text-clinical">
              ESPACIO CLÍNICO DEL EXPEDIENTE ({patient.patientCode})
            </p>
            <h1 className="mt-1 text-2xl font-bold text-ink">{patient.fullName}</h1>
            <p className="mt-0.5 font-mono text-xs text-ink-muted">
              Nacimiento: {formatDateGmt6(patient.birthDateGmt6)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              tone={isPrimary ? 'positive' : 'info'}
              label={isPrimary ? 'Responsable principal' : 'Tratante adicional'}
            />
            <Link
              to={`/clinical/records/${record.id}/encounters/new`}
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-3.5 py-2 text-xs font-semibold text-white hover:bg-clinical-hover"
            >
              Iniciar atención (CU-03)
            </Link>
            <Link
              to="/clinical/records"
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-slate-100"
            >
              Mis expedientes
            </Link>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-red-200 bg-critical-bg/50 p-3">
            <p className="text-xs font-bold text-critical-ink">Alergias y alertas críticas</p>
            <p className="mt-1 text-sm font-medium text-ink">
              {record.criticalAllergies.join(' · ')}
            </p>
          </div>
          <div className="rounded-md border border-divider bg-slate-50 p-3">
            <p className="text-xs font-bold text-ink">Condiciones conocidas</p>
            <p className="mt-1 text-sm text-ink-muted">
              {record.chronicConditions.length > 0
                ? record.chronicConditions.join(' · ')
                : 'Sin condiciones crónicas registradas'}
            </p>
          </div>
        </div>
      </section>

      {banner ? (
        <div
          role={banner.tone === 'critical' ? 'alert' : 'status'}
          className={`flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm font-medium ${
            banner.tone === 'critical'
              ? 'border-red-300 bg-critical-bg text-critical-ink'
              : 'border-green-300 bg-positive-bg text-positive-ink'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-xs font-bold underline"
          >
            Ocultar
          </button>
        </div>
      ) : null}

      {/* Tabs accesibles siguiendo modern-web-guidance (tabs) */}
      <div className="rounded-lg border border-divider bg-surface">
        <div
          role="tablist"
          aria-label="Secciones del Espacio Clínico"
          className="vital-tablist px-2 pt-2"
        >
          {CLINICAL_TABS.map((tab, index) => {
            const selected = activeTab === tab.key
            return (
              <button
                key={tab.key}
                ref={(el) => {
                  tabRefs.current[index] = el
                }}
                type="button"
                role="tab"
                id={`tab-${tab.key}`}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.key)}
                onKeyDown={(e) => handleTabKeyDown(index, e)}
                className="vital-tab"
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* TAB 1: CU-08 Historial cronológico de notas cerradas */}
        <div
          role="tabpanel"
          aria-labelledby="tab-history"
          hidden={activeTab !== 'history'}
          tabIndex={activeTab === 'history' ? 0 : undefined}
        >
          <div className="space-y-4 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-ink">
                  Historial cronológico de notas cerradas (CU-08)
                </h2>
                <p className="text-xs text-ink-muted">
                  Los especialistas con vínculo vigente consultan notas cerradas de otras especialidades en modo solo lectura. Los borradores ajenos permanecen ocultos.
                </p>
              </div>
              <div>
                <label
                  htmlFor="history-specialty-filter"
                  className="block text-xs font-semibold text-ink"
                >
                  Agrupar / filtrar especialidad
                </label>
                <select
                  id="history-specialty-filter"
                  value={specialtyFilter}
                  onChange={(e) => setSpecialtyFilter(e.target.value)}
                  className="mt-1 rounded-md border px-3 py-2 text-sm"
                >
                  <option value="ALL">Todas las especialidades</option>
                  {specialties.map((spec) => (
                    <option key={spec} value={spec}>
                      {spec}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {ownDraftEncounters.length > 0 ? (
              <div className="rounded-md border border-amber-300 bg-warning-bg p-3.5 text-sm text-warning-ink">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold">
                      Tus borradores privados abiertos ({ownDraftEncounters.length})
                    </p>
                    <p className="mt-0.5 text-xs">
                      Solo tú puedes ver estos borradores hasta ejecutar Cierre explícito (CU-03):
                    </p>
                    <p className="mt-1.5 text-xs font-medium text-ink">
                      {ownDraftEncounters[0].chiefComplaint}
                    </p>
                  </div>
                  <Link
                    to={`/clinical/records/${record.id}/encounters/${ownDraftEncounters[0].id}`}
                    className="inline-flex min-h-11 items-center rounded-md border border-amber-700 bg-surface px-3 py-1.5 text-xs font-semibold text-warning-ink hover:bg-amber-50"
                  >
                    Retomar borrador
                  </Link>
                </div>
              </div>
            ) : null}

            {visibleClosedEncounters.length === 0 ? (
              <p className="rounded-md border border-divider bg-slate-50 p-4 text-sm text-ink-muted">
                No existen notas cerradas registradas en este expediente para el filtro actual.
              </p>
            ) : (
              <ol className="space-y-3">
                {visibleClosedEncounters.map((enc) => (
                  <li key={enc.id} className="rounded-md border border-divider bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone="positive" label="CERRADA (Solo lectura)" />
                        <span className="text-sm font-bold text-ink">{enc.specialty}</span>
                        <span className="font-mono text-xs text-ink-muted">
                          {enc.chiefComplaint}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-ink-muted">
                        {formatDateTimeGmt6(enc.noteClosedAtGmt6 ?? enc.startedAtGmt6)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{enc.noteContent}</p>
                    {enc.indications.length > 0 ? (
                      <div className="mt-3 rounded-md border border-divider bg-surface p-2.5 text-xs">
                        <p className="font-bold text-ink">
                          Indicaciones registradas ({enc.indications.length}):
                        </p>
                        <ul className="mt-1 space-y-1 text-ink-muted">
                          {enc.indications.map((ind) => (
                            <li key={ind.id}>
                              <strong>{ind.kind}:</strong> {ind.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {enc.noteAddenda.length > 0 ? (
                      <div className="mt-3 rounded-md border border-blue-200 bg-info-bg/40 p-2.5 text-xs">
                        <p className="font-bold text-info-ink">
                          Adendas append-only ({enc.noteAddenda.length})
                        </p>
                        <ul className="mt-1 space-y-1">
                          {enc.noteAddenda.map((ad) => (
                            <li key={ad.id}>
                              <strong>{ad.reason}:</strong> {ad.detail} ({ad.authorName},{' '}
                              {formatDateTimeGmt6(ad.occurredAtGmt6)})
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-ink-muted">Autoría: {enc.specialistName}</p>
                      <Link
                        to={`/clinical/records/${record.id}/encounters/${enc.id}`}
                        className="text-xs font-semibold text-clinical hover:underline"
                      >
                        Abrir detalle / Agregar adenda (PC-04)
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* TAB 2: CU-03 Atenciones clínicas y notas abiertas */}
        <div
          role="tabpanel"
          aria-labelledby="tab-encounters"
          hidden={activeTab !== 'encounters'}
          tabIndex={activeTab === 'encounters' ? 0 : undefined}
        >
          <div className="space-y-4 p-5 text-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-ink">
                  Atenciones clínicas y notas abiertas (CU-03)
                </h2>
                <p className="text-xs text-ink-muted">
                  El estado operativo de la atención (`EN_CURSO` / `FINALIZADA`) es independiente del estado documental de la nota (`BORRADOR` / `CERRADA`).
                </p>
              </div>
              <Link
                to={`/clinical/records/${record.id}/encounters/new`}
                className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 text-xs font-semibold text-white hover:bg-clinical-hover"
              >
                Iniciar nueva atención
              </Link>
            </div>

            {pendingPreps.length > 0 ? (
              <div className="rounded-md border border-blue-300 bg-info-bg p-3 text-xs text-info-ink">
                Existen <strong>{pendingPreps.length}</strong> preparaciones preliminares en estado{' '}
                <strong>PENDIENTE_REVISION</strong> listas para incorporarse desde el espacio de atención (CU-19).
              </div>
            ) : null}

            {accessibleEncounters.length === 0 ? (
              <p className="rounded-md border border-divider bg-slate-50 p-4 text-ink-muted">
                No hay atenciones clínicas visibles para tu cuenta en este expediente.
              </p>
            ) : (
              <ul className="space-y-3">
                {accessibleEncounters.map((enc) => (
                  <li key={enc.id} className="rounded-md border border-divider bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-ink">{enc.chiefComplaint}</p>
                        <p className="text-xs text-ink-muted">
                          {enc.specialistName} · {enc.specialty} · Inicio:{' '}
                          {formatDateTimeGmt6(enc.startedAtGmt6)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          tone={enc.encounterStatus === 'FINALIZADA' ? 'positive' : 'warning'}
                          label={`Atención: ${enc.encounterStatus}`}
                        />
                        <StatusBadge
                          tone={enc.noteStatus === 'CERRADA' ? 'positive' : 'info'}
                          label={`Nota: ${enc.noteStatus}`}
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Link
                        to={`/clinical/records/${record.id}/encounters/${enc.id}`}
                        className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-slate-100"
                      >
                        Abrir atención
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* TAB 3: CU-05 Historia clínica general común + PC-04 Adendas */}
        <div
          role="tabpanel"
          aria-labelledby="tab-clinical-history"
          hidden={activeTab !== 'clinical-history'}
          tabIndex={activeTab === 'clinical-history' ? 0 : undefined}
        >
          <div className="space-y-5 p-5 text-sm">
            <div>
              <h2 className="text-lg font-bold text-ink">
                Historia clínica general común (CU-05 · PC-04)
              </h2>
              <p className="text-xs text-ink-muted">
                Alergias, antecedentes y condiciones comunes diferenciando su origen (declarado por paciente, capturado por auxiliar o registro profesional). Las rectificaciones se registran como adenda append-only.
              </p>
            </div>

            <form
              onSubmit={handleAddHistoryEntry}
              className="grid gap-3 rounded-md border border-divider bg-slate-50 p-4 sm:grid-cols-3"
            >
              <div>
                <label htmlFor="hist-cat" className="block text-xs font-semibold text-ink">
                  Categoría
                </label>
                <select
                  id="hist-cat"
                  value={histCategory}
                  onChange={(e) => setHistCategory(e.target.value as ClinicalHistoryCategory)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="ALERGIA">ALERGIA</option>
                  <option value="ANTECEDENTE">ANTECEDENTE</option>
                  <option value="CONDICION">CONDICION</option>
                </select>
              </div>
              <div>
                <label htmlFor="hist-prov" className="block text-xs font-semibold text-ink">
                  Procedencia del dato
                </label>
                <select
                  id="hist-prov"
                  value={histProvenance}
                  onChange={(e) => setHistProvenance(e.target.value as HistoryProvenance)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="REGISTRO_PROFESIONAL">Registro profesional</option>
                  <option value="DECLARADO_PACIENTE">Declarado por paciente</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <label htmlFor="hist-desc" className="block text-xs font-semibold text-ink">
                  Descripción clínica
                </label>
                <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="hist-desc"
                    type="text"
                    value={histDescription}
                    onChange={(e) => setHistDescription(e.target.value)}
                    required
                    className="flex-1 rounded-md border px-3 py-2"
                    placeholder="Ej. Antecedente heredofamiliar de diabetes mellitus tipo 2"
                  />
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 text-xs font-semibold text-white hover:bg-clinical-hover"
                  >
                    Agregar entrada
                  </button>
                </div>
              </div>
            </form>

            {recordHistoryEntries.length === 0 ? (
              <p className="rounded-md border border-divider bg-slate-50 p-4 text-ink-muted">
                Sin entradas detalladas aún en historia clínica.
              </p>
            ) : (
              <ul className="space-y-3">
                {recordHistoryEntries.map((entry) => {
                  const prov = provenanceLabel(entry.provenance)
                  return (
                    <li
                      key={entry.id}
                      className="rounded-md border border-divider bg-slate-50 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-ink">
                            {entry.category}
                          </span>
                          <StatusBadge tone={prov.tone} label={prov.label} />
                        </div>
                        <span className="font-mono text-xs text-ink-muted">
                          {formatDateTimeGmt6(entry.recordedAtGmt6)}
                        </span>
                      </div>
                      <p className="mt-2 font-medium text-ink">{entry.description}</p>
                      <p className="mt-1 text-xs text-ink-muted">
                        Registrado por: {entry.authorName}
                      </p>

                      {entry.addenda.length > 0 ? (
                        <div className="mt-3 rounded-md border border-blue-200 bg-info-bg/40 p-2.5 text-xs">
                          <p className="font-bold text-info-ink">
                            Adendas append-only ({entry.addenda.length})
                          </p>
                          <ul className="mt-1 space-y-1">
                            {entry.addenda.map((ad) => (
                              <li key={ad.id}>
                                <strong>{ad.reason}:</strong> {ad.detail} ({ad.authorName},{' '}
                                {formatDateTimeGmt6(ad.occurredAtGmt6)})
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setAddendumEntry(entry)
                            setAddendumReason('')
                            setAddendumDetail('')
                            setAddendumError(null)
                          }}
                          className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
                        >
                          Agregar adenda (PC-04)
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* TAB 4: CU-04 Estudios PDF y CU-07 Recetas */}
        <div
          role="tabpanel"
          aria-labelledby="tab-studies-rx"
          hidden={activeTab !== 'studies-rx'}
          tabIndex={activeTab === 'studies-rx' ? 0 : undefined}
        >
          <div className="space-y-6 p-5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-ink">
                Estudios PDF y recetas farmacológicas (CU-04 / CU-07)
              </h2>
              <StatusBadge
                tone={currentUser.permissions.canPrescribe ? 'positive' : 'warning'}
                icon={<RxIcon className="h-3.5 w-3.5 shrink-0" />}
                label={
                  currentUser.permissions.canPrescribe
                    ? 'Prescripción habilitada'
                    : 'Sin permiso de prescripción'
                }
              />
            </div>

            {/* Bloque CU-04: Carga y listado de estudios PDF */}
            <section className="space-y-4 rounded-md border border-divider bg-slate-50 p-4">
              <h3 className="text-base font-bold text-ink">Estudios diagnósticos en PDF (CU-04)</h3>
              <form onSubmit={handleUploadStudySubmit} className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="clin-study-title" className="block text-xs font-semibold text-ink">
                    Título del estudio
                  </label>
                  <input
                    id="clin-study-title"
                    type="text"
                    value={studyTitle}
                    onChange={(e) => setStudyTitle(e.target.value)}
                    required
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    placeholder="Ej. Ecocardiograma Doppler"
                  />
                </div>
                <div>
                  <label htmlFor="clin-study-file" className="block text-xs font-semibold text-ink">
                    Archivo PDF (máx. 10 MB)
                  </label>
                  <input
                    id="clin-study-file"
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
                </div>
                <div>
                  <label htmlFor="clin-study-note" className="block text-xs font-semibold text-ink">
                    Resumen / nota del estudio
                  </label>
                  <input
                    id="clin-study-note"
                    type="text"
                    value={studyNote}
                    onChange={(e) => setStudyNote(e.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    placeholder="Hallazgos clave o laboratorio"
                  />
                </div>
                {studyError ? (
                  <p
                    role="alert"
                    className="sm:col-span-3 rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-xs text-critical-ink"
                  >
                    {studyError}
                  </p>
                ) : null}
                <div className="sm:col-span-3 flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 text-xs font-semibold text-white hover:bg-clinical-hover"
                  >
                    Cargar estudio PDF
                  </button>
                </div>
              </form>

              {recordStudies.length === 0 ? (
                <p className="text-xs text-ink-muted">Sin estudios PDF adjuntos en este expediente.</p>
              ) : (
                <ul className="space-y-2">
                  {recordStudies.map((study) => (
                    <li
                      key={study.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-divider bg-surface p-3"
                    >
                      <div>
                        <p className="font-semibold text-ink">{study.title}</p>
                        <p className="font-mono text-xs text-ink-muted">
                          {study.fileName} ({study.fileSizeKb} KB) · Subido por{' '}
                          {study.uploadedByName} ({formatDateTimeGmt6(study.uploadedAtGmt6)})
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewStudy(study)}
                        className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
                      >
                        Vista previa PDF
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Bloque CU-07: Recetas del expediente */}
            <section className="space-y-3 rounded-md border border-divider bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-bold text-ink">
                  Recetas farmacológicas del expediente (CU-07)
                </h3>
                <Link
                  to={`/clinical/records/${record.id}/encounters/new`}
                  className="text-xs font-semibold text-clinical hover:underline"
                >
                  Emitir nueva receta desde una atención
                </Link>
              </div>

              {recordPrescriptions.length === 0 ? (
                <p className="text-xs text-ink-muted">
                  Sin recetas emitidas o borradores propios registrados en este expediente.
                </p>
              ) : (
                <ul className="space-y-3">
                  {recordPrescriptions.map((rx) => (
                    <li key={rx.id} className="rounded-md border border-divider bg-surface p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-mono text-xs font-bold text-ink">{rx.folio}</p>
                          <p className="text-xs text-ink-muted">
                            {rx.authorName} ({rx.authorSpecialty})
                            {rx.authorLicenseCode ? ` · Cédula: ${rx.authorLicenseCode}` : ''}
                          </p>
                        </div>
                        <StatusBadge tone={rxStatusTone(rx.status)} label={rx.status} />
                      </div>
                      <ul className="mt-2 space-y-1 text-xs text-ink">
                        {rx.items.map((item) => (
                          <li key={item.id}>
                            <strong>{item.medication}</strong> {item.dose}, {item.frequency} durante{' '}
                            {item.duration}
                          </li>
                        ))}
                      </ul>
                      {rx.status === 'ANULADA' && rx.cancellationReason ? (
                        <p className="mt-2 rounded bg-critical-bg px-2.5 py-1.5 text-xs text-critical-ink">
                          Motivo de anulación: {rx.cancellationReason}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          to={`/clinical/records/${record.id}/encounters/${rx.encounterId}`}
                          className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
                        >
                          Abrir atención asociada
                        </Link>
                        {rx.status !== 'BORRADOR' ? (
                          <button
                            type="button"
                            onClick={() => setPreviewRx(rx)}
                            className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
                          >
                            Vista previa / Imprimir
                          </button>
                        ) : null}
                        {rx.status === 'EMITIDA' ? (
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
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* Modal adenda PC-04 en historia clínica */}
      <ModalDialog
        open={Boolean(addendumEntry)}
        title="Agregar adenda a historia clínica (PC-04)"
        description="Preserva intacto el registro original y anexa la aclaración o rectificación con marca temporal GMT-6."
        onClose={() => setAddendumEntry(null)}
      >
        <form onSubmit={handleHistoryAddendumSubmit} className="space-y-4 text-sm">
          <div>
            <label htmlFor="hist-addendum-reason" className="block font-semibold text-ink">
              Motivo de la adenda
            </label>
            <input
              id="hist-addendum-reason"
              type="text"
              value={addendumReason}
              onChange={(e) => setAddendumReason(e.target.value)}
              required
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="Ej. Confirmación diagnóstica con estudio reciente"
            />
          </div>
          <div>
            <label htmlFor="hist-addendum-detail" className="block font-semibold text-ink">
              Detalle adicional
            </label>
            <textarea
              id="hist-addendum-detail"
              rows={3}
              value={addendumDetail}
              onChange={(e) => setAddendumDetail(e.target.value)}
              required
              className="mt-1 w-full rounded-md border px-3 py-2"
            />
          </div>
          {addendumError ? (
            <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-critical-ink">
              {addendumError}
            </p>
          ) : null}
          <div className="flex justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setAddendumEntry(null)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
            >
              Registrar adenda
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal vista previa metadatos PDF CU-04 */}
      <ModalDialog
        open={Boolean(previewStudy)}
        title={previewStudy?.title ?? 'Vista previa de estudio PDF'}
        description={
          previewStudy
            ? `${previewStudy.fileName} (${previewStudy.fileSizeKb} KB)`
            : undefined
        }
        onClose={() => setPreviewStudy(null)}
      >
        {previewStudy ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border border-divider bg-slate-50 p-4">
              <p className="font-mono text-xs text-ink-muted">
                MIME: {previewStudy.mimeType} · Fecha GMT-6:{' '}
                {formatDateTimeGmt6(previewStudy.uploadedAtGmt6)}
              </p>
              <p className="mt-2 font-semibold text-ink">
                Cargado por: {previewStudy.uploadedByName} ({previewStudy.uploadedByRole})
              </p>
              <p className="mt-2 text-ink">
                {previewStudy.previewNote || 'Documento PDF disponible para visualización clínica.'}
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewStudy(null)}
                className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white"
              >
                Cerrar vista previa
              </button>
            </div>
          </div>
        ) : null}
      </ModalDialog>

      {/* Modal vista previa / impresión receta CU-07 */}
      <ModalDialog
        open={Boolean(previewRx)}
        title={`Receta médica ${previewRx?.folio ?? ''}`}
        description="Formato imprimible HTML en moneda/tiempo GMT-6."
        onClose={() => setPreviewRx(null)}
      >
        {previewRx ? (
          <div className="space-y-4 text-sm">
            <div className="print-prescription-sheet rounded-md border border-divider bg-surface p-5">
              <div className="flex items-start justify-between border-b border-divider pb-3">
                <div>
                  <p className="text-lg font-bold text-ink">{currentTenant.name}</p>
                  <p className="text-xs text-ink-muted">
                    {previewRx.authorName} · {previewRx.authorSpecialty}
                  </p>
                  <p className="font-mono text-xs text-ink-muted">
                    Atribución: {previewRx.authorLicenseCode ?? 'Sin cédula'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs font-bold text-ink">{previewRx.folio}</p>
                  <p className="font-mono text-xs text-ink-muted">
                    {formatDateTimeGmt6(previewRx.issuedAtGmt6 ?? previewRx.createdAtGmt6)}
                  </p>
                  <p className="mt-1 font-mono text-xs font-bold text-ink">{previewRx.status}</p>
                </div>
              </div>
              <div className="mt-3 text-xs text-ink-muted">
                Paciente: <strong className="text-ink">{patient.fullName}</strong> (
                {patient.patientCode})
              </div>
              <ul className="mt-4 space-y-2 border-t border-divider pt-3">
                {previewRx.items.map((item) => (
                  <li key={item.id}>
                    <p className="font-bold text-ink">
                      {item.medication} ({item.dose})
                    </p>
                    <p className="text-xs text-ink-muted">
                      Frecuencia: {item.frequency} · Duración: {item.duration}
                    </p>
                  </li>
                ))}
              </ul>
              {previewRx.generalInstructions ? (
                <p className="mt-3 border-t border-divider pt-3 text-xs text-ink">
                  Indicaciones: {previewRx.generalInstructions}
                </p>
              ) : null}
              {previewRx.status === 'ANULADA' && previewRx.cancellationReason ? (
                <p className="mt-3 rounded bg-critical-bg p-2 text-xs font-bold text-critical-ink">
                  ANULADA: {previewRx.cancellationReason}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-3 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink hover:bg-slate-100"
              >
                Imprimir
              </button>
              <button
                type="button"
                onClick={() => setPreviewRx(null)}
                className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : null}
      </ModalDialog>

      {/* Modal Anular / Duplicar receta CU-07 */}
      <ModalDialog
        open={Boolean(cancelTargetRx)}
        title={`Anular receta ${cancelTargetRx?.folio ?? ''}`}
        description="Las recetas emitidas no se borran ni se editan libremente. Indica el motivo obligatorio de anulación."
        onClose={() => setCancelTargetRx(null)}
      >
        <div className="space-y-4 text-sm">
          <div>
            <label htmlFor="space-cancel-rx-reason" className="block font-semibold text-ink">
              Motivo de anulación (obligatorio)
            </label>
            <input
              id="space-cancel-rx-reason"
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="Ej. Corrección de dosis o ajuste terapéutico"
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
