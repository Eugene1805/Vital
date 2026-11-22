import { useEffect, useState, type FormEvent } from 'react'
import { formatDateGmt6, formatDateTimeGmt6, todayGmt6Date } from '../../design-system/gmt6.ts'
import { StatusBadge } from '../../design-system/StatusBadge.tsx'
import type {
  Appointment,
  ScheduleDayOfWeek,
  ScheduleTimeSlot,
  SpecialistScheduleException,
} from '../../domain/types.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'
import {
  AgendaApiError,
  createAgendaClient,
  resolveActiveSpecialistsBff,
  resolvePatientDisplayBff,
  SCHEDULE_DAY_LABELS,
  SCHEDULE_DAY_ORDER,
  type AgendaAppointmentDto,
} from '../../services/agendaClient.ts'

function extractConflictDetails(
  message: string,
  slots?: string[],
): string {
  if (!slots || slots.length === 0) return message
  return `${message} Bloques en conflicto: ${slots.join(', ')}.`
}

function WeeklySlotsEditor({
  slots,
  onChange,
  idPrefix,
  disabled = false,
}: {
  slots: ScheduleTimeSlot[]
  onChange: (next: ScheduleTimeSlot[]) => void
  idPrefix: string
  disabled?: boolean
}) {
  const [newDay, setNewDay] = useState<ScheduleDayOfWeek>('MONDAY')
  const [newStart, setNewStart] = useState('09:00')
  const [newEnd, setNewEnd] = useState('14:00')
  const [localError, setLocalError] = useState<string | null>(null)

  const handleAdd = () => {
    setLocalError(null)
    if (!newStart || !newEnd || newEnd <= newStart) {
      setLocalError('La hora de fin debe ser posterior a la hora de inicio (HH:mm).')
      return
    }
    const overlap = slots.some(
      (s) => s.dayOfWeek === newDay && newStart < s.endTime && newEnd > s.startTime,
    )
    if (overlap) {
      setLocalError(`El bloque se traslapa con otro ya agregado en ${SCHEDULE_DAY_LABELS[newDay]}.`)
      return
    }

    const updated = [...slots, { dayOfWeek: newDay, startTime: newStart, endTime: newEnd }].sort(
      (a, b) =>
        SCHEDULE_DAY_ORDER.indexOf(a.dayOfWeek) - SCHEDULE_DAY_ORDER.indexOf(b.dayOfWeek) ||
        a.startTime.localeCompare(b.startTime),
    )
    onChange(updated)
  }

  return (
    <div className="space-y-3">
      {!disabled ? (
        <div className="grid gap-2 rounded-md border border-divider bg-slate-50 p-3 sm:grid-cols-4">
          <div>
            <label htmlFor={`${idPrefix}-day`} className="block text-xs font-semibold text-ink">
              Día
            </label>
            <select
              id={`${idPrefix}-day`}
              value={newDay}
              onChange={(e) => setNewDay(e.target.value as ScheduleDayOfWeek)}
              className="mt-1 w-full rounded-md border bg-surface px-2.5 py-2 text-sm"
            >
              {SCHEDULE_DAY_ORDER.map((day) => (
                <option key={day} value={day}>
                  {SCHEDULE_DAY_LABELS[day]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${idPrefix}-start`} className="block text-xs font-semibold text-ink">
              Inicio (GMT-6)
            </label>
            <input
              id={`${idPrefix}-start`}
              type="time"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              className="mt-1 w-full rounded-md border bg-surface px-2.5 py-2 font-mono text-sm"
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-end`} className="block text-xs font-semibold text-ink">
              Fin (GMT-6)
            </label>
            <input
              id={`${idPrefix}-end`}
              type="time"
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
              className="mt-1 w-full rounded-md border bg-surface px-2.5 py-2 font-mono text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleAdd}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-slate-300 bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-slate-100"
            >
              Agregar bloque
            </button>
          </div>
        </div>
      ) : null}

      {localError ? (
        <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-xs text-critical-ink">
          {localError}
        </p>
      ) : null}

      {slots.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-xs text-ink-muted">
          Sin bloques semanales configurados.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map((slot, idx) => (
            <li
              key={`${slot.dayOfWeek}-${slot.startTime}-${slot.endTime}-${idx}`}
              className="flex items-center justify-between gap-2 rounded-md border border-divider bg-surface px-3 py-2 text-xs"
            >
              <div>
                <p className="font-semibold text-ink">{SCHEDULE_DAY_LABELS[slot.dayOfWeek]}</p>
                <p className="font-mono text-ink-muted">
                  {slot.startTime} - {slot.endTime} GMT-6
                </p>
              </div>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => onChange(slots.filter((_, i) => i !== idx))}
                  className="min-h-9 rounded border border-red-200 px-2 py-1 text-xs font-semibold text-critical-ink hover:bg-critical-bg"
                >
                  Quitar
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function SchedulesPage() {
  const {
    currentUser,
    currentTenant,
    accounts,
    patients,
    appointments,
    clinicSchedules,
    specialistSchedules,
    scheduleExceptions,
    authMode,
    agendaApiUrl,
    identityAccountId,
    identityDirectory,
    refreshIdentityDirectory,
    updateClinicSchedule,
    updateSpecialistSchedule,
    upsertSpecialistException,
    deleteSpecialistException,
  } = useMockStore()

  const [agendaClient] = useState(() => createAgendaClient(agendaApiUrl))
  const [banner, setBanner] = useState<{ tone: 'positive' | 'critical'; text: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [liveSnapshot, setLiveSnapshot] = useState<{
    loadedKey: string
    clinicSlots: ScheduleTimeSlot[]
    clinicUpdatedInfo: string | null
    useClinicFallback: boolean
    ownSlots: ScheduleTimeSlot[]
    effectiveWeeklySlots: ScheduleTimeSlot[]
    exceptions: SpecialistScheduleException[]
    ownAppointments: AgendaAppointmentDto[]
  } | null>(null)
  const [liveLoadErrorKey, setLiveLoadErrorKey] = useState<string | null>(null)

  const [clinicDraftOverride, setClinicDraftOverride] = useState<{
    key: string
    slots: ScheduleTimeSlot[]
  } | null>(null)
  const [fallbackDraftOverride, setFallbackDraftOverride] = useState<{
    key: string
    value: boolean
  } | null>(null)
  const [specSlotsDraftOverride, setSpecSlotsDraftOverride] = useState<{
    key: string
    slots: ScheduleTimeSlot[]
  } | null>(null)

  const isSpecialistSelf = currentUser?.role === 'ESPECIALISTA'

  const activeSpecialists =
    authMode === 'identity'
      ? resolveActiveSpecialistsBff(
          currentTenant?.id ?? null,
          identityDirectory?.accounts ?? null,
        )
      : accounts
          .filter(
            (a) =>
              a.tenantId === currentTenant?.id && a.role === 'ESPECIALISTA' && a.active,
          )
          .map((a) => ({ id: a.id, fullName: a.fullName, specialty: a.specialty }))

  const [selectedSpecialistId, setSelectedSpecialistId] = useState('')
  const targetSpecialistId = isSpecialistSelf
    ? authMode === 'identity'
      ? (identityAccountId ?? currentUser?.id ?? '')
      : (currentUser?.id ?? '')
    : selectedSpecialistId || activeSpecialists[0]?.id || ''

  const [exDate, setExDate] = useState(() => todayGmt6Date())
  const [exIsUnavailable, setExIsUnavailable] = useState(true)
  const [exStartTime, setExStartTime] = useState('09:00')
  const [exEndTime, setExEndTime] = useState('13:00')
  const [exReason, setExReason] = useState('')

  const liveScopeKey =
    authMode === 'identity' && currentTenant && targetSpecialistId
      ? `${currentTenant.id}:${targetSpecialistId}:${isSpecialistSelf ? 'self' : 'admin'}`
      : ''

  const clinicDraftKey = `${authMode}:${currentTenant?.id ?? 'none'}`
  const specDraftKey = `${clinicDraftKey}:${targetSpecialistId || 'none'}`

  const loadLiveSchedules = async () => {
    if (authMode !== 'identity' || !currentTenant || !targetSpecialistId) return
    const requestKey = `${currentTenant.id}:${targetSpecialistId}:${isSpecialistSelf ? 'self' : 'admin'}`
    try {
      const [clinicData, specData, ownApts] = await Promise.all([
        agendaClient.getClinicSchedule(),
        agendaClient.getSpecialistSchedule(targetSpecialistId),
        isSpecialistSelf ? agendaClient.listAppointments() : Promise.resolve(null),
      ])
      setLiveSnapshot({
        loadedKey: requestKey,
        clinicSlots: clinicData.slots,
        clinicUpdatedInfo:
          clinicData.updatedByName && clinicData.updatedAtGmt6
            ? `${clinicData.updatedByName} (${formatDateTimeGmt6(clinicData.updatedAtGmt6)})`
            : null,
        useClinicFallback: specData.useClinicFallback,
        ownSlots: specData.ownSlots,
        effectiveWeeklySlots: specData.effectiveWeeklySlots,
        exceptions: specData.upcomingExceptions.map((e) => ({
          ...e,
          tenantId: currentTenant.id,
        })),
        ownAppointments: ownApts?.items ?? [],
      })
      setLiveLoadErrorKey(null)
    } catch (err) {
      const msg =
        err instanceof AgendaApiError
          ? err.problem.message
          : `No fue posible conectar con saas-agenda en ${agendaApiUrl}.`
      setLiveLoadErrorKey(requestKey)
      setBanner({ tone: 'critical', text: msg })
    }
  }

  useEffect(() => {
    if (authMode === 'identity' && currentUser?.role === 'ADMIN_CLINICA') {
      void refreshIdentityDirectory()
    }
  }, [authMode, currentUser?.role, refreshIdentityDirectory])

  useEffect(() => {
    if (authMode !== 'identity' || !currentTenant || !targetSpecialistId) return
    let cancelled = false
    const requestKey = `${currentTenant.id}:${targetSpecialistId}:${isSpecialistSelf ? 'self' : 'admin'}`

    void Promise.all([
      agendaClient.getClinicSchedule(),
      agendaClient.getSpecialistSchedule(targetSpecialistId),
      isSpecialistSelf ? agendaClient.listAppointments() : Promise.resolve(null),
    ])
      .then(([clinicData, specData, ownApts]) => {
        if (cancelled) return
        setLiveSnapshot({
          loadedKey: requestKey,
          clinicSlots: clinicData.slots,
          clinicUpdatedInfo:
            clinicData.updatedByName && clinicData.updatedAtGmt6
              ? `${clinicData.updatedByName} (${formatDateTimeGmt6(clinicData.updatedAtGmt6)})`
              : null,
          useClinicFallback: specData.useClinicFallback,
          ownSlots: specData.ownSlots,
          effectiveWeeklySlots: specData.effectiveWeeklySlots,
          exceptions: specData.upcomingExceptions.map((e) => ({
            ...e,
            tenantId: currentTenant.id,
          })),
          ownAppointments: ownApts?.items ?? [],
        })
        setLiveLoadErrorKey(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg =
          err instanceof AgendaApiError
            ? err.problem.message
            : `No fue posible conectar con saas-agenda en ${agendaApiUrl}.`
        setLiveLoadErrorKey(requestKey)
        setBanner({ tone: 'critical', text: msg })
      })

    return () => {
      cancelled = true
    }
  }, [agendaApiUrl, agendaClient, authMode, currentTenant, isSpecialistSelf, targetSpecialistId])

  if (!currentUser || !currentTenant) return null

  const loading =
    authMode === 'identity' &&
    Boolean(liveScopeKey) &&
    liveSnapshot?.loadedKey !== liveScopeKey &&
    liveLoadErrorKey !== liveScopeKey

  const mockClinic = clinicSchedules.find((c) => c.tenantId === currentTenant.id)
  const mockSpec = specialistSchedules.find(
    (s) => s.tenantId === currentTenant.id && s.specialistId === targetSpecialistId,
  )

  const activeLive =
    authMode === 'identity' && liveSnapshot?.loadedKey === liveScopeKey ? liveSnapshot : null

  const baseClinicSlots =
    authMode === 'identity' ? (activeLive?.clinicSlots ?? []) : (mockClinic?.slots ?? [])
  const clinicSlotsDraft =
    clinicDraftOverride?.key === clinicDraftKey ? clinicDraftOverride.slots : baseClinicSlots
  const setClinicSlotsDraft = (next: ScheduleTimeSlot[]) =>
    setClinicDraftOverride({ key: clinicDraftKey, slots: next })

  const clinicUpdatedInfo =
    authMode === 'identity'
      ? (activeLive?.clinicUpdatedInfo ?? null)
      : mockClinic?.updatedByName && mockClinic.updatedAtGmt6
        ? `${mockClinic.updatedByName} (${formatDateTimeGmt6(mockClinic.updatedAtGmt6)})`
        : null

  const baseFallback =
    authMode === 'identity'
      ? (activeLive?.useClinicFallback ?? true)
      : (mockSpec?.useClinicFallback ?? true)
  const useClinicFallback =
    fallbackDraftOverride?.key === specDraftKey ? fallbackDraftOverride.value : baseFallback
  const setUseClinicFallback = (next: boolean) =>
    setFallbackDraftOverride({ key: specDraftKey, value: next })

  const baseSpecSlots =
    authMode === 'identity' ? (activeLive?.ownSlots ?? []) : (mockSpec?.ownSlots ?? [])
  const specSlotsDraft =
    specSlotsDraftOverride?.key === specDraftKey ? specSlotsDraftOverride.slots : baseSpecSlots
  const setSpecSlotsDraft = (next: ScheduleTimeSlot[]) =>
    setSpecSlotsDraftOverride({ key: specDraftKey, slots: next })

  const specEffectivePreview =
    authMode === 'identity'
      ? (activeLive?.effectiveWeeklySlots ?? [])
      : useClinicFallback
        ? clinicSlotsDraft
        : specSlotsDraft

  const specExceptions =
    authMode === 'identity'
      ? (activeLive?.exceptions ?? [])
      : scheduleExceptions
          .filter((e) => e.tenantId === currentTenant.id && e.specialistId === targetSpecialistId)
          .sort((a, b) => a.dateGmt6.localeCompare(b.dateGmt6))

  const liveOwnAppointments = activeLive?.ownAppointments ?? []

  const handleSaveClinicSchedule = async () => {
    setBanner(null)
    if (authMode === 'identity') {
      setSubmitting(true)
      try {
        await agendaClient.updateClinicSchedule(clinicSlotsDraft)
        setClinicDraftOverride(null)
        await loadLiveSchedules()
        setBanner({
          tone: 'positive',
          text: 'Horario general de la clínica guardado en saas-agenda (GMT-6).',
        })
      } catch (err) {
        const msg =
          err instanceof AgendaApiError
            ? extractConflictDetails(err.problem.message, err.problem.conflictingSlotsGmt6)
            : 'Error al guardar el horario general de la clínica.'
        setBanner({ tone: 'critical', text: msg })
      } finally {
        setSubmitting(false)
      }
      return
    }

    const decision = updateClinicSchedule(clinicSlotsDraft)
    if (decision.allowed) {
      setClinicDraftOverride(null)
    }
    setBanner(
      decision.allowed
        ? { tone: 'positive', text: 'Horario general de la clínica actualizado (GMT-6).' }
        : {
            tone: 'critical',
            text: extractConflictDetails(decision.message, decision.conflictingSlotsGmt6),
          },
    )
  }

  const handleSaveSpecialistSchedule = async () => {
    if (!targetSpecialistId) return
    setBanner(null)
    if (authMode === 'identity') {
      setSubmitting(true)
      try {
        await agendaClient.updateSpecialistSchedule(targetSpecialistId, {
          useClinicFallback,
          slots: useClinicFallback ? [] : specSlotsDraft,
        })
        setFallbackDraftOverride(null)
        setSpecSlotsDraftOverride(null)
        await loadLiveSchedules()
        setBanner({
          tone: 'positive',
          text: useClinicFallback
            ? 'El especialista ahora hereda el horario general de la clínica.'
            : 'Horario propio del especialista guardado en saas-agenda (GMT-6).',
        })
      } catch (err) {
        const msg =
          err instanceof AgendaApiError
            ? extractConflictDetails(err.problem.message, err.problem.conflictingSlotsGmt6)
            : 'Error al guardar el horario del especialista.'
        setBanner({ tone: 'critical', text: msg })
      } finally {
        setSubmitting(false)
      }
      return
    }

    const decision = updateSpecialistSchedule(
      targetSpecialistId,
      useClinicFallback,
      useClinicFallback ? [] : specSlotsDraft,
    )
    if (decision.allowed) {
      setFallbackDraftOverride(null)
      setSpecSlotsDraftOverride(null)
    }
    setBanner(
      decision.allowed
        ? { tone: 'positive', text: 'Horario del especialista actualizado en GMT-6.' }
        : {
            tone: 'critical',
            text: extractConflictDetails(decision.message, decision.conflictingSlotsGmt6),
          },
    )
  }

  const handleSaveException = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!targetSpecialistId) return
    setBanner(null)

    if (authMode === 'identity') {
      setSubmitting(true)
      try {
        await agendaClient.upsertSpecialistException(targetSpecialistId, {
          dateGmt6: exDate,
          isUnavailable: exIsUnavailable,
          customStartTime: exIsUnavailable ? null : exStartTime,
          customEndTime: exIsUnavailable ? null : exEndTime,
          reason: exReason,
        })
        setExReason('')
        await loadLiveSchedules()
        setBanner({
          tone: 'positive',
          text: 'Excepción de fecha registrada en saas-agenda (GMT-6).',
        })
      } catch (err) {
        const msg =
          err instanceof AgendaApiError
            ? extractConflictDetails(err.problem.message, err.problem.conflictingSlotsGmt6)
            : 'Error al registrar la excepción.'
        setBanner({ tone: 'critical', text: msg })
      } finally {
        setSubmitting(false)
      }
      return
    }

    const decision = upsertSpecialistException({
      specialistId: targetSpecialistId,
      dateGmt6: exDate,
      isUnavailable: exIsUnavailable,
      customStartTime: exIsUnavailable ? null : exStartTime,
      customEndTime: exIsUnavailable ? null : exEndTime,
      reason: exReason,
    })
    if (decision.allowed) {
      setExReason('')
      setBanner({ tone: 'positive', text: 'Excepción de fecha guardada (GMT-6).' })
    } else {
      setBanner({
        tone: 'critical',
        text: extractConflictDetails(decision.message, decision.conflictingSlotsGmt6),
      })
    }
  }

  const handleDeleteException = async (exceptionId: string) => {
    if (!targetSpecialistId) return
    setBanner(null)
    if (authMode === 'identity') {
      setSubmitting(true)
      try {
        await agendaClient.deleteSpecialistException(targetSpecialistId, exceptionId)
        await loadLiveSchedules()
        setBanner({ tone: 'positive', text: 'Excepción eliminada correctamente.' })
      } catch (err) {
        const msg =
          err instanceof AgendaApiError
            ? extractConflictDetails(err.problem.message, err.problem.conflictingSlotsGmt6)
            : 'No fue posible eliminar la excepción.'
        setBanner({ tone: 'critical', text: msg })
      } finally {
        setSubmitting(false)
      }
      return
    }

    const decision = deleteSpecialistException(targetSpecialistId, exceptionId)
    setBanner(
      decision.allowed
        ? { tone: 'positive', text: 'Excepción eliminada.' }
        : {
            tone: 'critical',
            text: extractConflictDetails(decision.message, decision.conflictingSlotsGmt6),
          },
    )
  }

  const ownMockAppointments: Appointment[] = !isSpecialistSelf
    ? []
    : appointments
        .filter((a) => a.tenantId === currentTenant.id && a.specialistId === currentUser.id)
        .sort((a, b) => a.scheduledStartGmt6.localeCompare(b.scheduledStartGmt6))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-divider pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-medium text-clinical">
            CU-18 · HORARIOS Y DISPONIBILIDAD (GMT-6)
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
            {isSpecialistSelf
              ? 'Mi horario laboral y mis próximas citas'
              : 'Horarios de clínica y por especialista'}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {isSpecialistSelf
              ? 'Configura tus turnos semanales y días inhábiles. Cualquier recorte que afecte citas futuras activas es bloqueado para proteger la agenda (D-AG-01 / D-AG-03).'
              : 'Define el horario base de la clínica y los turnos específicos de cada especialista con validación anti-huérfanas contra citas futuras.'}
          </p>
        </div>

        <StatusBadge
          tone={authMode === 'identity' ? 'info' : 'neutral'}
          label={authMode === 'identity' ? 'Agenda API (.NET 10)' : 'Modo Mock local'}
        />
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

      {loading ? (
        <p className="text-sm text-ink-muted">Sincronizando horarios con saas-agenda...</p>
      ) : null}

      {/* Horario base de la clínica */}
      <section className="rounded-lg border border-divider bg-surface p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">
              Horario general de la clínica {isSpecialistSelf ? '(solo referencia)' : '(respaldo)'}
            </h2>
            <p className="text-xs text-ink-muted">
              Aplica automáticamente a los especialistas que heredan el horario general.
              {clinicUpdatedInfo ? ` Último cambio: ${clinicUpdatedInfo}.` : ''}
            </p>
          </div>
          {!isSpecialistSelf ? (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSaveClinicSchedule}
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 text-sm font-semibold text-white hover:bg-clinical-hover disabled:opacity-60"
            >
              Guardar horario de clínica
            </button>
          ) : null}
        </div>

        <WeeklySlotsEditor
          slots={clinicSlotsDraft}
          onChange={setClinicSlotsDraft}
          idPrefix="clinic-sched"
          disabled={isSpecialistSelf}
        />
      </section>

      {/* Horario por especialista */}
      <section className="rounded-lg border border-divider bg-surface p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink">
              {isSpecialistSelf ? 'Mi horario propio semanal' : 'Horario específico por especialista'}
            </h2>
            <p className="text-xs text-ink-muted">
              Un especialista puede atender en días u horas distintos al horario general de la clínica.
            </p>
          </div>

          {!isSpecialistSelf ? (
            <div className="min-w-64">
              <label htmlFor="schedule-spec-select" className="block text-xs font-semibold text-ink">
                Especialista seleccionado
              </label>
              <select
                id="schedule-spec-select"
                value={targetSpecialistId}
                onChange={(e) => setSelectedSpecialistId(e.target.value)}
                className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
              >
                {activeSpecialists.map((spec) => (
                  <option key={spec.id} value={spec.id}>
                    {spec.fullName} ({spec.specialty ?? 'General'})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <label className="flex items-center gap-2.5 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={useClinicFallback}
            onChange={(e) => setUseClinicFallback(e.target.checked)}
            className="h-4 w-4 rounded border-slate-400"
          />
          <span>Usar horario general de la clínica como respaldo</span>
        </label>

        {useClinicFallback ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-ink-muted">
            <p className="font-semibold text-ink">Horario semanal efectivo actual (heredado de clínica):</p>
            <p className="mt-1 font-mono">
              {specEffectivePreview.length === 0
                ? 'Sin bloques configurados en la clínica.'
                : specEffectivePreview
                    .map((s) => `${SCHEDULE_DAY_LABELS[s.dayOfWeek]} ${s.startTime}-${s.endTime}`)
                    .join(' · ')}
            </p>
          </div>
        ) : (
          <WeeklySlotsEditor
            slots={specSlotsDraft}
            onChange={setSpecSlotsDraft}
            idPrefix="spec-sched"
          />
        )}

        <div className="flex justify-end">
          <button
            type="button"
            disabled={submitting || !targetSpecialistId}
            onClick={handleSaveSpecialistSchedule}
            className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 text-sm font-semibold text-white hover:bg-clinical-hover disabled:opacity-60"
          >
            Guardar horario del especialista
          </button>
        </div>
      </section>

      {/* Excepciones por fecha */}
      <section className="rounded-lg border border-divider bg-surface p-5 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-ink">
            Excepciones por fecha (días inhábiles o jornadas especiales)
          </h2>
          <p className="text-xs text-ink-muted">
            Las excepciones prevalecen sobre el horario semanal. Si existen citas futuras activas en esa fecha, se exigirá reprogramarlas antes de bloquear el día.
          </p>
        </div>

        <form onSubmit={handleSaveException} className="grid gap-3 rounded-md border border-divider bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="ex-date" className="block text-xs font-semibold text-ink">
              Fecha (GMT-6)
            </label>
            <input
              id="ex-date"
              type="date"
              value={exDate}
              onChange={(e) => setExDate(e.target.value)}
              required
              className="mt-1 w-full rounded-md border bg-surface px-3 py-2 font-mono text-sm"
            />
          </div>

          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                checked={exIsUnavailable}
                onChange={(e) => setExIsUnavailable(e.target.checked)}
                className="h-4 w-4 rounded border-slate-400"
              />
              <span>Día inhábil (no labora)</span>
            </label>
          </div>

          {!exIsUnavailable ? (
            <>
              <div>
                <label htmlFor="ex-start" className="block text-xs font-semibold text-ink">
                  Inicio especial (HH:mm)
                </label>
                <input
                  id="ex-start"
                  type="time"
                  value={exStartTime}
                  onChange={(e) => setExStartTime(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border bg-surface px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label htmlFor="ex-end" className="block text-xs font-semibold text-ink">
                  Fin especial (HH:mm)
                </label>
                <input
                  id="ex-end"
                  type="time"
                  value={exEndTime}
                  onChange={(e) => setExEndTime(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border bg-surface px-3 py-2 font-mono text-sm"
                />
              </div>
            </>
          ) : null}

          <div className="sm:col-span-2 lg:col-span-3">
            <label htmlFor="ex-reason" className="block text-xs font-semibold text-ink">
              Motivo de la excepción <span aria-hidden="true">*</span>
            </label>
            <input
              id="ex-reason"
              type="text"
              value={exReason}
              onChange={(e) => setExReason(e.target.value)}
              required
              placeholder="Ej. Congreso médico o guardia dominical extraordinaria"
              className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting || !targetSpecialistId}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-clinical px-4 py-2 text-sm font-semibold text-white hover:bg-clinical-hover disabled:opacity-60"
            >
              Guardar excepción
            </button>
          </div>
        </form>

        {specExceptions.length === 0 ? (
          <p className="text-xs text-ink-muted">
            Sin excepciones próximas registradas para este especialista.
          </p>
        ) : (
          <ul className="space-y-2">
            {specExceptions.map((ex) => (
              <li
                key={ex.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-divider bg-surface px-3 py-2.5 text-sm"
              >
                <div>
                  <p className="font-semibold text-ink">
                    {formatDateGmt6(ex.dateGmt6)}:{' '}
                    {ex.isUnavailable
                      ? 'Día inhábil completo'
                      : `Jornada especial ${ex.customStartTime} - ${ex.customEndTime} GMT-6`}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {ex.reason} (registrado por {ex.createdByName})
                  </p>
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleDeleteException(ex.id)}
                  className="min-h-11 rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-critical-ink hover:bg-critical-bg"
                >
                  Eliminar excepción
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Próximas citas en solo lectura para Especialista (D-AG-01) */}
      {isSpecialistSelf ? (
        <section className="rounded-lg border border-divider bg-surface p-5 space-y-3">
          <div>
            <h2 className="text-lg font-bold text-ink">Mis citas programadas (solo lectura)</h2>
            <p className="text-xs text-ink-muted">
              La creación, reprogramación y actualización administrativa de citas corresponde a AdminClinica y personal auxiliar (D-AG-01).
            </p>
          </div>

          {authMode === 'identity' ? (
            liveOwnAppointments.length === 0 ? (
              <p className="text-xs text-ink-muted">Sin citas registradas en saas-agenda.</p>
            ) : (
              <ul className="space-y-2">
                {liveOwnAppointments.map((apt) => {
                  const patientInfo = resolvePatientDisplayBff(apt.patientId, patients)
                  return (
                    <li
                      key={apt.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-divider bg-slate-50 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-mono text-xs font-semibold text-ink">
                          {formatDateTimeGmt6(apt.scheduledStartGmt6)} ({apt.durationMinutes} min)
                        </p>
                        <p className="font-semibold text-ink">
                          {patientInfo.fullName} ({patientInfo.patientCode})
                        </p>
                        <p className="text-xs text-ink-muted">{apt.reason}</p>
                      </div>
                      <StatusBadge tone="info" label={apt.status} />
                    </li>
                  )
                })}
              </ul>
            )
          ) : ownMockAppointments.length === 0 ? (
            <p className="text-xs text-ink-muted">Sin citas registradas.</p>
          ) : (
            <ul className="space-y-2">
              {ownMockAppointments.map((apt) => {
                const patient = patients.find((p) => p.id === apt.patientId)
                return (
                  <li
                    key={apt.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-divider bg-slate-50 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-mono text-xs font-semibold text-ink">
                        {formatDateTimeGmt6(apt.scheduledStartGmt6)} ({apt.durationMinutes} min)
                      </p>
                      <p className="font-semibold text-ink">
                        {patient?.fullName ?? apt.patientId} ({patient?.patientCode})
                      </p>
                      <p className="text-xs text-ink-muted">{apt.reason}</p>
                    </div>
                    <StatusBadge tone="info" label={apt.status} />
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  )
}
