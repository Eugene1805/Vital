import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { formatDateTimeGmt6, nowGmt6Iso, todayGmt6Date } from '../../design-system/gmt6.ts'
import { ModalDialog } from '../../design-system/ModalDialog.tsx'
import { StateView, type DataViewMode } from '../../design-system/StateView.tsx'
import { StatusBadge, type BadgeTone } from '../../design-system/StatusBadge.tsx'
import type { AppointmentStatus } from '../../domain/types.ts'
import {
  ALLOWED_APPOINTMENT_TRANSITIONS,
  canTransitionAppointmentStatus,
} from '../../guards/clinicalFlow.ts'
import { getActiveGrantForOperation, isInAuxiliaryOrdinaryScope } from '../../guards/objectAccess.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'
import {
  AgendaApiError,
  createAgendaClient,
  isSameSpecialistBff,
  resolveActiveSpecialistsBff,
  resolvePatientDisplayBff,
  resolveSpecialistDisplayBff,
  type AgendaAppointmentDetailDto,
  type AgendaAppointmentDto,
  type AgendaSpecialistAvailabilityDto,
} from '../../services/agendaClient.ts'

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

function nextMondayGmt6(): string {
  const [y, m, d] = todayGmt6Date().split('-').map(Number)
  const utcMid = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const day = utcMid.getUTCDay()
  const addDays = (8 - day) % 7 || 7
  utcMid.setUTCDate(utcMid.getUTCDate() + addDays)
  return utcMid.toISOString().slice(0, 10)
}

interface AgendaTableRow {
  id: string
  scheduledStartGmt6: string
  durationMinutes: number
  patientId: string
  patientName: string
  patientCode: string
  linkPatientId: string | null
  pendingPrimaryAssignment: boolean
  specialistId: string
  specialistName: string
  reason: string
  status: AppointmentStatus
  allowedNextStatuses: AppointmentStatus[]
  sourceDto: AgendaAppointmentDto | null
}

