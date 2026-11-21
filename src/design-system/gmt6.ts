const GMT6_OFFSET_MS = -6 * 60 * 60 * 1000

const MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function toShiftedUtcDate(date: Date): Date {
  return new Date(date.getTime() + GMT6_OFFSET_MS)
}

/** Devuelve la marca temporal actual serializada explícitamente con offset -06:00 (GMT-6). */
export function nowGmt6Iso(reference = new Date()): string {
  const shifted = toShiftedUtcDate(reference)
  const y = shifted.getUTCFullYear()
  const m = pad2(shifted.getUTCMonth() + 1)
  const d = pad2(shifted.getUTCDate())
  const hh = pad2(shifted.getUTCHours())
  const mm = pad2(shifted.getUTCMinutes())
  const ss = pad2(shifted.getUTCSeconds())
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}-06:00`
}

/** Devuelve la fecha actual YYYY-MM-DD en GMT-6. */
export function todayGmt6Date(reference = new Date()): string {
  return nowGmt6Iso(reference).slice(0, 10)
}

/** Suma meses manteniendo día acotado al último día del mes en formato YYYY-MM-DDTHH:mm:ss-06:00. */
export function addMonthsGmt6Iso(baseIso: string, months: number): string {
  const parsed = new Date(baseIso)
  const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  const shifted = toShiftedUtcDate(base)
  const targetYear = shifted.getUTCFullYear()
  const targetMonthZero = shifted.getUTCMonth() + months
  const originalDay = shifted.getUTCDate()

  const normalizedYear = targetYear + Math.floor(targetMonthZero / 12)
  const normalizedMonthZero = ((targetMonthZero % 12) + 12) % 12
  const maxDayInMonth = new Date(Date.UTC(normalizedYear, normalizedMonthZero + 1, 0)).getUTCDate()
  const clampedDay = Math.min(originalDay, maxDayInMonth)

  const y = normalizedYear
  const m = pad2(normalizedMonthZero + 1)
  const d = pad2(clampedDay)
  const hh = pad2(shifted.getUTCHours())
  const mm = pad2(shifted.getUTCMinutes())
  const ss = pad2(shifted.getUTCSeconds())
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}-06:00`
}

/** Formatea una marca ISO a representación legible fija en GMT-6. */
export function formatDateTimeGmt6(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) {
    return iso
  }
  const shifted = toShiftedUtcDate(parsed)
  const day = pad2(shifted.getUTCDate())
  const month = MONTHS_ES[shifted.getUTCMonth()]
  const year = shifted.getUTCFullYear()
  const hh = pad2(shifted.getUTCHours())
  const mm = pad2(shifted.getUTCMinutes())
  return `${day} ${month} ${year}, ${hh}:${mm} GMT-6`
}

/** Formatea una fecha YYYY-MM-DD sin corrimiento por zona horaria local. */
export function formatDateGmt6(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
  if (!match) {
    return dateStr
  }
  const [, year, monthStr, day] = match
  const monthIndex = Number(monthStr) - 1
  const monthLabel = MONTHS_ES[monthIndex] ?? monthStr
  return `${day} ${monthLabel} ${year} (GMT-6)`
}
