import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { formatDateTimeGmt6, nowGmt6Iso } from '../../design-system/gmt6.ts'
import { LockIcon } from '../../design-system/Icons.tsx'
import { ModalDialog } from '../../design-system/ModalDialog.tsx'
import { StatusBadge } from '../../design-system/StatusBadge.tsx'
import type { PreliminaryPreparation } from '../../domain/types.ts'
import { canCreatePreparation } from '../../guards/clinicalFlow.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'

export function PatientTriagePage() {
  const { id } = useParams<{ id: string }>()
  const {
    currentUser,
    currentTenant,
    patients,
    records,
    grants,
    preparations,
    createPreparation,
    updatePreparation,
    appendPreparationAddendum,
  } = useMockStore()

  const [editingPrepId, setEditingPrepId] = useState<string | null>(null)
  const [declaredAllergies, setDeclaredAllergies] = useState('')
  const [declaredConditions, setDeclaredConditions] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [temperatureC, setTemperatureC] = useState('')
  const [bloodPressure, setBloodPressure] = useState('')
  const [heartRateBpm, setHeartRateBpm] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  const [addendumTarget, setAddendumTarget] = useState<PreliminaryPreparation | null>(null)
  const [addendumReason, setAddendumReason] = useState('')
  const [addendumDetail, setAddendumDetail] = useState('')
  const [addendumError, setAddendumError] = useState<string | null>(null)

  if (!currentUser || !currentTenant) return null

  const nowIso = nowGmt6Iso()
  const patient = patients.find((p) => p.id === id && p.tenantId === currentTenant.id)
  const record = patient ? records.find((r) => r.patientId === patient.id) : undefined

  const access = canCreatePreparation(
    currentUser,
    currentTenant,
    patient,
    record,
    grants,
    nowIso,
  )

  if (!access.allowed || !patient || !record) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-300 bg-surface p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-critical-bg p-2 text-critical-ink">
            <LockIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-mono text-xs font-semibold text-critical-ink">
              CONTROL CU-10 / CU-19 ({access.allowed ? 'NOT_FOUND' : access.code})
            </p>
            <h1 className="mt-1 text-xl font-bold text-ink">
              Sin autorización para preparación preliminar
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              {access.allowed ? 'Paciente no localizado.' : access.message}
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
                  className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-ink"
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

  const recordPreparations = preparations
    .filter((p) => p.recordId === record.id && p.tenantId === currentTenant.id)
    .sort((a, b) => b.recordedAtGmt6.localeCompare(a.recordedAtGmt6))

  const resetForm = () => {
    setEditingPrepId(null)
    setDeclaredAllergies('')
    setDeclaredConditions('')
    setWeightKg('')
    setHeightCm('')
    setTemperatureC('')
    setBloodPressure('')
    setHeartRateBpm('')
    setFormError(null)
  }

  const loadForEdit = (prep: PreliminaryPreparation) => {
    setEditingPrepId(prep.id)
    setDeclaredAllergies(prep.declaredAllergies)
    setDeclaredConditions(prep.declaredConditions)
    setWeightKg(prep.vitals.weightKg)
    setHeightCm(prep.vitals.heightCm)
    setTemperatureC(prep.vitals.temperatureC)
    setBloodPressure(prep.vitals.bloodPressure)
    setHeartRateBpm(prep.vitals.heartRateBpm)
    setFormError(null)
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)
    setBanner(null)

    if (
      !declaredAllergies.trim() &&
      !declaredConditions.trim() &&
      !weightKg.trim() &&
      !heightCm.trim() &&
      !temperatureC.trim() &&
      !bloodPressure.trim() &&
      !heartRateBpm.trim()
    ) {
      setFormError('Captura al menos una medición preliminar, alergia o antecedente declarado.')
      return
    }

    const payload = {
      patientId: patient.id,
      recordId: record.id,
      declaredAllergies,
      declaredConditions,
      vitals: { weightKg, heightCm, temperatureC, bloodPressure, heartRateBpm },
    }

    const decision = editingPrepId
      ? updatePreparation(editingPrepId, payload)
      : createPreparation(payload)

    if (!decision.allowed) {
      setFormError(decision.message)
      return
    }

    setBanner(
      editingPrepId
        ? 'Preparación preliminar actualizada (sigue en PENDIENTE_REVISION).'
        : 'Preparación preliminar anclada al expediente en estado PENDIENTE_REVISION (sin requerir cita previa).',
    )
    resetForm()
  }

  const handleAddendumSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!addendumTarget) return
    setAddendumError(null)
    const decision = appendPreparationAddendum(addendumTarget.id, addendumReason, addendumDetail)
    if (!decision.allowed) {
      setAddendumError(decision.message)
      return
    }
    setAddendumTarget(null)
    setBanner('Adenda append-only registrada conservando los valores revisados originales (PC-04).')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-divider pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-medium text-clinical">
            CU-19 · ANCLAJE A EXPEDIENTE ({patient.patientCode})
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
            Preparación preliminar de {patient.fullName}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Captura declarada anclada directo al expediente (`recordId`), operable con o sin cita previa (`encounterId = null` hasta iniciar atención en CU-03).
          </p>
        </div>
        <Link
          to={`/admin/patients/${patient.id}`}
          className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-100"
        >
          Volver a Ficha Administrativa
        </Link>
      </div>

      {banner ? (
        <div
          role="status"
          className="rounded-md border border-green-300 bg-positive-bg px-4 py-3 text-sm font-medium text-positive-ink"
        >
          {banner}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-4 rounded-lg border border-divider bg-surface p-5 text-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-ink">
              {editingPrepId ? 'Corregir preliminar pendiente' : 'Nueva captura preliminar declarada'}
            </h2>
            <StatusBadge tone="info" label="Declarado / Preliminar" />
          </div>

          <div>
            <label htmlFor="triage-allergies" className="block font-semibold text-ink">
              Alergias declaradas por el paciente
            </label>
            <input
              id="triage-allergies"
              type="text"
              value={declaredAllergies}
              onChange={(e) => setDeclaredAllergies(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="Ej. Niega alergias o refiere alergia a AINEs"
            />
          </div>

          <div>
            <label htmlFor="triage-conditions" className="block font-semibold text-ink">
              Antecedentes o motivo preliminar declarado
            </label>
            <textarea
              id="triage-conditions"
              rows={2}
              value={declaredConditions}
              onChange={(e) => setDeclaredConditions(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="Antecedentes manifestados al llegar"
            />
          </div>

          <fieldset className="rounded-md border border-divider p-3.5">
            <legend className="px-1 text-xs font-semibold text-ink">
              Mediciones preliminares (signos vitales)
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="triage-weight" className="block text-xs font-semibold text-ink">
                  Peso (kg)
                </label>
                <input
                  id="triage-weight"
                  type="text"
                  inputMode="decimal"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
                  placeholder="68.5"
                />
              </div>
              <div>
                <label htmlFor="triage-height" className="block text-xs font-semibold text-ink">
                  Estatura (cm)
                </label>
                <input
                  id="triage-height"
                  type="text"
                  inputMode="numeric"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
                  placeholder="168"
                />
              </div>
              <div>
                <label htmlFor="triage-temp" className="block text-xs font-semibold text-ink">
                  Temperatura (°C)
                </label>
                <input
                  id="triage-temp"
                  type="text"
                  inputMode="decimal"
                  value={temperatureC}
                  onChange={(e) => setTemperatureC(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
                  placeholder="36.5"
                />
              </div>
              <div>
                <label htmlFor="triage-bp" className="block text-xs font-semibold text-ink">
                  Presión arterial (mmHg)
                </label>
                <input
                  id="triage-bp"
                  type="text"
                  value={bloodPressure}
                  onChange={(e) => setBloodPressure(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
                  placeholder="120/80"
                />
              </div>
              <div>
                <label htmlFor="triage-hr" className="block text-xs font-semibold text-ink">
                  Frecuencia cardiaca (lpm)
                </label>
                <input
                  id="triage-hr"
                  type="text"
                  inputMode="numeric"
                  value={heartRateBpm}
                  onChange={(e) => setHeartRateBpm(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
                  placeholder="72"
                />
              </div>
            </div>
          </fieldset>

          {formError ? (
            <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-critical-ink">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
            >
              {editingPrepId ? 'Guardar corrección preliminar' : 'Guardar en PENDIENTE_REVISION'}
            </button>
            {editingPrepId ? (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
              >
                Cancelar edición
              </button>
            ) : null}
          </div>
        </form>

        <section className="space-y-4 rounded-lg border border-divider bg-surface p-5">
          <h2 className="text-lg font-bold text-ink">
            Preparaciones ancladas al expediente ({recordPreparations.length})
          </h2>
          {recordPreparations.length === 0 ? (
            <p className="rounded-md border border-divider bg-slate-50 p-4 text-sm text-ink-muted">
              No hay registros preliminares todavía.
            </p>
          ) : (
            <ol className="space-y-3">
              {recordPreparations.map((prep) => (
                <li key={prep.id} className="rounded-md border border-divider bg-slate-50 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge
                      tone={prep.status === 'PENDIENTE_REVISION' ? 'warning' : 'positive'}
                      label={prep.status}
                    />
                    <span className="font-mono text-xs text-ink-muted">
                      {formatDateTimeGmt6(prep.recordedAtGmt6)}
                    </span>
                  </div>

                  <p className="mt-2 font-mono text-xs text-ink">
                    Peso {prep.vitals.weightKg || 'N/D'} kg | Estatura {prep.vitals.heightCm || 'N/D'} cm |
                    Temp {prep.vitals.temperatureC || 'N/D'} °C | TA {prep.vitals.bloodPressure || 'N/D'} | FC{' '}
                    {prep.vitals.heartRateBpm || 'N/D'} lpm
                  </p>
                  {prep.declaredAllergies ? (
                    <p className="mt-1 text-xs text-ink">
                      <strong>Alergias declaradas:</strong> {prep.declaredAllergies}
                    </p>
                  ) : null}
                  {prep.declaredConditions ? (
                    <p className="mt-1 text-xs text-ink-muted">
                      <strong>Antecedentes declarados:</strong> {prep.declaredConditions}
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-xs text-ink-muted">
                    Capturado por: {prep.authorName} ({prep.encounterId ? `Atención ${prep.encounterId}` : 'Sin cita / sin atención previa'})
                  </p>

                  {prep.status === 'PENDIENTE_REVISION' ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => loadForEdit(prep)}
                        className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
                      >
                        Editar preliminar
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2 border-t border-divider pt-2.5">
                      <p className="text-xs font-medium text-positive-ink">
                        Revisada por {prep.reviewedByName} ({prep.reviewedAtGmt6 ? formatDateTimeGmt6(prep.reviewedAtGmt6) : ''}). Bloqueada para edición libre.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setAddendumTarget(prep)
                          setAddendumReason('')
                          setAddendumDetail('')
                          setAddendumError(null)
                        }}
                        className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
                      >
                        Agregar adenda append-only (PC-04)
                      </button>
                    </div>
                  )}

                  {prep.addenda.length > 0 ? (
                    <div className="mt-3 space-y-1.5 border-t border-divider pt-2">
                      <p className="text-xs font-bold text-ink">Adendas trazables (PC-04):</p>
                      {prep.addenda.map((add) => (
                        <div key={add.id} className="rounded border border-slate-200 bg-surface p-2 text-xs">
                          <p className="font-mono text-ink-muted">
                            {formatDateTimeGmt6(add.occurredAtGmt6)} ({add.authorName})
                          </p>
                          <p className="font-semibold text-ink">Motivo: {add.reason}</p>
                          <p className="text-ink-muted">{add.detail}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <ModalDialog
        open={Boolean(addendumTarget)}
        title="Registrar adenda append-only sobre preparación revisada (PC-04)"
        description="Conserva intactos los valores revisados originales con autoría y fecha GMT-6."
        onClose={() => setAddendumTarget(null)}
      >
        <form onSubmit={handleAddendumSubmit} className="space-y-4 text-sm">
          <div>
            <label htmlFor="prep-addendum-reason" className="block font-semibold text-ink">
              Motivo de la aclaración <span aria-hidden="true">*</span>
            </label>
            <input
              id="prep-addendum-reason"
              type="text"
              value={addendumReason}
              onChange={(e) => setAddendumReason(e.target.value)}
              required
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="Rectificación de dato declarado por el paciente"
            />
          </div>
          <div>
            <label htmlFor="prep-addendum-detail" className="block font-semibold text-ink">
              Detalle adicional (append-only) <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="prep-addendum-detail"
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
              onClick={() => setAddendumTarget(null)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
            >
              Guardar adenda
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  )
}
