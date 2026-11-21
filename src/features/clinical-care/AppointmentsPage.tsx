import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { formatDateTimeGmt6, nowGmt6Iso } from '../../design-system/gmt6.ts'
import { ModalDialog } from '../../design-system/ModalDialog.tsx'
import { StateView, type DataViewMode } from '../../design-system/StateView.tsx'
import { StatusBadge, type BadgeTone } from '../../design-system/StatusBadge.tsx'
import type { Appointment, AppointmentStatus } from '../../domain/types.ts'
import {
  ALLOWED_APPOINTMENT_TRANSITIONS,
  canTransitionAppointmentStatus,
} from '../../guards/clinicalFlow.ts'
import { getActiveGrantForOperation, isInAuxiliaryOrdinaryScope } from '../../guards/objectAccess.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'

function aptStatusTone(status: AppointmentStatus): BadgeTone {
  switch (status) {
    case 'CONFIRMADA':
    case 'COMPLETADA':
      return 'positive'
    case 'PROGRAMADA':
    case 'EN_CURSO':
      return 'info'
    case 'NO_ASISTIO':
      return 'warning'
    case 'CANCELADA':
      return 'critical'
  }
}

export function AppointmentsPage() {
  const {
    currentUser,
    currentTenant,
    patients,
    records,
    accounts,
    grants,
    appointments,
    createAppointment,
    rescheduleAppointment,
    transitionAppointmentStatus,
  } = useMockStore()

  const [specialistFilter, setSpecialistFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | AppointmentStatus>('ALL')
  const [viewMode, setViewMode] = useState<DataViewMode>('ready')
  const [banner, setBanner] = useState<{ tone: 'positive' | 'critical'; text: string } | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [patientId, setPatientId] = useState('')
  const [specialistId, setSpecialistId] = useState('')
  const [scheduledDate, setScheduledDate] = useState('2026-11-20')
  const [scheduledTime, setScheduledTime] = useState('12:00')
  const [durationMinutes, setDurationMinutes] = useState('30')
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('2026-11-21')
  const [rescheduleTime, setRescheduleTime] = useState('10:00')
  const [rescheduleDuration, setRescheduleDuration] = useState('30')
  const [rescheduleError, setRescheduleError] = useState<string | null>(null)

  const tableHeadingId = useId()
  if (!currentUser || !currentTenant) return null

  const nowIso = nowGmt6Iso()
  const activeSpecialists = accounts.filter(
    (a) => a.tenantId === currentTenant.id && a.role === 'ESPECIALISTA' && a.active,
  )

  const agendaAllowedPatients = patients.filter((patient) => {
    if (patient.tenantId !== currentTenant.id) return false
    if (currentUser.role === 'ADMIN_CLINICA') return true
    const record = records.find((r) => r.patientId === patient.id)
    if (!record) return false
    if (isInAuxiliaryOrdinaryScope(currentUser, record)) return true
    if (record.primarySpecialistId === null) return true
    return Boolean(
      getActiveGrantForOperation(currentUser, patient.id, 'MANAGE_APPOINTMENTS', grants, nowIso),
    )
  })

  const visibleAppointments = appointments
    .filter((apt) => {
      if (apt.tenantId !== currentTenant.id) return false
      if (specialistFilter !== 'ALL' && apt.specialistId !== specialistFilter) return false
      if (statusFilter !== 'ALL' && apt.status !== statusFilter) return false
      if (currentUser.role === 'ADMIN_CLINICA') return true
      const record = records.find((r) => r.patientId === apt.patientId)
      if (!record) return false
      return (
        isInAuxiliaryOrdinaryScope(currentUser, record) ||
        record.primarySpecialistId === null ||
        Boolean(
          getActiveGrantForOperation(
            currentUser,
            apt.patientId,
            'MANAGE_APPOINTMENTS',
            grants,
            nowIso,
          ),
        )
      )
    })
    .sort((a, b) => a.scheduledStartGmt6.localeCompare(b.scheduledStartGmt6))

  const openCreateModal = () => {
    setPatientId(agendaAllowedPatients[0]?.id ?? '')
    setSpecialistId(activeSpecialists[0]?.id ?? '')
    setScheduledDate('2026-11-20')
    setScheduledTime('12:00')
    setDurationMinutes('30')
    setReason('')
    setFormError(null)
    setCreateOpen(true)
  }

  const handleCreateSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)
    const scheduledStartGmt6 = `${scheduledDate}T${scheduledTime}:00-06:00`
    const decision = createAppointment({
      patientId,
      specialistId,
      scheduledStartGmt6,
      durationMinutes: Number(durationMinutes) || 30,
      reason,
    })
    if (!decision.allowed) {
      setFormError(decision.message)
      return
    }
    setCreateOpen(false)
    setBanner({
      tone: 'positive',
      text: 'Cita registrada en estado PROGRAMADA (GMT-6). Recuerda que una cita no equivale a atención clínica.',
    })
  }

  const openReschedule = (apt: Appointment) => {
    setRescheduleTarget(apt)
    setRescheduleDate(apt.scheduledStartGmt6.slice(0, 10))
    setRescheduleTime(apt.scheduledStartGmt6.slice(11, 16))
    setRescheduleDuration(String(apt.durationMinutes))
    setRescheduleError(null)
  }

  const handleRescheduleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!rescheduleTarget) return
    setRescheduleError(null)
    const nextStart = `${rescheduleDate}T${rescheduleTime}:00-06:00`
    const decision = rescheduleAppointment(
      rescheduleTarget.id,
      nextStart,
      Number(rescheduleDuration) || 30,
    )
    if (!decision.allowed) {
      setRescheduleError(decision.message)
      return
    }
    setRescheduleTarget(null)
    setBanner({ tone: 'positive', text: 'Horario de cita actualizado en GMT-6.' })
  }

  const handleTransition = (apt: Appointment, nextStatus: AppointmentStatus) => {
    const check = canTransitionAppointmentStatus(apt.status, nextStatus)
    if (!check.allowed) {
      setBanner({ tone: 'critical', text: check.message })
      return
    }
    const decision = transitionAppointmentStatus(apt.id, nextStatus)
    if (!decision.allowed) {
      setBanner({ tone: 'critical', text: decision.message })
      return
    }
    setBanner({
      tone: 'positive',
      text: `Estado de cita actualizado a ${nextStatus}. La atención clínica (CU-03) sigue siendo independiente.`,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-divider pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-medium text-clinical">CU-18 · AGENDA INTERNA</p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
            Agenda interna de citas (GMT-6)
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Catálogo cerrado de estados administrativos. Completar una cita no crea ni finaliza una atención médica ni concede acceso clínico (CU-10).
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-clinical px-4 py-2.5 text-sm font-semibold text-white hover:bg-clinical-hover"
        >
          Nueva cita
        </button>
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

      <section className="rounded-lg border border-divider bg-surface p-4">
        <search>
          <form onSubmit={(e) => e.preventDefault()} className="grid gap-3 md:grid-cols-3">
            <div>
              <label htmlFor="agenda-specialist-filter" className="block text-xs font-semibold text-ink">
                Especialista
              </label>
              <select
                id="agenda-specialist-filter"
                value={specialistFilter}
                onChange={(e) => setSpecialistFilter(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="ALL">Todos los especialistas</option>
                {activeSpecialists.map((spec) => (
                  <option key={spec.id} value={spec.id}>
                    {spec.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="agenda-status-filter" className="block text-xs font-semibold text-ink">
                Estado cerrado de cita
              </label>
              <select
                id="agenda-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | AppointmentStatus)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="ALL">Todos los estados</option>
                <option value="PROGRAMADA">PROGRAMADA</option>
                <option value="CONFIRMADA">CONFIRMADA</option>
                <option value="EN_CURSO">EN_CURSO</option>
                <option value="COMPLETADA">COMPLETADA</option>
                <option value="CANCELADA">CANCELADA</option>
                <option value="NO_ASISTIO">NO_ASISTIO</option>
              </select>
            </div>

            <div>
              <label htmlFor="agenda-view-mode" className="block text-xs font-semibold text-ink">
                Estado de vista
              </label>
              <select
                id="agenda-view-mode"
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as DataViewMode)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="ready">Datos disponibles</option>
                <option value="loading">Simular carga</option>
                <option value="error">Simular error</option>
              </select>
            </div>
          </form>
        </search>
      </section>

      {viewMode === 'loading' ? (
        <StateView
          mode="loading"
          title="Consultando agenda interna..."
          message="Sincronizando bloques horarios en GMT-6."
        />
      ) : viewMode === 'error' ? (
        <StateView
          mode="error"
          title="No fue posible cargar la agenda"
          message="Fallo simulado del servicio Agenda."
          onRetry={() => setViewMode('ready')}
        />
      ) : visibleAppointments.length === 0 ? (
        <StateView
          mode="empty"
          title="Sin citas registradas para este filtro"
          message="Programa una cita nueva o recuerda que las atenciones pueden ocurrir sin cita previa."
        />
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-labelledby={tableHeadingId}
          className="table-wrapper rounded-lg border border-divider bg-surface"
        >
          <table className="vital-table">
            <caption id={tableHeadingId} className="sr-only">
              Citas internas de la clínica en horario GMT-6
            </caption>
            <thead>
              <tr>
                <th scope="col">Horario (GMT-6)</th>
                <th scope="col">Paciente y expediente</th>
                <th scope="col">Especialista y motivo</th>
                <th scope="col">Estado cita</th>
                <th scope="col">Gestión</th>
              </tr>
            </thead>
            <tbody>
              {visibleAppointments.map((apt) => {
                const patient = patients.find((p) => p.id === apt.patientId)
                const record = records.find((r) => r.patientId === apt.patientId)
                const specialist = accounts.find((a) => a.id === apt.specialistId)
                const nextOptions = ALLOWED_APPOINTMENT_TRANSITIONS[apt.status]
                const canReprogram =
                  apt.status === 'PROGRAMADA' ||
                  apt.status === 'CONFIRMADA' ||
                  apt.status === 'EN_CURSO'

                return (
                  <tr key={apt.id}>
                    <th scope="row" className="text-left">
                      <p className="font-mono text-xs font-semibold text-ink">
                        {formatDateTimeGmt6(apt.scheduledStartGmt6)}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-ink-muted">
                        Duración: {apt.durationMinutes} min
                      </p>
                    </th>
                    <td data-label="Paciente y expediente">
                      <p className="font-semibold text-ink">
                        {patient?.fullName ?? apt.patientId}
                      </p>
                      <p className="font-mono text-xs text-ink-muted">{patient?.patientCode}</p>
                      {record && !record.primarySpecialistId ? (
                        <div className="mt-1">
                          <StatusBadge tone="warning" label="Pendiente de asignación" />
                        </div>
                      ) : null}
                    </td>
                    <td data-label="Especialista y motivo">
                      <p className="font-semibold text-ink">
                        {specialist?.fullName ?? apt.specialistId}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">{apt.reason}</p>
                    </td>
                    <td data-label="Estado cita">
                      <StatusBadge tone={aptStatusTone(apt.status)} label={apt.status} />
                    </td>
                    <td data-label="Gestión">
                      <div className="flex flex-wrap gap-2">
                        {nextOptions.map((next) => (
                          <button
                            key={next}
                            type="button"
                            onClick={() => handleTransition(apt, next)}
                            className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
                          >
                            Pasar a {next}
                          </button>
                        ))}
                        {canReprogram ? (
                          <button
                            type="button"
                            onClick={() => openReschedule(apt)}
                            className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
                          >
                            Reprogramar
                          </button>
                        ) : null}
                        {patient ? (
                          <Link
                            to={`/admin/patients/${patient.id}`}
                            className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-2.5 py-1.5 text-xs font-semibold text-clinical hover:bg-slate-50"
                          >
                            Ficha
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Nueva cita */}
      <ModalDialog
        open={createOpen}
        title="Programar cita interna (CU-18)"
        description="Valida horario en GMT-6 y conflictos con citas activas del especialista."
        onClose={() => setCreateOpen(false)}
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4 text-sm">
          <div>
            <label htmlFor="apt-patient" className="block font-semibold text-ink">
              Paciente en ámbito autorizado
            </label>
            <select
              id="apt-patient"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
            >
              {agendaAllowedPatients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.patientCode} ({p.fullName})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="apt-specialist" className="block font-semibold text-ink">
              Especialista
            </label>
            <select
              id="apt-specialist"
              value={specialistId}
              onChange={(e) => setSpecialistId(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
            >
              {activeSpecialists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.specialty ?? 'General'})
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="apt-date" className="block font-semibold text-ink">
                Fecha (GMT-6)
              </label>
              <input
                id="apt-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                required
                className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label htmlFor="apt-time" className="block font-semibold text-ink">
                Hora (GMT-6)
              </label>
              <input
                id="apt-time"
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                required
                className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label htmlFor="apt-duration" className="block font-semibold text-ink">
                Duración (min)
              </label>
              <input
                id="apt-duration"
                type="text"
                inputMode="numeric"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor="apt-reason" className="block font-semibold text-ink">
              Motivo administrativo <span aria-hidden="true">*</span>
            </label>
            <input
              id="apt-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="Consulta de seguimiento"
            />
          </div>

          {formError ? (
            <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-critical-ink">
              {formError}
            </p>
          ) : null}

          <div className="flex justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
            >
              Programar cita
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal Reprogramar */}
      <ModalDialog
        open={Boolean(rescheduleTarget)}
        title="Reprogramar cita (GMT-6)"
        description={rescheduleTarget?.reason}
        onClose={() => setRescheduleTarget(null)}
      >
        {rescheduleTarget ? (
          <form onSubmit={handleRescheduleSubmit} className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="resched-date" className="block font-semibold text-ink">
                  Nueva fecha
                </label>
                <input
                  id="resched-date"
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label htmlFor="resched-time" className="block font-semibold text-ink">
                  Nueva hora
                </label>
                <input
                  id="resched-time"
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label htmlFor="resched-duration" className="block font-semibold text-ink">
                  Duración (min)
                </label>
                <input
                  id="resched-duration"
                  type="text"
                  inputMode="numeric"
                  value={rescheduleDuration}
                  onChange={(e) => setRescheduleDuration(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
                />
              </div>
            </div>
            {rescheduleError ? (
              <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-critical-ink">
                {rescheduleError}
              </p>
            ) : null}
            <div className="flex justify-end gap-3 border-t border-divider pt-4">
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover"
              >
                Confirmar cambio
              </button>
            </div>
          </form>
        ) : null}
      </ModalDialog>
    </div>
  )
}
