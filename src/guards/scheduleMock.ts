import type {
  Appointment,
  ClinicScheduleConfig,
  PolicyDecision,
  ScheduleDayOfWeek,
  SchedulePolicyDecision,
  ScheduleTimeSlot,
  SpecialistScheduleConfig,
  SpecialistScheduleException,
} from '../domain/types.ts'

const JS_DAY_TO_SCHEDULE: ScheduleDayOfWeek[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
]

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function formatMinutes(totalMin: number): string {
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0')
  const mm = String(totalMin % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export function dayOfWeekFromGmt6Date(dateGmt6: string): ScheduleDayOfWeek | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateGmt6.trim())
  if (!m) return null
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0))
  return JS_DAY_TO_SCHEDULE[dt.getUTCDay()] ?? null
}

export function validateWeeklySlotsMock(slots: ScheduleTimeSlot[]): PolicyDecision {
  for (const slot of slots) {
    const sMin = toMinutes(slot.startTime)
    const eMin = toMinutes(slot.endTime)
    if (sMin === null || eMin === null || eMin - sMin < 10) {
      return {
        allowed: false,
        code: 'INVALID_SCHEDULE_BLOCK',
        message: 'Cada bloque laboral requiere horas válidas HH:mm con duración mínima de 10 minutos.',
      }
    }
  }

  const days = new Set(slots.map((s) => s.dayOfWeek))
  for (const day of days) {
    const ordered = slots
      .filter((s) => s.dayOfWeek === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
    for (let i = 1; i < ordered.length; i += 1) {
      if (ordered[i].startTime < ordered[i - 1].endTime) {
        return {
          allowed: false,
          code: 'OVERLAPPING_SCHEDULE_BLOCKS',
          message: `Los bloques horarios del día ${day} se traslapan entre sí.`,
        }
      }
    }
  }

  return { allowed: true }
}

export interface EffectiveMockDay {
  source: 'EXCEPTION' | 'SPECIALIST_SCHEDULE' | 'CLINIC_FALLBACK' | 'UNCONFIGURED'
  isUnavailable: boolean
  reason: string | null
  blocks: ScheduleTimeSlot[]
}

export function resolveEffectiveDayScheduleMock(
  dateGmt6: string,
  specialistId: string,
  tenantId: string,
  specialistSchedules: SpecialistScheduleConfig[],
  clinicSchedules: ClinicScheduleConfig[],
  exceptions: SpecialistScheduleException[],
): EffectiveMockDay {
  const ex = exceptions.find(
    (e) =>
      e.tenantId === tenantId &&
      e.specialistId === specialistId &&
      e.dateGmt6 === dateGmt6,
  )
  if (ex) {
    if (ex.isUnavailable || !ex.customStartTime || !ex.customEndTime) {
      return {
        source: 'EXCEPTION',
        isUnavailable: true,
        reason: ex.reason,
        blocks: [],
      }
    }
    const day = dayOfWeekFromGmt6Date(dateGmt6) ?? 'MONDAY'
    return {
      source: 'EXCEPTION',
      isUnavailable: false,
      reason: ex.reason,
      blocks: [
        {
          dayOfWeek: day,
          startTime: ex.customStartTime,
          endTime: ex.customEndTime,
        },
      ],
    }
  }

  const day = dayOfWeekFromGmt6Date(dateGmt6)
  if (!day) {
    return { source: 'UNCONFIGURED', isUnavailable: true, reason: 'Fecha inválida.', blocks: [] }
  }

  const spec = specialistSchedules.find(
    (s) => s.tenantId === tenantId && s.specialistId === specialistId,
  )
  if (spec && !spec.useClinicFallback) {
    const blocks = spec.ownSlots
      .filter((s) => s.dayOfWeek === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
    return {
      source: 'SPECIALIST_SCHEDULE',
      isUnavailable: blocks.length === 0,
      reason: blocks.length === 0 ? 'Día sin bloques asignados para el especialista.' : null,
      blocks,
    }
  }

  const clinic = clinicSchedules.find((c) => c.tenantId === tenantId)
  if (clinic) {
    const blocks = clinic.slots
      .filter((s) => s.dayOfWeek === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
    return {
      source: 'CLINIC_FALLBACK',
      isUnavailable: blocks.length === 0,
      reason: blocks.length === 0 ? 'Día no laborable en horario general de la clínica.' : null,
      blocks,
    }
  }

  return {
    source: 'UNCONFIGURED',
    isUnavailable: true,
    reason: 'Ni el especialista ni la clínica cuentan con horario configurado.',
    blocks: [],
  }
}

export function validateAppointmentFitsScheduleMock(
  scheduledStartGmt6: string,
  durationMinutes: number,
  effectiveDay: EffectiveMockDay,
): PolicyDecision {
  const startMin = toMinutes(scheduledStartGmt6.slice(11, 16))
  if (startMin === null) {
    return {
      allowed: false,
      code: 'INVALID_SCHEDULE_TIME',
      message: 'Hora de cita inválida en GMT-6.',
    }
  }
  const endMin = startMin + durationMinutes
  if (endMin >= 24 * 60) {
    return {
      allowed: false,
      code: 'OUTSIDE_WORKING_HOURS',
      message: 'La cita excede el día en GMT-6.',
    }
  }

  if (effectiveDay.source === 'UNCONFIGURED') {
    return {
      allowed: false,
      code: 'SCHEDULE_NOT_CONFIGURED',
      message: 'Configura el horario laboral de la clínica o del especialista antes de agendar.',
    }
  }

  if (effectiveDay.isUnavailable || effectiveDay.blocks.length === 0) {
    return {
      allowed: false,
      code: 'OUTSIDE_WORKING_HOURS',
      message: `El especialista no atiende ese día (${effectiveDay.reason ?? 'sin jornada'}).`,
    }
  }

  const endTimeStr = formatMinutes(endMin)
  const startTimeStr = formatMinutes(startMin)
  const fits = effectiveDay.blocks.some(
    (b) => startTimeStr >= b.startTime && endTimeStr <= b.endTime,
  )

  if (!fits) {
    const label = effectiveDay.blocks.map((b) => `${b.startTime}-${b.endTime}`).join(', ')
    return {
      allowed: false,
      code: 'OUTSIDE_WORKING_HOURS',
      message: `La cita (${startTimeStr}-${endTimeStr} GMT-6) queda fuera del horario habilitado (${label}).`,
    }
  }

  return { allowed: true }
}

export function validateScheduleChangeAgainstAppointmentsMock(
  candidateAppointments: Appointment[],
  resolveProposedDay: (apt: Appointment, dateGmt6: string) => EffectiveMockDay,
): SchedulePolicyDecision {
  const conflicts: { id: string; label: string }[] = []

  for (const apt of candidateAppointments) {
    if (apt.status === 'CANCELADA' || apt.status === 'NO_ASISTIO') continue
    const dateGmt6 = apt.scheduledStartGmt6.slice(0, 10)
    const startMin = toMinutes(apt.scheduledStartGmt6.slice(11, 16)) ?? 0
    const endMin = startMin + apt.durationMinutes
    const effective = resolveProposedDay(apt, dateGmt6)
    const check = validateAppointmentFitsScheduleMock(
      apt.scheduledStartGmt6,
      apt.durationMinutes,
      effective,
    )
    if (!check.allowed) {
      conflicts.push({
        id: apt.id,
        label: `${dateGmt6} ${formatMinutes(startMin)}-${formatMinutes(endMin)} (-06:00)`,
      })
    }
  }

  if (conflicts.length > 0) {
    const preview = conflicts
      .slice(0, 3)
      .map((c) => c.label)
      .join('; ')
    return {
      allowed: false,
      code: 'SCHEDULE_CHANGE_CONFLICTS_WITH_APPOINTMENTS',
      message: `No es posible aplicar el cambio porque ${conflicts.length} cita(s) activa(s) quedarían fuera de jornada: ${preview}. Reprograma o cancela esas citas primero.`,
      conflictingCount: conflicts.length,
      conflictingAppointmentIds: conflicts.map((c) => c.id),
      conflictingSlotsGmt6: conflicts.map((c) => c.label),
    }
  }

  return { allowed: true }
}

export function computeMockAvailability(
  dateGmt6: string,
  specialistId: string,
  tenantId: string,
  durationMinutes: number,
  clinicSchedules: ClinicScheduleConfig[],
  specialistSchedules: SpecialistScheduleConfig[],
  exceptions: SpecialistScheduleException[],
  appointments: Appointment[],
) {
  const effective = resolveEffectiveDayScheduleMock(
    dateGmt6,
    specialistId,
    tenantId,
    specialistSchedules,
    clinicSchedules,
    exceptions,
  )

  const activeDayAppointments = appointments.filter(
    (a) =>
      a.tenantId === tenantId &&
      a.specialistId === specialistId &&
      a.status !== 'CANCELADA' &&
      a.status !== 'NO_ASISTIO' &&
      a.scheduledStartGmt6.slice(0, 10) === dateGmt6,
  )

  const freeSlots: Array<{
    startTime: string
    endTime: string
    scheduledStartGmt6: string
    scheduledEndGmt6: string
  }> = []

  if (!effective.isUnavailable && durationMinutes >= 10) {
    for (const block of effective.blocks) {
      const sMin = toMinutes(block.startTime) ?? 0
      const eMin = toMinutes(block.endTime) ?? 0
      for (let cursor = sMin; cursor + durationMinutes <= eMin; cursor += durationMinutes) {
        const endCursor = cursor + durationMinutes
        const startStr = formatMinutes(cursor)
        const endStr = formatMinutes(endCursor)
        const overlaps = activeDayAppointments.some((a) => {
          const aptStart = toMinutes(a.scheduledStartGmt6.slice(11, 16)) ?? 0
          const aptEnd = aptStart + a.durationMinutes
          return cursor < aptEnd && endCursor > aptStart
        })
        if (!overlaps) {
          freeSlots.push({
            startTime: startStr,
            endTime: endStr,
            scheduledStartGmt6: `${dateGmt6}T${startStr}:00-06:00`,
            scheduledEndGmt6: `${dateGmt6}T${endStr}:00-06:00`,
          })
        }
      }
    }
  }

  return {
    tenantId,
    specialistId,
    dateGmt6,
    durationMinutes,
    source: effective.source,
    isUnavailable: effective.isUnavailable,
    reason: effective.reason,
    workingBlocks: effective.blocks,
    busyBlocks: activeDayAppointments.map((a) => {
      const aptStart = toMinutes(a.scheduledStartGmt6.slice(11, 16)) ?? 0
      const aptEnd = aptStart + a.durationMinutes
      return {
        appointmentId: a.id,
        scheduledStartGmt6: a.scheduledStartGmt6,
        scheduledEndGmt6: `${dateGmt6}T${formatMinutes(aptEnd)}:00-06:00`,
        status: a.status,
      }
    }),
    availableSlots: freeSlots,
  }
}
