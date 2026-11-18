import type { ReactNode } from 'react'
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
} from './Icons.tsx'

export type BadgeTone = 'positive' | 'warning' | 'critical' | 'info' | 'neutral'

interface StatusBadgeProps {
  tone: BadgeTone
  label: string
  icon?: ReactNode
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  positive: 'bg-positive-bg text-positive-ink border-green-300',
  warning: 'bg-warning-bg text-warning-ink border-amber-300',
  critical: 'bg-critical-bg text-critical-ink border-red-300',
  info: 'bg-info-bg text-info-ink border-blue-300',
  neutral: 'bg-slate-100 text-slate-800 border-slate-300',
}

function defaultIconForTone(tone: BadgeTone): ReactNode {
  switch (tone) {
    case 'positive':
      return <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" />
    case 'warning':
      return <ClockIcon className="h-3.5 w-3.5 shrink-0" />
    case 'critical':
      return <XCircleIcon className="h-3.5 w-3.5 shrink-0" />
    case 'info':
      return <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0" />
    case 'neutral':
      return <ClockIcon className="h-3.5 w-3.5 shrink-0" />
  }
}

/** Etiqueta de estado accesible: siempre combina color con alto contraste, icono y texto explícito. */
export function StatusBadge({ tone, label, icon }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold leading-none ${TONE_CLASSES[tone]}`}
    >
      {icon ?? defaultIconForTone(tone)}
      <span>{label}</span>
    </span>
  )
}