function AvailabilityHelperBox({
  availability,
  loading,
  error,
  selectedTime,
  onSelectTime,
}: {
  availability: AgendaSpecialistAvailabilityDto | null
  loading: boolean
  error: string | null
  selectedTime: string
  onSelectTime: (hhmm: string) => void
}) {
  if (loading) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-ink-muted">
        Consultando disponibilidad real del especialista en GMT-6...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-critical-bg p-3 text-xs text-critical-ink">
        {error}
      </div>
    )
  }

  if (!availability) return null

  const sourceLabel =
    availability.source === 'EXCEPTION'
      ? 'Excepción puntual'
      : availability.source === 'SPECIALIST_SCHEDULE'
        ? 'Horario propio'
        : availability.source === 'CLINIC_FALLBACK'
          ? 'Respaldo de clínica'
          : 'Sin horario configurado'

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-ink">
          Disponibilidad del especialista ({sourceLabel})
        </span>
        {availability.workingBlocks.length > 0 ? (
          <span className="font-mono text-ink-muted">
            {availability.workingBlocks.map((b) => `${b.startTime}-${b.endTime}`).join(' · ')} GMT-6
          </span>
        ) : null}
      </div>

      {availability.isUnavailable ? (
        <p className="font-medium text-critical-ink">
          {availability.reason ?? 'Sin jornada disponible para la fecha seleccionada.'}
        </p>
      ) : (
        <>
          {availability.busyBlocks.length > 0 ? (
            <p className="text-ink-muted">
              Bloques ocupados:{' '}
              <span className="font-mono">
                {availability.busyBlocks
                  .map(
                    (b) =>
                      `${b.scheduledStartGmt6.slice(11, 16)}-${b.scheduledEndGmt6.slice(11, 16)}`,
                  )
                  .join(', ')}
              </span>
            </p>
          ) : null}

          {availability.availableSlots.length > 0 ? (
            <div>
              <p className="mb-1.5 text-ink-muted">
                Espacios libres sugeridos (clic para autocompletar hora):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {availability.availableSlots.slice(0, 12).map((slot) => {
                  const active = selectedTime === slot.startTime
                  return (
                    <button
                      key={slot.startTime}
                      type="button"
                      onClick={() => onSelectTime(slot.startTime)}
                      aria-pressed={active}
                      className={`rounded border px-2 py-1 font-mono text-xs font-semibold ${
                        active
                          ? 'border-clinical bg-clinical text-white'
                          : 'border-slate-300 bg-surface text-ink hover:bg-slate-100'
                      }`}
                    >
                      {slot.startTime}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="font-medium text-amber-800">
              No hay espacios libres para esa duración dentro de la jornada.
            </p>
          )}
        </>
      )}
    </div>
  )
}

export function AppointmentsPage() {
  const {
    currentUser,
    currentTenant,
    authMode,
    agendaApiUrl,
    identityDirectory,
    refreshIdentityDirectory,
    patients,
    records,
    accounts,
    grants,
    appointments,
    createAppointment,
    rescheduleAppointment,
    transitionAppointmentStatus,
    getMockSpecialistAvailability,
  } = useMockStore()

  const [agendaClient] = useState(() => createAgendaClient(agendaApiUrl))
  const [specialistFilter, setSpecialistFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | AppointmentStatus>('ALL')
  const [statusNote, setStatusNote] = useState('')
  const [viewMode, setViewMode] = useState<DataViewMode>('ready')
  const [banner, setBanner] = useState<{ tone: 'positive' | 'critical'; text: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [liveState, setLiveState] = useState<{
    key: string
    items: AgendaAppointmentDto[]
    error: string | null
  } | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [patientId, setPatientId] = useState('')
  const [specialistId, setSpecialistId] = useState('')
  const [scheduledDate, setScheduledDate] = useState('2026-11-20')
  const [scheduledTime, setScheduledTime] = useState('12:00')
  const [durationMinutes, setDurationMinutes] = useState('30')
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const [rescheduleTarget, setRescheduleTarget] = useState<AgendaTableRow | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('2026-11-21')
  const [rescheduleTime, setRescheduleTime] = useState('10:00')
  const [rescheduleDuration, setRescheduleDuration] = useState('30')
  const [rescheduleNote, setRescheduleNote] = useState('')
  const [rescheduleError, setRescheduleError] = useState<string | null>(null)

  const [detailTarget, setDetailTarget] = useState<AgendaAppointmentDetailDto | null>(null)
  const [liveAvailState, setLiveAvailState] = useState<{
    key: string
    data: AgendaSpecialistAvailabilityDto | null
    error: string | null
  } | null>(null)

  const tableHeadingId = useId()
  const isLive = authMode === 'identity'
  const liveTenantKey = isLive && currentTenant ? `${currentTenant.id}:${currentUser?.id ?? ''}` : ''

  const reloadLiveAppointments = useCallback(async () => {
    if (!isLive || !currentTenant || !currentUser) return
    const scopeKey = `${currentTenant.id}:${currentUser.id}`
    try {
      const response = await agendaClient.listAppointments()
      setLiveState({ key: scopeKey, items: response.items, error: null })
    } catch (err) {
      const msg =
        err instanceof AgendaApiError
          ? err.problem.message
          : `No fue posible conectar con saas-agenda en ${agendaApiUrl}.`
      setLiveState({ key: scopeKey, items: [], error: msg })
    }
  }, [agendaApiUrl, agendaClient, currentTenant, currentUser, isLive])

  useEffect(() => {
    if (isLive && currentUser?.role === 'ADMIN_CLINICA') {
      void refreshIdentityDirectory()
    }
  }, [currentUser?.role, isLive, refreshIdentityDirectory])

  useEffect(() => {
    if (!isLive || !currentTenant || !currentUser) return
    let cancelled = false
    const scopeKey = `${currentTenant.id}:${currentUser.id}`

    void agendaClient
      .listAppointments()
      .then((response) => {
        if (!cancelled) {
          setLiveState({ key: scopeKey, items: response.items, error: null })
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg =
          err instanceof AgendaApiError
            ? err.problem.message
            : `No fue posible conectar con saas-agenda en ${agendaApiUrl}.`
        setLiveState({ key: scopeKey, items: [], error: msg })
      })

    return () => {
      cancelled = true
    }
  }, [agendaApiUrl, agendaClient, currentTenant, currentUser, isLive])

  const activeAvailSpecialistId = createOpen
    ? specialistId
    : rescheduleTarget
      ? rescheduleTarget.specialistId
      : ''
  const activeAvailDate = createOpen
    ? scheduledDate
    : rescheduleTarget
      ? rescheduleDate
      : ''
  const activeAvailDuration = Math.max(
    10,
    Number(createOpen ? durationMinutes : rescheduleDuration) || 30,
  )
  const availKey =
    isLive &&
    (createOpen || Boolean(rescheduleTarget)) &&
    activeAvailSpecialistId &&
    /^\d{4}-\d{2}-\d{2}$/.test(activeAvailDate)
      ? `${activeAvailSpecialistId}:${activeAvailDate}:${activeAvailDuration}`
      : ''

  useEffect(() => {
    if (!availKey) return
    let cancelled = false

    void agendaClient
      .getSpecialistAvailability(activeAvailSpecialistId, activeAvailDate, activeAvailDuration)
      .then((dto) => {
        if (!cancelled) {
          setLiveAvailState({ key: availKey, data: dto, error: null })
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg =
          err instanceof AgendaApiError
            ? err.problem.message
            : 'No fue posible consultar disponibilidad del especialista.'
        setLiveAvailState({ key: availKey, data: null, error: msg })
      })

    return () => {
      cancelled = true
    }
  }, [activeAvailDate, activeAvailDuration, activeAvailSpecialistId, agendaClient, availKey])

  if (!currentUser || !currentTenant) return null

  const nowIso = nowGmt6Iso()
  const activeSpecialists = isLive
    ? resolveActiveSpecialistsBff(currentTenant.id, identityDirectory?.accounts ?? null)
    : accounts
        .filter((a) => a.tenantId === currentTenant.id && a.role === 'ESPECIALISTA' && a.active)
        .map((a) => ({ id: a.id, fullName: a.fullName, specialty: a.specialty }))

  const staffForBff = isLive
    ? (identityDirectory?.accounts ?? []).map((a) => ({
        id: a.id,
        fullName: a.fullName,
        specialty: a.specialty,
      }))
    : accounts.map((a) => ({ id: a.id, fullName: a.fullName, specialty: a.specialty }))

  const agendaAllowedPatients = patients.filter((patient) => {
    if (patient.tenantId !== currentTenant.id) return false
    if (currentUser.role === 'ADMIN_CLINICA') return true
    const record = records.find((r) => r.patientId === patient.id)
    if (!record) return false
    if (isInAuxiliaryOrdinaryScope(currentUser, record)) return true
    if (
      isLive &&
      record.primarySpecialistId &&
      currentUser.linkedSpecialistIds.some((linked) =>
        isSameSpecialistBff(linked, record.primarySpecialistId),
      )
    ) {
      return true
    }
    if (record.primarySpecialistId === null) return true
    return Boolean(
      getActiveGrantForOperation(currentUser, patient.id, 'MANAGE_APPOINTMENTS', grants, nowIso),
    )
  })

  const liveLoading = isLive && Boolean(liveTenantKey) && liveState?.key !== liveTenantKey
  const liveError = isLive && liveState?.key === liveTenantKey ? liveState.error : null

  const rows: AgendaTableRow[] = isLive
    ? (liveState?.key === liveTenantKey ? liveState.items : [])
        .filter((apt) => {
          if (specialistFilter !== 'ALL' && !isSameSpecialistBff(apt.specialistId, specialistFilter)) {
            return false
          }
          if (statusFilter !== 'ALL' && apt.status !== statusFilter) return false
          return true
        })
        .sort((a, b) => a.scheduledStartGmt6.localeCompare(b.scheduledStartGmt6))
        .map((apt) => {
          const patientInfo = resolvePatientDisplayBff(apt.patientId, patients)
          const record = patientInfo.linkPatientId
            ? records.find((r) => r.patientId === patientInfo.linkPatientId)
            : undefined
          const specialistInfo = resolveSpecialistDisplayBff(apt.specialistId, staffForBff)
          return {
            id: apt.id,
            scheduledStartGmt6: apt.scheduledStartGmt6,
            durationMinutes: apt.durationMinutes,
            patientId: apt.patientId,
            patientName: patientInfo.fullName,
            patientCode: patientInfo.patientCode,
            linkPatientId: patientInfo.linkPatientId,
            pendingPrimaryAssignment: Boolean(record && !record.primarySpecialistId),
            specialistId: apt.specialistId,
            specialistName: specialistInfo.fullName,
            reason: apt.reason,
            status: apt.status,
            allowedNextStatuses: apt.allowedNextStatuses,
            sourceDto: apt,
          }
        })
    : appointments
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
        .map((apt) => {
          const patient = patients.find((p) => p.id === apt.patientId)
          const record = records.find((r) => r.patientId === apt.patientId)
          const specialist = accounts.find((a) => a.id === apt.specialistId)
          return {
            id: apt.id,
            scheduledStartGmt6: apt.scheduledStartGmt6,
            durationMinutes: apt.durationMinutes,
            patientId: apt.patientId,
            patientName: patient?.fullName ?? apt.patientId,
            patientCode: patient?.patientCode ?? apt.patientId.slice(0, 8),
            linkPatientId: patient?.id ?? null,
            pendingPrimaryAssignment: Boolean(record && !record.primarySpecialistId),
            specialistId: apt.specialistId,
            specialistName: specialist?.fullName ?? apt.specialistId,
            reason: apt.reason,
            status: apt.status,
            allowedNextStatuses: ALLOWED_APPOINTMENT_TRANSITIONS[apt.status],
            sourceDto: null,
          }
        })

  const modalAvailability: AgendaSpecialistAvailabilityDto | null = isLive
    ? availKey && liveAvailState?.key === availKey
      ? liveAvailState.data
      : null
    : activeAvailSpecialistId && /^\d{4}-\d{2}-\d{2}$/.test(activeAvailDate)
      ? getMockSpecialistAvailability(
          activeAvailSpecialistId,
          activeAvailDate,
          activeAvailDuration,
        )
      : null

  const modalAvailabilityLoading =
    isLive && Boolean(availKey) && liveAvailState?.key !== availKey
  const modalAvailabilityError =
    isLive && availKey && liveAvailState?.key === availKey ? liveAvailState.error : null

  const openCreateModal = () => {
    setPatientId(agendaAllowedPatients[0]?.id ?? '')
    setSpecialistId(activeSpecialists[0]?.id ?? '')
    setScheduledDate(isLive ? nextMondayGmt6() : '2026-11-20')
    setScheduledTime('12:00')
    setDurationMinutes('30')
    setReason('')
    setFormError(null)
    setCreateOpen(true)
  }

  const handleCreateSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)
    const scheduledStartGmt6 = `${scheduledDate}T${scheduledTime}:00-06:00`
    const duration = Number(durationMinutes) || 30

    if (isLive) {
      setSubmitting(true)
      try {
        await agendaClient.createAppointment({
          patientId,
          specialistId,
          scheduledStartGmt6,
          durationMinutes: duration,
          reason,
        })
        setLiveAvailState(null)
        await reloadLiveAppointments()
        setCreateOpen(false)
        setBanner({
          tone: 'positive',
          text: 'Cita registrada en saas-agenda en estado PROGRAMADA (GMT-6). Recuerda que una cita no equivale a atención clínica.',
        })
      } catch (err) {
        setFormError(
          err instanceof AgendaApiError
            ? err.problem.message
            : 'No fue posible programar la cita en saas-agenda.',
        )
      } finally {
        setSubmitting(false)
      }
      return
    }

    const decision = createAppointment({
      patientId,
      specialistId,
      scheduledStartGmt6,
      durationMinutes: duration,
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

  const openReschedule = (apt: AgendaTableRow) => {
    setRescheduleTarget(apt)
    setRescheduleDate(apt.scheduledStartGmt6.slice(0, 10))
    setRescheduleTime(apt.scheduledStartGmt6.slice(11, 16))
    setRescheduleDuration(String(apt.durationMinutes))
    setRescheduleNote('')
    setRescheduleError(null)
  }

  const handleRescheduleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!rescheduleTarget) return
    setRescheduleError(null)
    const nextStart = `${rescheduleDate}T${rescheduleTime}:00-06:00`
    const duration = Number(rescheduleDuration) || 30

    if (isLive) {
      setSubmitting(true)
      try {
        await agendaClient.rescheduleAppointment(rescheduleTarget.id, {
          scheduledStartGmt6: nextStart,
          durationMinutes: duration,
          note: rescheduleNote.trim() || undefined,
        })
        setLiveAvailState(null)
        await reloadLiveAppointments()
        setRescheduleTarget(null)
        setBanner({ tone: 'positive', text: 'Horario de cita actualizado en saas-agenda (GMT-6).' })
      } catch (err) {
        setRescheduleError(
          err instanceof AgendaApiError
            ? err.problem.message
            : 'No fue posible reprogramar la cita en saas-agenda.',
        )
      } finally {
        setSubmitting(false)
      }
      return
    }

    const decision = rescheduleAppointment(rescheduleTarget.id, nextStart, duration)
    if (!decision.allowed) {
      setRescheduleError(decision.message)
      return
    }
    setRescheduleTarget(null)
    setBanner({ tone: 'positive', text: 'Horario de cita actualizado en GMT-6.' })
  }

  const handleTransition = async (apt: AgendaTableRow, nextStatus: AppointmentStatus) => {
    const check = canTransitionAppointmentStatus(apt.status, nextStatus)
    if (!check.allowed) {
      setBanner({ tone: 'critical', text: check.message })
      return
    }

    if (isLive) {
      setSubmitting(true)
      try {
        await agendaClient.transitionAppointmentStatus(apt.id, {
          nextStatus,
          note: statusNote.trim() || undefined,
        })
        setStatusNote('')
        await reloadLiveAppointments()
        setBanner({
          tone: 'positive',
          text: `Estado de cita actualizado a ${nextStatus} en saas-agenda. La atención clínica (CU-03 / CU-19) sigue siendo independiente.`,
        })
      } catch (err) {
        setBanner({
          tone: 'critical',
          text:
            err instanceof AgendaApiError
              ? err.problem.message
              : 'No fue posible actualizar el estado de la cita.',
        })
      } finally {
        setSubmitting(false)
      }
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

  const handleOpenDetail = async (aptId: string) => {
    try {
      const detail = await agendaClient.getAppointmentDetail(aptId)
      setDetailTarget(detail)
    } catch (err) {
      setBanner({
        tone: 'critical',
        text:
          err instanceof AgendaApiError
            ? err.problem.message
            : 'No fue posible consultar el historial de la cita.',
      })
    }
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
            Catálogo cerrado de estados administrativos y validación de horarios laborales por clínica/especialista. Completar una cita no crea atención clínica (CU-03), preparación preliminar (CU-19) ni acceso médico (CU-10).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <StatusBadge
            tone={isLive ? 'info' : 'neutral'}
            label={isLive ? 'Agenda API (.NET 10)' : 'Modo Mock local'}
          />
          {currentUser.role === 'ADMIN_CLINICA' ? (
            <Link
              to="/admin/schedules"
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3.5 py-2 text-sm font-semibold text-ink hover:bg-slate-50"
            >
              Configurar horarios
            </Link>
          ) : null}
          {currentUser.role !== 'ESPECIALISTA' ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-clinical px-4 py-2.5 text-sm font-semibold text-white hover:bg-clinical-hover"
            >
              Nueva cita
            </button>
          ) : null}
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

        {isLive && currentUser.role !== 'ESPECIALISTA' ? (
          <div className="mt-3 border-t border-divider pt-3">
            <label htmlFor="agenda-status-note" className="block text-xs font-semibold text-ink">
              Nota opcional para cancelación o cambio de estado (D-AG-04)
            </label>
            <input
              id="agenda-status-note"
              type="text"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              placeholder="Ej. Paciente reprogramó por teléfono o no se presentó a cita"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        ) : null}
      </section>

      {viewMode === 'loading' || liveLoading ? (
        <StateView
          mode="loading"
          title="Consultando agenda interna..."
          message="Sincronizando bloques horarios en GMT-6."
        />
      ) : viewMode === 'error' || liveError ? (
        <StateView
          mode="error"
          title="No fue posible cargar la agenda"
          message={liveError ?? 'Fallo simulado del servicio Agenda.'}
          onRetry={() => {
            if (viewMode === 'error') setViewMode('ready')
            else void reloadLiveAppointments()
          }}
        />
      ) : rows.length === 0 ? (
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
              {rows.map((apt) => {
                const canReprogram =
                  currentUser.role !== 'ESPECIALISTA' &&
                  (apt.status === 'PROGRAMADA' ||
                    apt.status === 'CONFIRMADA' ||
                    apt.status === 'EN_CURSO')

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
                      <p className="font-semibold text-ink">{apt.patientName}</p>
                      <p className="font-mono text-xs text-ink-muted">{apt.patientCode}</p>
                      {apt.pendingPrimaryAssignment ? (
                        <div className="mt-1">
                          <StatusBadge tone="warning" label="Pendiente de asignación" />
                        </div>
                      ) : null}
                    </td>
                    <td data-label="Especialista y motivo">
                      <p className="font-semibold text-ink">{apt.specialistName}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">{apt.reason}</p>
                    </td>
                    <td data-label="Estado cita">
                      <StatusBadge tone={aptStatusTone(apt.status)} label={apt.status} />
                    </td>
                    <td data-label="Gestión">
                      <div className="flex flex-wrap gap-2">
                        {currentUser.role !== 'ESPECIALISTA'
                          ? apt.allowedNextStatuses.map((next) => (
                              <button
                                key={next}
                                type="button"
                                disabled={submitting}
                                onClick={() => void handleTransition(apt, next)}
                                className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100 disabled:opacity-60"
                              >
                                Pasar a {next}
                              </button>
                            ))
                          : null}
                        {canReprogram ? (
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => openReschedule(apt)}
                            className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100 disabled:opacity-60"
                          >
                            Reprogramar
                          </button>
                        ) : null}
                        {isLive ? (
                          <button
                            type="button"
                            onClick={() => void handleOpenDetail(apt.id)}
                            className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50"
                          >
                            Historial
                          </button>
                        ) : null}
                        {apt.linkPatientId ? (
                          <Link
                            to={`/admin/patients/${apt.linkPatientId}`}
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
        description="Valida jornada laboral, fecha futura (en API) y conflictos con citas activas del especialista en GMT-6."
        onClose={() => setCreateOpen(false)}
      >
        <form onSubmit={(e) => void handleCreateSubmit(e)} className="space-y-4 text-sm">
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

          <AvailabilityHelperBox
            availability={modalAvailability}
            loading={modalAvailabilityLoading}
            error={modalAvailabilityError}
            selectedTime={scheduledTime}
            onSelectTime={setScheduledTime}
          />

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
              disabled={submitting}
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover disabled:opacity-60"
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
          <form onSubmit={(e) => void handleRescheduleSubmit(e)} className="space-y-4 text-sm">
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

            <AvailabilityHelperBox
              availability={modalAvailability}
              loading={modalAvailabilityLoading}
              error={modalAvailabilityError}
              selectedTime={rescheduleTime}
              onSelectTime={setRescheduleTime}
            />

            {isLive ? (
              <div>
                <label htmlFor="resched-note" className="block font-semibold text-ink">
                  Motivo de reprogramación (opcional)
                </label>
                <input
                  id="resched-note"
                  type="text"
                  value={rescheduleNote}
                  onChange={(e) => setRescheduleNote(e.target.value)}
                  placeholder="Ej. Ajuste solicitado por el paciente"
                  className="mt-1 w-full rounded-md border px-3 py-2"
                />
              </div>
            ) : null}

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
                disabled={submitting}
                className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover disabled:opacity-60"
              >
                Confirmar cambio
              </button>
            </div>
          </form>
        ) : null}
      </ModalDialog>

      {/* Modal Historial de cita (API real) */}
      <ModalDialog
        open={Boolean(detailTarget)}
        title="Historial administrativo de cita"
        description={detailTarget?.reason}
        onClose={() => setDetailTarget(null)}
      >
        {detailTarget ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border border-divider bg-slate-50 p-3 text-xs space-y-1">
              <p>
                <span className="font-semibold text-ink">Estado actual:</span> {detailTarget.status}
              </p>
              <p>
                <span className="font-semibold text-ink">Ventana GMT-6:</span>{' '}
                {formatDateTimeGmt6(detailTarget.scheduledStartGmt6)} ({detailTarget.durationMinutes} min)
              </p>
              <p>
                <span className="font-semibold text-ink">Registrada por:</span>{' '}
                {detailTarget.createdByName}
              </p>
            </div>

            <ul className="space-y-2">
              {detailTarget.history.map((entry) => (
                <li key={entry.id} className="rounded-md border border-divider bg-surface p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-ink">
                      {entry.eventType}: {entry.fromStatus ? `${entry.fromStatus} -> ` : ''}
                      {entry.toStatus}
                    </span>
                    <span className="font-mono text-ink-muted">
                      {formatDateTimeGmt6(entry.occurredAtGmt6)}
                    </span>
                  </div>
                  <p className="mt-1 text-ink-muted">Actor: {entry.actorName}</p>
                  {entry.note ? <p className="mt-1 text-ink">Nota: {entry.note}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </ModalDialog>
    </div>
  )
}
