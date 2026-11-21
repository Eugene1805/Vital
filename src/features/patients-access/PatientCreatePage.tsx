import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { StatusBadge } from '../../design-system/StatusBadge.tsx'
import { useMockStore } from '../../mocks/useMockStore.ts'

export function PatientCreatePage() {
  const { currentUser, currentTenant, accounts, createPatientWithRecord } = useMockStore()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [birthDateGmt6, setBirthDateGmt6] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [emergencyContact, setEmergencyContact] = useState('')
  const [primarySpecialistId, setPrimarySpecialistId] = useState('')
  const [allowDuplicateOverride, setAllowDuplicateOverride] = useState(false)

  const [touched, setTouched] = useState<{
    fullName?: boolean
    birthDateGmt6?: boolean
    phone?: boolean
  }>({})
  const [submitError, setSubmitError] = useState<{ code: string; message: string } | null>(null)
  const [specialistCreatedResult, setSpecialistCreatedResult] = useState<{
    patientCode: string
    recordId: string
  } | null>(null)

  const nameRef = useRef<HTMLInputElement>(null)
  const birthRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)

  if (!currentUser || !currentTenant) return null

  const canAssignInitial =
    currentUser.role === 'ADMIN_CLINICA' ||
    (currentUser.role === 'AUXILIAR' && currentUser.permissions.canAssignInitialPrimary)

  const activeSpecialists = accounts.filter(
    (a) => a.tenantId === currentTenant.id && a.role === 'ESPECIALISTA' && a.active,
  )

  const nameError = !fullName.trim() ? 'El nombre completo del paciente es obligatorio.' : undefined
  const birthError = !birthDateGmt6 ? 'Selecciona la fecha de nacimiento (GMT-6).' : undefined
  const phoneError = !phone.trim() ? 'Ingresa un teléfono de contacto.' : undefined

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setTouched({ fullName: true, birthDateGmt6: true, phone: true })
    setSubmitError(null)

    if (nameError) {
      nameRef.current?.focus()
      return
    }
    if (birthError) {
      birthRef.current?.focus()
      return
    }
    if (phoneError) {
      phoneRef.current?.focus()
      return
    }

    const result = createPatientWithRecord({
      fullName,
      birthDateGmt6,
      phone,
      email,
      emergencyContact,
      primarySpecialistId: canAssignInitial && primarySpecialistId ? primarySpecialistId : null,
      allowDuplicateOverride,
    })

    if (!result.allowed) {
      setSubmitError({ code: result.code, message: result.message })
      return
    }

    if (currentUser.role === 'ESPECIALISTA') {
      setSpecialistCreatedResult({
        patientCode: result.patientCode,
        recordId: result.recordId,
      })
      return
    }

    navigate(`/admin/patients/${result.patientId}`, { replace: true })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="border-b border-divider pb-5">
        <p className="font-mono text-xs font-medium text-clinical">CU-01 + CU-02 (Operación conjunta)</p>
        <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
          Registrar paciente y crear expediente
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Al guardar se crea automáticamente su único expediente en {currentTenant.name}, sin exigir historia clínica inicial.
        </p>
      </div>

      {currentUser.role === 'ESPECIALISTA' ? (
        <div className="rounded-lg border border-blue-300 bg-info-bg p-4 text-sm text-info-ink">
          <strong>Regla para Especialista registrante (CU-01 A6):</strong> registrar a un paciente
          crea su expediente como <strong>Pendiente de asignación</strong>, pero{' '}
          <strong>no</strong> te convierte en responsable principal ni te otorga lectura clínica
          automática.
        </div>
      ) : null}

      {specialistCreatedResult ? (
        <section
          role="status"
          className="space-y-4 rounded-lg border border-green-300 bg-surface p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-mono text-xs font-semibold text-positive-ink">
                ALTA CONJUNTA COMPLETADA ({specialistCreatedResult.patientCode})
              </p>
              <h2 className="mt-1 text-lg font-bold text-ink">
                Paciente registrado con expediente pendiente de asignación
              </h2>
            </div>
            <StatusBadge tone="warning" label="Pendiente de asignación" />
          </div>
          <p className="text-sm text-ink-muted">
            El expediente nació sin responsable principal asignado. Para acceder a su Espacio Clínico
            debes esperar a que AdminClinica o un auxiliar habilitado te asigne como principal o
            tratante.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to={`/clinical/records/${specialistCreatedResult.recordId}`}
              className="inline-flex min-h-11 items-center rounded-md border border-amber-700 bg-warning-bg px-4 py-2 text-sm font-semibold text-warning-ink hover:bg-amber-100"
            >
              Intentar abrir Espacio Clínico (prueba CU-01 A6)
            </Link>
            <Link
              to="/clinical/records"
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 text-sm font-semibold text-white hover:bg-clinical-hover"
            >
              Volver a mis expedientes
            </Link>
          </div>
        </section>
      ) : (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-5 rounded-lg border border-divider bg-surface p-6"
        >
          <fieldset className="space-y-4">
            <legend className="text-base font-bold text-ink">
              Datos administrativos del paciente
            </legend>

            <div>
              <label htmlFor="patient-fullname" className="block text-sm font-semibold text-ink">
                Nombre completo <span aria-hidden="true">*</span>
              </label>
              <input
                ref={nameRef}
                id="patient-fullname"
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value)
                  setSubmitError(null)
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, fullName: true }))}
                required
                aria-invalid={Boolean(touched.fullName && nameError)}
                aria-describedby={touched.fullName && nameError ? 'patient-name-error' : undefined}
                className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="María Fernanda Castro"
              />
              {touched.fullName && nameError ? (
                <p id="patient-name-error" role="alert" className="mt-1 text-sm font-medium text-critical-ink">
                  {nameError}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="patient-birth" className="block text-sm font-semibold text-ink">
                  Fecha de nacimiento (GMT-6) <span aria-hidden="true">*</span>
                </label>
                <input
                  ref={birthRef}
                  id="patient-birth"
                  type="date"
                  value={birthDateGmt6}
                  onChange={(e) => {
                    setBirthDateGmt6(e.target.value)
                    setSubmitError(null)
                  }}
                  onBlur={() => setTouched((prev) => ({ ...prev, birthDateGmt6: true }))}
                  required
                  aria-invalid={Boolean(touched.birthDateGmt6 && birthError)}
                  aria-describedby={
                    touched.birthDateGmt6 && birthError ? 'patient-birth-error' : undefined
                  }
                  className="mt-1.5 w-full rounded-md border px-3 py-2 font-mono text-sm"
                />
                {touched.birthDateGmt6 && birthError ? (
                  <p id="patient-birth-error" role="alert" className="mt-1 text-sm font-medium text-critical-ink">
                    {birthError}
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor="patient-phone" className="block text-sm font-semibold text-ink">
                  Teléfono de contacto <span aria-hidden="true">*</span>
                </label>
                <input
                  ref={phoneRef}
                  id="patient-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value)
                    setSubmitError(null)
                  }}
                  onBlur={() => setTouched((prev) => ({ ...prev, phone: true }))}
                  required
                  aria-invalid={Boolean(touched.phone && phoneError)}
                  aria-describedby={touched.phone && phoneError ? 'patient-phone-error' : undefined}
                  className="mt-1.5 w-full rounded-md border px-3 py-2 font-mono text-sm"
                  placeholder="555-0140-8820"
                />
                {touched.phone && phoneError ? (
                  <p id="patient-phone-error" role="alert" className="mt-1 text-sm font-medium text-critical-ink">
                    {phoneError}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="patient-email" className="block text-sm font-semibold text-ink">
                  Correo electrónico (opcional)
                </label>
                <input
                  id="patient-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  spellCheck={false}
                  className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="paciente@ejemplo.demo"
                />
              </div>
              <div>
                <label htmlFor="patient-emergency" className="block text-sm font-semibold text-ink">
                  Contacto de emergencia (opcional)
                </label>
                <input
                  id="patient-emergency"
                  type="text"
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Nombre y teléfono"
                />
              </div>
            </div>
          </fieldset>

          {canAssignInitial ? (
            <fieldset className="rounded-md border border-divider bg-slate-50 p-4">
              <legend className="px-1 text-sm font-bold text-ink">
                Inicialización de expediente (CU-02)
              </legend>
              <label htmlFor="initial-primary-specialist" className="block text-sm font-semibold text-ink">
                Especialista responsable principal inicial (opcional)
              </label>
              <select
                id="initial-primary-specialist"
                value={primarySpecialistId}
                onChange={(e) => setPrimarySpecialistId(e.target.value)}
                className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Dejar pendiente de asignación</option>
                {activeSpecialists.map((spec) => (
                  <option key={spec.id} value={spec.id}>
                    {spec.fullName} ({spec.specialty ?? 'General'})
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-ink-muted">
                Si aún no se conoce al médico responsable, déjalo sin asignar. No se creará ningún
                vínculo ficticio ni acceso clínico implícito.
              </p>
            </fieldset>
          ) : null}

          {submitError ? (
            <div
              role="alert"
              className="space-y-2 rounded-md border border-red-300 bg-critical-bg p-3.5 text-sm text-critical-ink"
            >
              <p className="font-medium">{submitError.message}</p>
              {submitError.code === 'POSSIBLE_DUPLICATE' ? (
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={allowDuplicateOverride}
                    onChange={(e) => setAllowDuplicateOverride(e.target.checked)}
                  />
                  <span>Confirmo que es una persona distinta y deseo continuar el registro (CU-01 A2).</span>
                </label>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3 border-t border-divider pt-4">
            <Link
              to={currentUser.role === 'ESPECIALISTA' ? '/clinical/records' : '/admin/patients'}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-100"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 text-sm font-semibold text-white hover:bg-clinical-hover"
            >
              Guardar paciente y crear expediente
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
