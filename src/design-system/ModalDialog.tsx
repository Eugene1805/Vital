import { useEffect, useId, useRef, type ReactNode } from 'react'
import { CloseIcon } from './Icons.tsx'

interface ModalDialogProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  closeOnBackdrop?: boolean
  children: ReactNode
}

/**
 * Diálogo modal basado en el elemento nativo <dialog>.
 * Delega top-layer, inert del fondo, foco y cierre con Escape al navegador.
 */
export function ModalDialog({
  open,
  title,
  description,
  onClose,
  closeOnBackdrop = true,
  children,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleClose = () => {
      dialog.returnValue = ''
      onClose()
    }

    dialog.addEventListener('close', handleClose)
    return () => {
      dialog.removeEventListener('close', handleClose)
    }
  }, [onClose])

  // Fallback para navegadores sin soporte nativo de closedby="any"
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !closeOnBackdrop || 'closedBy' in HTMLDialogElement.prototype) {
      return
    }

    let pressedOutside = false
    const isOutside = (e: PointerEvent) => {
      const rect = dialog.getBoundingClientRect()
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      )
    }

    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e)
    }
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e) && dialog.open) {
        dialog.close()
      }
      pressedOutside = false
    }

    dialog.addEventListener('pointerdown', onPointerDown)
    dialog.addEventListener('pointerup', onPointerUp)
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown)
      dialog.removeEventListener('pointerup', onPointerUp)
    }
  }, [closeOnBackdrop])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      closedby={closeOnBackdrop ? 'any' : 'closerequest'}
      className="shadow-xl"
    >
      <div className="flex max-h-[inherit] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-divider px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-sm text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Cerrar ventana"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-surface text-ink hover:bg-slate-100"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </dialog>
  )
}
