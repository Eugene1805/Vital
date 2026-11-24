import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { formatDateTimeGmt6, nowGmt6Iso } from '../../design-system/gmt6.ts'
import { ModalDialog } from '../../design-system/ModalDialog.tsx'
import { StatusBadge, type BadgeTone } from '../../design-system/StatusBadge.tsx'
import type {
  ChargeConceptCategory,
  ChargeLineItem,
  ChargeSheetStatus,
  ClinicalEncounter,
  PaymentMethod,
  SpecialistCutStatus,
} from '../../domain/types.ts'
import {
  BILLABLE_CONCEPTS,
  PAYMENT_METHOD_LABELS,
  calculateChargeItemsTotal,
  formatMxn,
  summarizePaymentsByMethod,
} from '../../guards/billingBi.ts'
import {
  getActiveGrantForOperation,
  isInAuxiliaryOrdinaryScope,
} from '../../guards/objectAccess.ts'
import { useMockStore } from '../../mocks/useMockStore.ts'
import {
  resolveActiveSpecialistsBff,
  resolvePatientDisplayBff,
  resolveSpecialistDisplayBff,
} from '../../services/agendaClient.ts'
import {
  BillingApiError,
  KNOWN_SEEDED_ENCOUNTERS,
  createBillingClient,
  normalizeTotalsByMethod,
  resolveEncounterDisplayBff,
  toBillingEncounterUuid,
  type BillableConceptDto,
  type BillingAdjustmentDto,
  type BillingAdjustmentTargetType,
  type BillingChargeSheetDto,
  type BillingPatientPaymentDto,
  type BillingSpecialistCutDto,
} from '../../services/billingClient.ts'

type BillingTabKey = 'charges' | 'cuts'

const BILLING_TABS: Array<{ key: BillingTabKey; label: string }> = [
  { key: 'charges', label: 'Cargos y cobros (CU-20 / CU-21)' },
  { key: 'cuts', label: 'Cortes por especialista (CU-22 / PC-05)' },
]

interface LiveBillingSnapshot {
  key: string
  billingDisabled: boolean
  concepts: BillableConceptDto[]
  sheets: BillingChargeSheetDto[]
  payments: BillingPatientPaymentDto[]
  cuts: BillingSpecialistCutDto[]
  adjustments: BillingAdjustmentDto[]
  error: string | null
}

interface ChargeModalTarget {
  encounterId: string
  encounterLabel: string
}

interface PaymentModalTarget {
  encounterId: string
  chargeSheetId: string | null
  expectedAmountMxn: number
}

interface ReviseCutModalTarget {
  id: string
  folio: string
  specialistId: string
  periodStartGmt6: string
  periodEndGmt6: string
  paymentIds: string[]
  lastObservationNote: string | null
}

function chargeTone(status: ChargeSheetStatus | 'SIN_CARGOS'): BadgeTone {
  switch (status) {
    case 'SIN_CARGOS':
      return 'neutral'
    case 'ABIERTA':
      return 'warning'
    case 'REVISADA':
      return 'info'
    case 'COBRADA':
      return 'positive'
  }
}

function cutTone(status: SpecialistCutStatus): BadgeTone {
  switch (status) {
    case 'PREPARADO':
      return 'info'
    case 'OBSERVADO':
      return 'warning'
    case 'CONFIRMADO':
      return 'positive'
  }
}

async function fetchLiveBillingSnapshot(
  billingClient: ReturnType<typeof createBillingClient>,
  scopeKey: string,
  billingApiUrl: string,
): Promise<LiveBillingSnapshot> {
  try {
    const [catalogRes, sheetsRes, paymentsRes, cutsRes, adjustmentsRes] = await Promise.all([
      billingClient.listCatalogConcepts().catch(() => ({ total: 0, items: [] as BillableConceptDto[] })),
      billingClient.listChargeSheets(),
      billingClient.listPayments(),
      billingClient.listCuts(),
      billingClient.listAdjustments().catch(() => ({ total: 0, items: [] as BillingAdjustmentDto[] })),
    ])

    return {
      key: scopeKey,
      billingDisabled: false,
      concepts: catalogRes.items,
      sheets: sheetsRes.items,
      payments: paymentsRes.items,
      cuts: cutsRes.items,
      adjustments: adjustmentsRes.items,
      error: null,
    }
  } catch (err) {
    if (err instanceof BillingApiError && err.problem.code === 'BILLING_DISABLED') {
      return {
        key: scopeKey,
        billingDisabled: true,
        concepts: [],
        sheets: [],
        payments: [],
        cuts: [],
        adjustments: [],
        error: null,
      }
    }

    const message =
      err instanceof BillingApiError
        ? err.problem.message
        : `No fue posible conectar con saas-billing en ${billingApiUrl}.`

    return {
      key: scopeKey,
      billingDisabled: false,
      concepts: [],
      sheets: [],
      payments: [],
      cuts: [],
      adjustments: [],
      error: message,
    }
  }
}

export function BillingHubPage() {
  const tableHeadingId = useId()
  const cutsHeadingId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const {
    currentUser,
    currentTenant,
    authMode,
    billingApiUrl,
    identityDirectory,
    refreshIdentityDirectory,
    accounts,
    patients,
    records,
    grants,
    encounters,
    chargeSheets,
    payments,
    cuts,
    saveChargeSheet,
    markChargeSheetReviewed,
    reopenChargeSheet,
    recordFullPayment,
    prepareSpecialistCut,
    reviseSpecialistCut,
  } = useMockStore()

  const [billingClient] = useState(() => createBillingClient(billingApiUrl))
  const [liveSnapshot, setLiveSnapshot] = useState<LiveBillingSnapshot | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [activeTab, setActiveTab] = useState<BillingTabKey>('charges')
  const [banner, setBanner] = useState<{ tone: 'positive' | 'critical'; text: string } | null>(null)

  const [newSheetEncounterId, setNewSheetEncounterId] = useState(
    KNOWN_SEEDED_ENCOUNTERS[3]?.encounterId ?? '',
  )
  const [chargeTarget, setChargeTarget] = useState<ChargeModalTarget | null>(null)
  const [draftItems, setDraftItems] = useState<ChargeLineItem[]>([])
  const [selectedConceptCode, setSelectedConceptCode] = useState(BILLABLE_CONCEPTS[0].code)
  const [lineSeq, setLineSeq] = useState(100)
  const [chargeModalError, setChargeModalError] = useState<string | null>(null)

  const [paymentTarget, setPaymentTarget] = useState<PaymentModalTarget | null>(null)
  const [payAmountInput, setPayAmountInput] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod>('EFECTIVO')
  const [payError, setPayError] = useState<string | null>(null)

  const [prepCutOpen, setPrepCutOpen] = useState(false)
  const [cutSpecialistId, setCutSpecialistId] = useState('')
  const [cutStartDate, setCutStartDate] = useState('2026-11-01')
  const [cutEndDate, setCutEndDate] = useState('2026-11-30')
  const [cutPaymentIds, setCutPaymentIds] = useState<string[]>([])
  const [prepCutError, setPrepCutError] = useState<string | null>(null)

  const [reviseTargetCut, setReviseTargetCut] = useState<ReviseCutModalTarget | null>(null)
  const [reviseStartDate, setReviseStartDate] = useState('2026-11-01')
  const [reviseEndDate, setReviseEndDate] = useState('2026-11-30')
  const [revisePaymentIds, setRevisePaymentIds] = useState<string[]>([])
  const [reviseNote, setReviseNote] = useState('')
  const [reviseError, setReviseError] = useState<string | null>(null)

  const [adjModalOpen, setAdjModalOpen] = useState(false)
  const [adjTargetType, setAdjTargetType] = useState<BillingAdjustmentTargetType>('CUT')
  const [adjTargetId, setAdjTargetId] = useState('')
  const [adjDeltaInput, setAdjDeltaInput] = useState('')
  const [adjReason, setAdjReason] = useState('')
  const [adjError, setAdjError] = useState<string | null>(null)

  const isLive = authMode === 'identity'
  const liveScopeKey =
    isLive && currentTenant && currentUser ? `${currentTenant.id}:${currentUser.id}` : ''

  const reloadLiveBilling = useCallback(async () => {
    if (!liveScopeKey) return
    const next = await fetchLiveBillingSnapshot(billingClient, liveScopeKey, billingApiUrl)
    setLiveSnapshot(next)
  }, [billingApiUrl, billingClient, liveScopeKey])

  useEffect(() => {
    if (isLive && currentUser?.role === 'ADMIN_CLINICA') {
      void refreshIdentityDirectory()
    }
  }, [currentUser?.role, isLive, refreshIdentityDirectory])

  useEffect(() => {
    if (!liveScopeKey) return
    let cancelled = false

    void fetchLiveBillingSnapshot(billingClient, liveScopeKey, billingApiUrl).then((next) => {
      if (!cancelled) {
        setLiveSnapshot(next)
      }
    })

    return () => {
      cancelled = true
    }
  }, [billingApiUrl, billingClient, liveScopeKey])

  if (!currentUser || !currentTenant) return null

  const activeLiveSnapshot =
    isLive && liveSnapshot && liveSnapshot.key === liveScopeKey ? liveSnapshot : null
  const liveLoading = isLive && !activeLiveSnapshot
  const billingDisabled = isLive ? Boolean(activeLiveSnapshot?.billingDisabled) : !currentTenant.usesBilling

  if (billingDisabled) {
    return (
      <div className="space-y-6">
        <div className="border-b border-divider pb-5">
          <p className="font-mono text-xs font-medium text-clinical">CU-20 A1 · CU-21 A6</p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
            Billing, cobros y cortes
          </h1>
        </div>
        <div className="rounded-lg border border-blue-300 bg-info-bg p-6 text-info-ink">
          <StatusBadge tone="info" label="No aplica" />
          <h2 className="mt-3 text-lg font-bold">
            Clínica sin Billing de pacientes habilitado
          </h2>
          <p className="mt-1 text-sm">
            {currentTenant.name} opera sin el módulo económico opcional. Las atenciones clínicas (`CU-03`) y la consulta de agenda (`CU-18`) continúan funcionando normalmente sin requerir cargos ni cobros.
          </p>
        </div>
      </div>
    )
  }

  const nowIso = nowGmt6Iso()

  const catalogOptions =
    isLive && activeLiveSnapshot && activeLiveSnapshot.concepts.length > 0
      ? activeLiveSnapshot.concepts.map((c) => ({
          code: c.code,
          label: c.label,
          category: c.category as ChargeConceptCategory,
          defaultPriceMxn: c.defaultPriceMxn,
        }))
      : BILLABLE_CONCEPTS

  const staffForBff = isLive
    ? (identityDirectory?.accounts ?? []).map((a) => ({
        id: a.id,
        fullName: a.fullName,
        specialty: a.specialty,
      }))
    : accounts.map((a) => ({ id: a.id, fullName: a.fullName, specialty: a.specialty }))

  const visibleEncounters = !isLive
    ? encounters
        .filter((enc) => {
          if (enc.tenantId !== currentTenant.id) return false
          if (currentUser.role === 'ADMIN_CLINICA') return true
          if (currentUser.role === 'AUXILIAR') {
            const record = records.find((r) => r.id === enc.recordId)
            if (!record) return false
            const inOrdinary = isInAuxiliaryOrdinaryScope(currentUser, record)
            const grant = getActiveGrantForOperation(
              currentUser,
              enc.patientId,
              'MANAGE_BILLING',
              grants,
              nowIso,
            )
            return inOrdinary || Boolean(grant)
          }
          return false
        })
        .sort((a, b) => b.startedAtGmt6.localeCompare(a.startedAtGmt6))
    : []

  const liveSheets = activeLiveSnapshot?.sheets ?? []
  const livePayments = activeLiveSnapshot?.payments ?? []
  const liveCuts = activeLiveSnapshot?.cuts ?? []
  const liveAdjustments = activeLiveSnapshot?.adjustments ?? []

  const tenantPayments = !isLive
    ? payments
        .filter((p) => p.tenantId === currentTenant.id)
        .sort((a, b) => b.paidAtGmt6.localeCompare(a.paidAtGmt6))
    : []

  const tenantCuts = !isLive
    ? cuts
        .filter((c) => c.tenantId === currentTenant.id)
        .sort((a, b) => b.updatedAtGmt6.localeCompare(a.updatedAtGmt6))
    : []

  const observedCutsCount = isLive
    ? liveCuts.filter((c) => c.status === 'OBSERVADO').length
    : tenantCuts.filter((c) => c.status === 'OBSERVADO').length

  const tenantSpecialists = isLive
    ? resolveActiveSpecialistsBff(currentTenant.id, identityDirectory?.accounts ?? null).map((s) => ({
        id: s.id,
        fullName: s.fullName,
        specialty: s.specialty,
      }))
    : accounts
        .filter((a) => a.tenantId === currentTenant.id && a.role === 'ESPECIALISTA')
        .map((a) => ({ id: a.id, fullName: a.fullName, specialty: a.specialty }))

  const seededEncountersWithoutSheet = isLive
    ? KNOWN_SEEDED_ENCOUNTERS.filter(
        (opt) => !liveSheets.some((s) => s.encounterId.toLowerCase() === opt.encounterId.toLowerCase()),
      )
    : []

  const handleTabKeyDown = (index: number, e: KeyboardEvent<HTMLButtonElement>) => {
    let nextIndex: number | null = null
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % BILLING_TABS.length
    else if (e.key === 'ArrowLeft')
      nextIndex = (index - 1 + BILLING_TABS.length) % BILLING_TABS.length
    else if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = BILLING_TABS.length - 1
    if (nextIndex !== null) {
      e.preventDefault()
      setActiveTab(BILLING_TABS[nextIndex].key)
      tabRefs.current[nextIndex]?.focus()
    }
  }

  const seedDefaultDraftItems = () => {
    const defConcept = catalogOptions[0] ?? BILLABLE_CONCEPTS[0]
    setDraftItems([
      {
        id: `line-${lineSeq}`,
        conceptCode: defConcept.code,
        description: defConcept.label,
        category: defConcept.category,
        quantity: 1,
        unitPriceMxn: defConcept.defaultPriceMxn,
      },
    ])
    setLineSeq((n) => n + 1)
  }

  const openManageChargesMock = (enc: ClinicalEncounter) => {
    const existing = chargeSheets.find((c) => c.encounterId === enc.id)
    if (existing) {
      setDraftItems(existing.items.map((item) => ({ ...item })))
    } else {
      seedDefaultDraftItems()
    }
    setChargeModalError(null)
    setChargeTarget({ encounterId: enc.id, encounterLabel: enc.id })
  }

  const openManageChargesLive = (encounterId: string, existingSheet: BillingChargeSheetDto | null) => {
    if (existingSheet) {
      setDraftItems(
        existingSheet.items.map((item) => ({
          id: item.id,
          conceptCode: item.conceptCode,
          description: item.description,
          category: item.category,
          quantity: item.quantity,
          unitPriceMxn: item.unitPriceMxn,
        })),
      )
    } else {
      seedDefaultDraftItems()
    }
    const encDisplay = resolveEncounterDisplayBff(encounterId, encounters)
    setChargeModalError(null)
    setChargeTarget({
      encounterId: toBillingEncounterUuid(encounterId),
      encounterLabel: encDisplay.displayId,
    })
  }

  const handleAddConceptLine = () => {
    const concept =
      catalogOptions.find((c) => c.code === selectedConceptCode) ??
      catalogOptions[0] ??
      BILLABLE_CONCEPTS[0]
    setDraftItems((prev) => [
      ...prev,
      {
        id: `line-${lineSeq}`,
        conceptCode: concept.code,
        description: concept.label,
        category: concept.category,
        quantity: 1,
        unitPriceMxn: concept.defaultPriceMxn,
      },
    ])
    setLineSeq((n) => n + 1)
  }

  const handleSaveChargesSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!chargeTarget) return
    setChargeModalError(null)

    if (!isLive) {
      const decision = saveChargeSheet(chargeTarget.encounterId, draftItems)
      if (!decision.allowed) {
        setChargeModalError(decision.message)
        return
      }
      setChargeTarget(null)
      setBanner({
        tone: 'positive',
        text: 'Hoja de cargos guardada en estado ABIERTA. Confirma revisión para habilitar cobro (CU-20).',
      })
      return
    }

    setSubmitting(true)
    try {
      await billingClient.upsertChargeSheet(
        chargeTarget.encounterId,
        draftItems.map((item) => ({
          conceptCode: item.conceptCode,
          description: item.description,
          category: item.category,
          quantity: item.quantity,
          unitPriceMxn: item.unitPriceMxn,
        })),
      )
      await reloadLiveBilling()
      setChargeTarget(null)
      setBanner({
        tone: 'positive',
        text: 'Hoja de cargos persistida en saas-billing (ABIERTA). Confirma revisión para habilitar cobro (CU-20).',
      })
    } catch (err) {
      setChargeModalError(
        err instanceof BillingApiError
          ? err.problem.message
          : 'No fue posible guardar la hoja de cargos en saas-billing.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleMarkReviewedMock = (encounterId: string) => {
    const decision = markChargeSheetReviewed(encounterId)
    setBanner(
      decision.allowed
        ? {
            tone: 'positive',
            text: 'Hoja marcada como REVISADA. Ya permite registrar cobro completo si la atención está FINALIZADA (CU-21).',
          }
        : { tone: 'critical', text: decision.message },
    )
  }

  const handleMarkReviewedLive = async (chargeSheetId: string) => {
    setSubmitting(true)
    try {
      await billingClient.reviewChargeSheet(chargeSheetId)
      await reloadLiveBilling()
      setBanner({
        tone: 'positive',
        text: 'Hoja marcada como REVISADA en saas-billing. Ya permite registrar cobro completo si la atención está FINALIZADA (CU-21).',
      })
    } catch (err) {
      setBanner({
        tone: 'critical',
        text:
          err instanceof BillingApiError
            ? err.problem.message
            : 'No fue posible marcar la hoja como REVISADA.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleReopenSheetMock = (encounterId: string) => {
    const decision = reopenChargeSheet(encounterId)
    setBanner(
      decision.allowed
        ? { tone: 'positive', text: 'Hoja devuelta a estado ABIERTA para corrección antes de cobrar.' }
        : { tone: 'critical', text: decision.message },
    )
  }

  const handleReopenSheetLive = async (chargeSheetId: string) => {
    setSubmitting(true)
    try {
      await billingClient.reopenChargeSheet(chargeSheetId)
      await reloadLiveBilling()
      setBanner({
        tone: 'positive',
        text: 'Hoja devuelta a estado ABIERTA en saas-billing para corrección antes de cobrar.',
      })
    } catch (err) {
      setBanner({
        tone: 'critical',
        text:
          err instanceof BillingApiError
            ? err.problem.message
            : 'No fue posible reabrir la hoja de cargos.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const openPaymentModalMock = (enc: ClinicalEncounter) => {
    const sheet = chargeSheets.find((c) => c.encounterId === enc.id)
    const total = sheet ? sheet.totalMxn : 0
    setPaymentTarget({ encounterId: enc.id, chargeSheetId: sheet?.id ?? null, expectedAmountMxn: total })
    setPayAmountInput(String(total))
    setPayMethod('EFECTIVO')
    setPayError(null)
  }

  const openPaymentModalLive = (sheet: BillingChargeSheetDto) => {
    setPaymentTarget({
      encounterId: sheet.encounterId,
      chargeSheetId: sheet.id,
      expectedAmountMxn: sheet.totalMxn,
    })
    setPayAmountInput(String(sheet.totalMxn))
    setPayMethod('EFECTIVO')
    setPayError(null)
  }

  const handleRecordPaymentSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!paymentTarget) return
    setPayError(null)
    const amountNum = Number(payAmountInput)

    if (!isLive) {
      const decision = recordFullPayment(paymentTarget.encounterId, amountNum, payMethod)
      if (!decision.allowed) {
        setPayError(decision.message)
        return
      }
      setPaymentTarget(null)
      setBanner({
        tone: 'positive',
        text: 'Cobro completo registrado en GMT-6. Hoja actualizada a COBRADA sin modificar el estado de la nota clínica.',
      })
      return
    }

    if (!paymentTarget.chargeSheetId) {
      setPayError('Falta identificar la hoja de cargos para registrar el cobro.')
      return
    }

    setSubmitting(true)
    try {
      const created = await billingClient.recordFullPayment({
        chargeSheetId: paymentTarget.chargeSheetId,
        amountMxn: amountNum,
        method: payMethod,
      })
      await reloadLiveBilling()
      setPaymentTarget(null)
      setBanner({
        tone: 'positive',
        text: `Cobro completo ${created.folio} registrado en saas-billing (GMT-6). Hoja actualizada a COBRADA sin exigir nota clínica cerrada.`,
      })
    } catch (err) {
      setPayError(
        err instanceof BillingApiError
          ? err.problem.message
          : 'No fue posible registrar el cobro completo en saas-billing.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const getUnassignedPaymentsForSpecialist = (specId: string, start: string, end: string) => {
    const source = isLive ? livePayments : tenantPayments
    return source.filter((p) => {
      const dateStr = p.paidAtGmt6.slice(0, 10)
      return (
        p.specialistId.toLowerCase() === specId.toLowerCase() &&
        p.cutId === null &&
        (!start || dateStr >= start) &&
        (!end || dateStr <= end)
      )
    })
  }

  const openPrepareCutModal = () => {
    const unassignedSource = isLive ? livePayments : tenantPayments
    const defaultSpec =
      tenantSpecialists.find((s) =>
        unassignedSource.some(
          (p) => p.specialistId.toLowerCase() === s.id.toLowerCase() && p.cutId === null,
        ),
      ) ?? tenantSpecialists[0]
    const specId = defaultSpec?.id ?? ''
    const start = '2026-11-01'
    const end = '2026-11-30'
    const eligible = specId ? getUnassignedPaymentsForSpecialist(specId, start, end) : []
    setCutSpecialistId(specId)
    setCutStartDate(start)
    setCutEndDate(end)
    setCutPaymentIds(eligible.map((p) => p.id))
    setPrepCutError(null)
    setPrepCutOpen(true)
  }

  const handlePrepSpecialistChange = (nextSpecId: string) => {
    setCutSpecialistId(nextSpecId)
    const eligible = getUnassignedPaymentsForSpecialist(nextSpecId, cutStartDate, cutEndDate)
    setCutPaymentIds(eligible.map((p) => p.id))
  }

  const handlePrepCutSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPrepCutError(null)

    if (!isLive) {
      const decision = prepareSpecialistCut(cutSpecialistId, cutStartDate, cutEndDate, cutPaymentIds)
      if (!decision.allowed) {
        setPrepCutError(decision.message)
        return
      }
      setPrepCutOpen(false)
      setBanner({
        tone: 'positive',
        text: 'Corte preparado en estado PREPARADO (GMT-6). Queda pendiente de revisión del especialista en CU-23.',
      })
      return
    }

    setSubmitting(true)
    try {
      const created = await billingClient.prepareCut({
        specialistId: cutSpecialistId,
        periodStartGmt6: cutStartDate,
        periodEndGmt6: cutEndDate,
        paymentIds: cutPaymentIds,
      })
      await reloadLiveBilling()
      setPrepCutOpen(false)
      setBanner({
        tone: 'positive',
        text: `Corte ${created.folio} preparado en saas-billing (estado PREPARADO, GMT-6). Queda pendiente de revisión del especialista en CU-23.`,
      })
    } catch (err) {
      setPrepCutError(
        err instanceof BillingApiError
          ? err.problem.message
          : 'No fue posible preparar el corte en saas-billing.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const openReviseCutModal = async (cut: ReviseCutModalTarget) => {
    setReviseError(null)
    setReviseStartDate(cut.periodStartGmt6)
    setReviseEndDate(cut.periodEndGmt6)
    setReviseNote('')

    if (!isLive) {
      setRevisePaymentIds([...cut.paymentIds])
      setReviseTargetCut(cut)
      return
    }

    setSubmitting(true)
    try {
      const detail = await billingClient.getCutById(cut.id)
      setRevisePaymentIds(detail.payments.map((p) => p.id))
      setReviseTargetCut({
        ...cut,
        paymentIds: detail.payments.map((p) => p.id),
      })
    } catch (err) {
      setBanner({
        tone: 'critical',
        text:
          err instanceof BillingApiError
            ? err.problem.message
            : 'No fue posible cargar el detalle del corte desde saas-billing.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleReviseCutSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!reviseTargetCut) return
    setReviseError(null)

    if (!isLive) {
      const decision = reviseSpecialistCut(
        reviseTargetCut.id,
        reviseStartDate,
        reviseEndDate,
        revisePaymentIds,
        reviseNote,
      )
      if (!decision.allowed) {
        setReviseError(decision.message)
        return
      }
      setReviseTargetCut(null)
      setReviseNote('')
      setBanner({
        tone: 'positive',
        text: 'Corrección trazable guardada y corte reenviado a estado PREPARADO para nueva revisión del especialista.',
      })
      return
    }

    setSubmitting(true)
    try {
      const revised = await billingClient.reviseCut(reviseTargetCut.id, {
        periodStartGmt6: reviseStartDate,
        periodEndGmt6: reviseEndDate,
        paymentIds: revisePaymentIds,
        adjustmentNote: reviseNote,
      })
      await reloadLiveBilling()
      setReviseTargetCut(null)
      setReviseNote('')
      setBanner({
        tone: 'positive',
        text: `Corrección trazable guardada en ${revised.folio} y reenviado a PREPARADO para revisión del especialista.`,
      })
    } catch (err) {
      setReviseError(
        err instanceof BillingApiError
          ? err.problem.message
          : 'No fue posible actualizar el corte en saas-billing.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const confirmedLiveCuts = liveCuts.filter((c) => c.status === 'CONFIRMADO')

  const openAdjustmentModal = () => {
    const defaultType: BillingAdjustmentTargetType = confirmedLiveCuts.length > 0 ? 'CUT' : 'PAYMENT'
    const defaultTarget =
      defaultType === 'CUT' ? confirmedLiveCuts[0]?.id ?? '' : livePayments[0]?.id ?? ''
    setAdjTargetType(defaultType)
    setAdjTargetId(defaultTarget)
    setAdjDeltaInput('')
    setAdjReason('')
    setAdjError(null)
    setAdjModalOpen(true)
  }

  const handleAdjustmentSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setAdjError(null)
    const delta = Number(adjDeltaInput)
    if (!adjTargetId) {
      setAdjError('Selecciona el cobro o corte confirmado al que se vincula el ajuste.')
      return
    }
    if (!Number.isFinite(delta) || delta === 0) {
      setAdjError('Indica un monto de ajuste (Delta MXN) distinto de cero.')
      return
    }
    if (!adjReason.trim()) {
      setAdjError('El motivo del ajuste compensatorio es obligatorio (D-BI-01).')
      return
    }

    setSubmitting(true)
    try {
      const created = await billingClient.createAdjustment({
        targetType: adjTargetType,
        targetId: adjTargetId,
        deltaMxn: delta,
        reason: adjReason,
      })
      await reloadLiveBilling()
      setAdjModalOpen(false)
      setBanner({
        tone: 'positive',
        text: `Ajuste compensatorio ${created.folio} (${formatMxn(created.deltaMxn)}) registrado sin alterar folios originales.`,
      })
    } catch (err) {
      setAdjError(
        err instanceof BillingApiError
          ? err.problem.message
          : 'No fue posible registrar el ajuste compensatorio en saas-billing.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const prepEligiblePayments = getUnassignedPaymentsForSpecialist(
    cutSpecialistId,
    cutStartDate,
    cutEndDate,
  )
  const prepSummary = summarizePaymentsByMethod(
    prepEligiblePayments
      .filter((p) => cutPaymentIds.includes(p.id))
      .map((p) => ({
        id: p.id,
        folio: p.folio,
        tenantId: p.tenantId,
        chargeSheetId: p.chargeSheetId,
        encounterId: p.encounterId,
        patientId: p.patientId,
        specialistId: p.specialistId,
        amountMxn: p.amountMxn,
        method: p.method,
        paidAtGmt6: p.paidAtGmt6,
        collectedByAccountId: p.collectedByAccountId,
        collectedByName: p.collectedByName,
        cutId: p.cutId,
      })),
  )

  const reviseEligiblePayments = reviseTargetCut
    ? (isLive ? livePayments : tenantPayments).filter((p) => {
        const dateStr = p.paidAtGmt6.slice(0, 10)
        return (
          p.specialistId.toLowerCase() === reviseTargetCut.specialistId.toLowerCase() &&
          (p.cutId === null || p.cutId === reviseTargetCut.id) &&
          (!reviseStartDate || dateStr >= reviseStartDate) &&
          (!reviseEndDate || dateStr <= reviseEndDate)
        )
      })
    : []

  const reviseSummary = summarizePaymentsByMethod(
    reviseEligiblePayments
      .filter((p) => revisePaymentIds.includes(p.id))
      .map((p) => ({
        id: p.id,
        folio: p.folio,
        tenantId: p.tenantId,
        chargeSheetId: p.chargeSheetId,
        encounterId: p.encounterId,
        patientId: p.patientId,
        specialistId: p.specialistId,
        amountMxn: p.amountMxn,
        method: p.method,
        paidAtGmt6: p.paidAtGmt6,
        collectedByAccountId: p.collectedByAccountId,
        collectedByName: p.collectedByName,
        cutId: p.cutId,
      })),
  )

  return (
    <div className="space-y-6">
      <div className="border-b border-divider pb-5">
        <p className="font-mono text-xs font-medium text-clinical">
          CU-20 · CU-21 · CU-22 · PC-05
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
          Cargos, cobros completos y cortes (GMT-6)
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Operación económica administrativa sin acceso al contenido de notas clínicas. Solo cobros completos (`efectivo`, `tarjeta`, `transferencia`) sobre atención finalizada y hoja revisada.
        </p>
      </div>

      {isLive ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs text-teal-950">
          <span>
            Conectado a <strong className="font-mono">saas-billing</strong> ({billingApiUrl})
          </span>
          <button
            type="button"
            disabled={liveLoading || submitting}
            onClick={() => void reloadLiveBilling()}
            className="inline-flex min-h-9 items-center rounded border border-teal-400 bg-white px-3 py-1 font-semibold text-teal-900 hover:bg-teal-100 disabled:opacity-60"
          >
            Recargar datos
          </button>
        </div>
      ) : null}

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

      {isLive && activeLiveSnapshot?.error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-300 bg-critical-bg px-4 py-3 text-sm text-critical-ink"
        >
          <span>{activeLiveSnapshot.error}</span>
          <button
            type="button"
            onClick={() => void reloadLiveBilling()}
            className="inline-flex min-h-10 items-center rounded border border-red-400 bg-white px-3 py-1 text-xs font-semibold text-critical-ink"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {liveLoading ? (
        <div className="rounded-lg border border-divider bg-surface p-6 text-sm text-ink-muted">
          Cargando hojas de cargo, cobros y cortes desde saas-billing...
        </div>
      ) : (
        <div className="rounded-lg border border-divider bg-surface">
          <div
            role="tablist"
            aria-label="Secciones de Billing y Cortes"
            className="vital-tablist px-2 pt-2"
          >
            {BILLING_TABS.map((tab, index) => {
              const selected = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  ref={(el) => {
                    tabRefs.current[index] = el
                  }}
                  type="button"
                  role="tab"
                  id={`billing-tab-${tab.key}`}
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveTab(tab.key)}
                  onKeyDown={(e) => handleTabKeyDown(index, e)}
                  className="vital-tab"
                >
                  {tab.label}
                  {tab.key === 'cuts' && observedCutsCount > 0 ? (
                    <span className="ml-2 rounded bg-warning-bg px-1.5 py-0.5 font-mono text-xs text-warning-ink">
                      {observedCutsCount} observado
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          {/* TAB 1: CU-20 y CU-21 */}
          <div
            role="tabpanel"
            aria-labelledby="billing-tab-charges"
            hidden={activeTab !== 'charges'}
            tabIndex={activeTab === 'charges' ? 0 : undefined}
          >
            <div className="space-y-6 p-5">
              <div>
                <h2 className="text-lg font-bold text-ink">
                  Hojas de cargo por atención médica (CU-20 / CU-21)
                </h2>
                <p className="text-xs text-ink-muted">
                  La vista muestra únicamente metadatos administrativos de la atención. Un borrador clínico abierto no impide cobrar si la atención está FINALIZADA y los cargos están en estado REVISADA.
                </p>
              </div>

              {isLive && seededEncountersWithoutSheet.length > 0 ? (
                <div className="flex flex-col gap-3 rounded-lg border border-divider bg-slate-50 p-4 text-xs sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label htmlFor="live-new-sheet-encounter" className="block font-semibold text-ink">
                      Inicializar hoja de cargo para atención sin cargos previos (CU-20)
                    </label>
                    <select
                      id="live-new-sheet-encounter"
                      value={
                        seededEncountersWithoutSheet.some(
                          (item) => item.encounterId === newSheetEncounterId,
                        )
                          ? newSheetEncounterId
                          : seededEncountersWithoutSheet[0].encounterId
                      }
                      onChange={(e) => setNewSheetEncounterId(e.target.value)}
                      className="mt-1 w-full rounded-md border bg-surface px-3 py-2 font-mono text-xs"
                    >
                      {seededEncountersWithoutSheet.map((opt) => (
                        <option key={opt.encounterId} value={opt.encounterId}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      const targetId = seededEncountersWithoutSheet.some(
                        (item) => item.encounterId === newSheetEncounterId,
                      )
                        ? newSheetEncounterId
                        : seededEncountersWithoutSheet[0].encounterId
                      openManageChargesLive(targetId, null)
                    }}
                    className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-slate-100 disabled:opacity-60"
                  >
                    Abrir nueva hoja de cargos
                  </button>
                </div>
              ) : null}

              {!isLive ? (
                visibleEncounters.length === 0 ? (
                  <p className="rounded-md border border-divider bg-slate-50 p-4 text-sm text-ink-muted">
                    No existen atenciones en tu ámbito autorizado dentro de esta clínica.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {visibleEncounters.map((enc) => {
                      const patient = patients.find((p) => p.id === enc.patientId)
                      const sheet = chargeSheets.find((c) => c.encounterId === enc.id)
                      const sheetStatus = sheet?.status ?? 'SIN_CARGOS'
                      const canEdit = sheetStatus !== 'COBRADA'

                      return (
                        <li
                          key={enc.id}
                          className="rounded-lg border border-divider bg-slate-50 p-4 text-sm"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs font-bold text-clinical">
                                  {patient?.patientCode ?? enc.patientId}
                                </span>
                                <span className="font-bold text-ink">
                                  {patient?.fullName ?? enc.patientId}
                                </span>
                                <span className="font-mono text-xs text-ink-muted">
                                  ({enc.id})
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-ink-muted">
                                Especialista: <strong className="text-ink">{enc.specialistName}</strong> ({enc.specialty}) · Inicio: {formatDateTimeGmt6(enc.startedAtGmt6)}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <StatusBadge
                                  tone={enc.encounterStatus === 'FINALIZADA' ? 'positive' : 'warning'}
                                  label={`Atención: ${enc.encounterStatus}`}
                                />
                                <StatusBadge
                                  tone={enc.noteStatus === 'CERRADA' ? 'positive' : 'info'}
                                  label={`Nota: ${enc.noteStatus}`}
                                />
                                <StatusBadge
                                  tone={chargeTone(sheetStatus)}
                                  label={`Cargos: ${sheetStatus}`}
                                />
                              </div>
                            </div>

                            <div className="text-left sm:text-right">
                              <p className="text-xs text-ink-muted">Importe de cargos</p>
                              <p className="font-mono text-lg font-bold text-ink tabular-nums">
                                {sheet ? formatMxn(sheet.totalMxn) : '$0.00 MXN'}
                              </p>
                            </div>
                          </div>

                          {sheet ? (
                            <div className="mt-3 rounded-md border border-divider bg-surface p-3 text-xs">
                              <ul className="space-y-1">
                                {sheet.items.map((item) => (
                                  <li key={item.id} className="flex flex-wrap justify-between gap-2">
                                    <span>
                                      <strong>{item.quantity}x</strong> {item.description} ({item.category})
                                    </span>
                                    <span className="font-mono tabular-nums">
                                      {formatMxn(item.quantity * item.unitPriceMxn)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {canEdit ? (
                              <button
                                type="button"
                                onClick={() => openManageChargesMock(enc)}
                                className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-slate-100"
                              >
                                Gestionar cargos (CU-20)
                              </button>
                            ) : null}

                            {sheetStatus === 'ABIERTA' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleMarkReviewedMock(enc.id)}
                                  className="inline-flex min-h-11 items-center rounded-md bg-platform px-3.5 py-2 text-xs font-semibold text-white hover:bg-platform-hover"
                                >
                                  Confirmar cargos revisados
                                </button>
                                <span className="text-xs font-medium text-warning-ink">
                                  Confirma REVISADA antes de habilitar el cobro (CU-21 A2).
                                </span>
                              </>
                            ) : null}

                            {sheetStatus === 'REVISADA' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleReopenSheetMock(enc.id)}
                                  className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-slate-100"
                                >
                                  Devolver a abierta
                                </button>
                                {enc.encounterStatus === 'FINALIZADA' ? (
                                  <button
                                    type="button"
                                    onClick={() => openPaymentModalMock(enc)}
                                    className="inline-flex min-h-11 items-center rounded-md bg-clinical px-3.5 py-2 text-xs font-semibold text-white hover:bg-clinical-hover"
                                  >
                                    Registrar cobro completo (CU-21)
                                  </button>
                                ) : (
                                  <span className="text-xs font-medium text-warning-ink">
                                    Cobro bloqueado hasta que el especialista finalice la atención (CU-21 A1).
                                  </span>
                                )}
                              </>
                            ) : null}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )
              ) : liveSheets.length === 0 ? (
                <p className="rounded-md border border-divider bg-slate-50 p-4 text-sm text-ink-muted">
                  No existen hojas de cargo visibles en tu ámbito autorizado dentro de saas-billing.
                </p>
              ) : (
                <ul className="space-y-3">
                  {liveSheets.map((sheet) => {
                    const patient = resolvePatientDisplayBff(sheet.patientId, patients)
                    const specialist = resolveSpecialistDisplayBff(sheet.specialistId, staffForBff)
                    const encMeta = resolveEncounterDisplayBff(
                      sheet.encounterId,
                      encounters,
                      sheet.createdAtGmt6,
                    )
                    const canEdit = sheet.status !== 'COBRADA'

                    return (
                      <li
                        key={sheet.id}
                        className="rounded-lg border border-divider bg-slate-50 p-4 text-sm"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-clinical">
                                {patient.patientCode}
                              </span>
                              <span className="font-bold text-ink">{patient.fullName}</span>
                              <span className="font-mono text-xs text-ink-muted">
                                ({encMeta.displayId})
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-ink-muted">
                              Especialista: <strong className="text-ink">{specialist.fullName}</strong>
                              {specialist.specialty ? ` (${specialist.specialty})` : ''} · Actualizada:{' '}
                              {formatDateTimeGmt6(sheet.updatedAtGmt6)}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <StatusBadge
                                tone={encMeta.encounterStatus === 'FINALIZADA' ? 'positive' : 'warning'}
                                label={`Atención: ${encMeta.encounterStatus}`}
                              />
                              <StatusBadge
                                tone={encMeta.noteStatus === 'CERRADA' ? 'positive' : 'info'}
                                label={`Nota: ${encMeta.noteStatus}`}
                              />
                              <StatusBadge
                                tone={chargeTone(sheet.status)}
                                label={`Cargos: ${sheet.status}`}
                              />
                            </div>
                          </div>

                          <div className="text-left sm:text-right">
                            <p className="text-xs text-ink-muted">Importe de cargos</p>
                            <p className="font-mono text-lg font-bold text-ink tabular-nums">
                              {formatMxn(sheet.totalMxn)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 rounded-md border border-divider bg-surface p-3 text-xs">
                          <ul className="space-y-1">
                            {sheet.items.map((item) => (
                              <li key={item.id} className="flex flex-wrap justify-between gap-2">
                                <span>
                                  <strong>{item.quantity}x</strong> {item.description} ({item.category})
                                </span>
                                <span className="font-mono tabular-nums">
                                  {formatMxn(item.lineTotalMxn)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {canEdit ? (
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => openManageChargesLive(sheet.encounterId, sheet)}
                              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-slate-100 disabled:opacity-60"
                            >
                              Gestionar cargos (CU-20)
                            </button>
                          ) : null}

                          {sheet.status === 'ABIERTA' ? (
                            <>
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => void handleMarkReviewedLive(sheet.id)}
                                className="inline-flex min-h-11 items-center rounded-md bg-platform px-3.5 py-2 text-xs font-semibold text-white hover:bg-platform-hover disabled:opacity-60"
                              >
                                Confirmar cargos revisados
                              </button>
                              <span className="text-xs font-medium text-warning-ink">
                                Confirma REVISADA antes de habilitar el cobro (CU-21 A2).
                              </span>
                            </>
                          ) : null}

                          {sheet.status === 'REVISADA' ? (
                            <>
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => void handleReopenSheetLive(sheet.id)}
                                className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-slate-100 disabled:opacity-60"
                              >
                                Devolver a abierta
                              </button>
                              {encMeta.encounterStatus === 'FINALIZADA' ? (
                                <button
                                  type="button"
                                  disabled={submitting}
                                  onClick={() => openPaymentModalLive(sheet)}
                                  className="inline-flex min-h-11 items-center rounded-md bg-clinical px-3.5 py-2 text-xs font-semibold text-white hover:bg-clinical-hover disabled:opacity-60"
                                >
                                  Registrar cobro completo (CU-21)
                                </button>
                              ) : (
                                <span className="text-xs font-medium text-warning-ink">
                                  Cobro bloqueado hasta que el especialista finalice la atención (CU-21 A1).
                                </span>
                              )}
                            </>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}

              <section className="space-y-3">
                <h3 className="text-base font-bold text-ink">Cobros completos registrados (GMT-6)</h3>
                <div
                  tabIndex={0}
                  role="region"
                  aria-labelledby={tableHeadingId}
                  className="table-wrapper rounded-lg border border-divider bg-surface"
                >
                  <table className="vital-table">
                    <caption id={tableHeadingId} className="sr-only">
                      Historial de cobros completos registrados en GMT-6
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Folio y fecha</th>
                        <th scope="col">Paciente y especialista</th>
                        <th scope="col">Método</th>
                        <th scope="col">Importe</th>
                        <th scope="col">Estado de corte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!isLive
                        ? tenantPayments.map((pay) => {
                            const patient = patients.find((p) => p.id === pay.patientId)
                            const specialist = accounts.find((a) => a.id === pay.specialistId)
                            return (
                              <tr key={pay.id}>
                                <th scope="row" className="text-left">
                                  <p className="font-mono text-xs font-bold text-ink">{pay.folio}</p>
                                  <p className="font-mono text-xs text-ink-muted">
                                    {formatDateTimeGmt6(pay.paidAtGmt6)}
                                  </p>
                                </th>
                                <td data-label="Paciente y especialista">
                                  <p className="font-semibold text-ink">{patient?.fullName}</p>
                                  <p className="text-xs text-ink-muted">
                                    {specialist?.fullName} · Cobró: {pay.collectedByName}
                                  </p>
                                </td>
                                <td data-label="Método">{PAYMENT_METHOD_LABELS[pay.method]}</td>
                                <td data-label="Importe" className="font-mono font-bold tabular-nums">
                                  {formatMxn(pay.amountMxn)}
                                </td>
                                <td data-label="Estado de corte">
                                  <StatusBadge
                                    tone={pay.cutId ? 'positive' : 'neutral'}
                                    label={pay.cutId ? 'Asignado a corte' : 'Sin corte asignado'}
                                  />
                                </td>
                              </tr>
                            )
                          })
                        : livePayments.map((pay) => {
                            const patient = resolvePatientDisplayBff(pay.patientId, patients)
                            const specialist = resolveSpecialistDisplayBff(
                              pay.specialistId,
                              staffForBff,
                            )
                            return (
                              <tr key={pay.id}>
                                <th scope="row" className="text-left">
                                  <p className="font-mono text-xs font-bold text-ink">{pay.folio}</p>
                                  <p className="font-mono text-xs text-ink-muted">
                                    {formatDateTimeGmt6(pay.paidAtGmt6)}
                                  </p>
                                </th>
                                <td data-label="Paciente y especialista">
                                  <p className="font-semibold text-ink">
                                    {patient.patientCode} · {patient.fullName}
                                  </p>
                                  <p className="text-xs text-ink-muted">
                                    {specialist.fullName} · Cobró: {pay.collectedByName}
                                  </p>
                                </td>
                                <td data-label="Método">{PAYMENT_METHOD_LABELS[pay.method]}</td>
                                <td data-label="Importe" className="font-mono font-bold tabular-nums">
                                  {formatMxn(pay.amountMxn)}
                                </td>
                                <td data-label="Estado de corte">
                                  <StatusBadge
                                    tone={pay.cutId ? 'positive' : 'neutral'}
                                    label={pay.cutId ? 'Asignado a corte' : 'Sin corte asignado'}
                                  />
                                </td>
                              </tr>
                            )
                          })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>

          {/* TAB 2: CU-22 y PC-05 Cortes */}
          <div
            role="tabpanel"
            aria-labelledby="billing-tab-cuts"
            hidden={activeTab !== 'cuts'}
            tabIndex={activeTab === 'cuts' ? 0 : undefined}
          >
            <div className="space-y-5 p-5 text-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-ink">
                    Cortes por especialista (CU-22 · PC-05)
                  </h2>
                  <p className="text-xs text-ink-muted">
                    Reúne cobros disponibles por periodo (`GMT-6`) evitando doble contabilización y atiende discrepancias devueltas en estado OBSERVADO.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={openPrepareCutModal}
                  className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 text-xs font-semibold text-white hover:bg-clinical-hover disabled:opacity-60"
                >
                  Preparar nuevo corte (CU-22)
                </button>
              </div>

              {observedCutsCount > 0 ? (
                <div className="rounded-md border border-amber-300 bg-warning-bg p-4 text-warning-ink">
                  <p className="font-bold">
                    Cortes observados con discrepancia reportada ({observedCutsCount})
                  </p>
                  <p className="mt-1 text-xs">
                    Corrige los cobros incluidos o periodos con nota trazable para reenviarlos a estado PREPARADO (PC-05).
                  </p>
                </div>
              ) : null}

              <div
                tabIndex={0}
                role="region"
                aria-labelledby={cutsHeadingId}
                className="table-wrapper rounded-lg border border-divider bg-surface"
              >
                <table className="vital-table">
                  <caption id={cutsHeadingId} className="sr-only">
                    Cortes económicos preparados para especialistas
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Corte y periodo</th>
                      <th scope="col">Especialista</th>
                      <th scope="col">Desglose por método</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!isLive
                      ? tenantCuts.map((cut) => (
                          <tr key={cut.id}>
                            <th scope="row" className="text-left">
                              <p className="font-mono text-xs font-bold text-ink">{cut.folio}</p>
                              <p className="font-mono text-xs text-ink-muted">
                                {cut.periodStartGmt6} a {cut.periodEndGmt6} (GMT-6)
                              </p>
                            </th>
                            <td data-label="Especialista">
                              <p className="font-semibold text-ink">{cut.specialistName}</p>
                              <p className="text-xs text-ink-muted">{cut.paymentIds.length} cobro(s)</p>
                              {cut.lastObservationNote ? (
                                <p className="mt-1 rounded bg-warning-bg px-2 py-1 text-xs font-medium text-warning-ink">
                                  Observación: {cut.lastObservationNote}
                                </p>
                              ) : null}
                            </td>
                            <td data-label="Desglose por método" className="font-mono text-xs tabular-nums">
                              <p>Efectivo: {formatMxn(cut.totalsByMethod.EFECTIVO)}</p>
                              <p>Tarjeta: {formatMxn(cut.totalsByMethod.TARJETA)}</p>
                              <p>Transferencia: {formatMxn(cut.totalsByMethod.TRANSFERENCIA)}</p>
                              <p className="mt-1 font-bold text-ink">Total: {formatMxn(cut.totalMxn)}</p>
                            </td>
                            <td data-label="Estado">
                              <StatusBadge tone={cutTone(cut.status)} label={cut.status} />
                              {cut.confirmedByName ? (
                                <p className="mt-1 text-xs text-ink-muted">
                                  Confirmado por {cut.confirmedByName}
                                </p>
                              ) : null}
                            </td>
                            <td data-label="Acciones">
                              {cut.status !== 'CONFIRMADO' ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void openReviseCutModal({
                                      id: cut.id,
                                      folio: cut.folio,
                                      specialistId: cut.specialistId,
                                      periodStartGmt6: cut.periodStartGmt6,
                                      periodEndGmt6: cut.periodEndGmt6,
                                      paymentIds: cut.paymentIds,
                                      lastObservationNote: cut.lastObservationNote,
                                    })
                                  }
                                  className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100"
                                >
                                  Corregir y reenviar a PREPARADO
                                </button>
                              ) : (
                                <span className="text-xs text-ink-muted">Confirmado e inmutable</span>
                              )}
                            </td>
                          </tr>
                        ))
                      : liveCuts.map((cut) => {
                          const normalizedTotals = normalizeTotalsByMethod(cut.totalsByMethod)
                          return (
                            <tr key={cut.id}>
                              <th scope="row" className="text-left">
                                <p className="font-mono text-xs font-bold text-ink">{cut.folio}</p>
                                <p className="font-mono text-xs text-ink-muted">
                                  {cut.periodStartGmt6} a {cut.periodEndGmt6} (GMT-6)
                                </p>
                              </th>
                              <td data-label="Especialista">
                                <p className="font-semibold text-ink">{cut.specialistName}</p>
                                <p className="text-xs text-ink-muted">{cut.paymentCount} cobro(s)</p>
                                {cut.lastObservationNote ? (
                                  <p className="mt-1 rounded bg-warning-bg px-2 py-1 text-xs font-medium text-warning-ink">
                                    Observación: {cut.lastObservationNote}
                                  </p>
                                ) : null}
                              </td>
                              <td data-label="Desglose por método" className="font-mono text-xs tabular-nums">
                                <p>Efectivo: {formatMxn(normalizedTotals.EFECTIVO)}</p>
                                <p>Tarjeta: {formatMxn(normalizedTotals.TARJETA)}</p>
                                <p>Transferencia: {formatMxn(normalizedTotals.TRANSFERENCIA)}</p>
                                <p className="mt-1 font-bold text-ink">Total: {formatMxn(cut.totalMxn)}</p>
                              </td>
                              <td data-label="Estado">
                                <StatusBadge tone={cutTone(cut.status)} label={cut.status} />
                                {cut.confirmedByName ? (
                                  <p className="mt-1 text-xs text-ink-muted">
                                    Confirmado por {cut.confirmedByName}
                                  </p>
                                ) : null}
                              </td>
                              <td data-label="Acciones">
                                {cut.status !== 'CONFIRMADO' ? (
                                  <button
                                    type="button"
                                    disabled={submitting}
                                    onClick={() =>
                                      void openReviseCutModal({
                                        id: cut.id,
                                        folio: cut.folio,
                                        specialistId: cut.specialistId,
                                        periodStartGmt6: cut.periodStartGmt6,
                                        periodEndGmt6: cut.periodEndGmt6,
                                        paymentIds: [],
                                        lastObservationNote: cut.lastObservationNote,
                                      })
                                    }
                                    className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-100 disabled:opacity-60"
                                  >
                                    Corregir y reenviar a PREPARADO
                                  </button>
                                ) : (
                                  <span className="text-xs text-ink-muted">Confirmado e inmutable</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                  </tbody>
                </table>
              </div>

              {isLive ? (
                <section className="space-y-3 border-t border-divider pt-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-base font-bold text-ink">
                        Ajustes compensatorios vinculados (D-BI-01 · D-BI-03)
                      </h3>
                      <p className="text-xs text-ink-muted">
                        Se muestran por separado sin alterar folios originales ni netear KPIs base de `CU-16`. Emisión exclusiva de `ADMIN_CLINICA`.
                      </p>
                    </div>
                    {currentUser.role === 'ADMIN_CLINICA' ? (
                      <button
                        type="button"
                        disabled={submitting || (confirmedLiveCuts.length === 0 && livePayments.length === 0)}
                        onClick={openAdjustmentModal}
                        className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-slate-100 disabled:opacity-60"
                      >
                        Registrar ajuste vinculado
                      </button>
                    ) : null}
                  </div>

                  {liveAdjustments.length === 0 ? (
                    <p className="rounded-md border border-divider bg-slate-50 p-3 text-xs text-ink-muted">
                      Sin ajustes compensatorios registrados en esta clínica.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-xs">
                      {liveAdjustments.map((adj) => {
                        const targetFolio =
                          adj.targetType === 'CUT'
                            ? liveCuts.find((c) => c.id === adj.targetId)?.folio
                            : livePayments.find((p) => p.id === adj.targetId)?.folio
                        return (
                          <li
                            key={adj.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-divider bg-slate-50 px-3 py-2.5"
                          >
                            <div>
                              <span className="font-mono font-bold text-ink">{adj.folio}</span>{' '}
                              <span className="text-ink-muted">
                                [{adj.targetType}] {targetFolio ?? adj.targetId.slice(0, 8)} ·{' '}
                                {adj.reason}
                              </span>
                              <p className="mt-0.5 text-ink-muted">
                                Autor: {adj.actorName} · {formatDateTimeGmt6(adj.createdAtGmt6)}
                              </p>
                            </div>
                            <span className="font-mono text-sm font-bold text-ink tabular-nums">
                              {adj.deltaMxn > 0 ? `+${formatMxn(adj.deltaMxn)}` : formatMxn(adj.deltaMxn)}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Modal CU-20 Gestionar cargos */}
      <ModalDialog
        open={Boolean(chargeTarget)}
        title={`Gestionar cargos y consumos (${chargeTarget?.encounterLabel ?? ''}) (CU-20)`}
        description="Guarda los conceptos en estado ABIERTA. No equivale a control físico de inventario."
        onClose={() => setChargeTarget(null)}
      >
        <form onSubmit={(e) => void handleSaveChargesSubmit(e)} className="space-y-4 text-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="charge-concept-select" className="block text-xs font-semibold text-ink">
                Agregar concepto cobrable del catálogo
              </label>
              <select
                id="charge-concept-select"
                value={selectedConceptCode}
                onChange={(e) => setSelectedConceptCode(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2"
              >
                {catalogOptions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label} ({c.category} - {formatMxn(c.defaultPriceMxn)})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleAddConceptLine}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-slate-100"
            >
              Agregar concepto
            </button>
          </div>

          <ul className="space-y-2">
            {draftItems.map((item, idx) => (
              <li
                key={item.id}
                className="grid gap-2 rounded-md border border-divider bg-slate-50 p-3 sm:grid-cols-[1fr_5rem_7rem_auto]"
              >
                <div>
                  <label htmlFor={`cli-desc-${idx}`} className="block text-xs font-semibold text-ink">
                    Concepto
                  </label>
                  <input
                    id={`cli-desc-${idx}`}
                    type="text"
                    value={item.description}
                    onChange={(e) =>
                      setDraftItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, description: e.target.value } : row,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor={`cli-qty-${idx}`} className="block text-xs font-semibold text-ink">
                    Cant.
                  </label>
                  <input
                    id={`cli-qty-${idx}`}
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) =>
                      setDraftItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, quantity: Number(e.target.value) || 0 } : row,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-md border px-2.5 py-1.5 font-mono text-xs"
                  />
                </div>
                <div>
                  <label htmlFor={`cli-price-${idx}`} className="block text-xs font-semibold text-ink">
                    Precio MXN
                  </label>
                  <input
                    id={`cli-price-${idx}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.unitPriceMxn}
                    onChange={(e) =>
                      setDraftItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, unitPriceMxn: Number(e.target.value) || 0 } : row,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-md border px-2.5 py-1.5 font-mono text-xs"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() =>
                      setDraftItems((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="inline-flex min-h-11 items-center rounded-md border border-red-300 bg-surface px-2.5 py-1.5 text-xs font-semibold text-critical-ink hover:bg-red-50"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between rounded-md border border-divider bg-surface p-3 font-mono font-bold">
            <span>Total calculado:</span>
            <span>{formatMxn(calculateChargeItemsTotal(draftItems))}</span>
          </div>

          {chargeModalError ? (
            <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-critical-ink">
              {chargeModalError}
            </p>
          ) : null}

          <div className="flex justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setChargeTarget(null)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover disabled:opacity-60"
            >
              Guardar cargos (ABIERTA)
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal CU-21 Cobro completo */}
      <ModalDialog
        open={Boolean(paymentTarget)}
        title="Registrar cobro completo a paciente (CU-21)"
        description="Solo se admiten cobros por el total exacto. No requiere cierre de nota clínica."
        onClose={() => setPaymentTarget(null)}
      >
        <form onSubmit={(e) => void handleRecordPaymentSubmit(e)} className="space-y-4 text-sm">
          <div>
            <label htmlFor="pay-method" className="block font-semibold text-ink">
              Método de pago
            </label>
            <select
              id="pay-method"
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
              className="mt-1 w-full rounded-md border px-3 py-2"
            >
              <option value="EFECTIVO">Efectivo</option>
              <option value="TARJETA">Tarjeta</option>
              <option value="TRANSFERENCIA">Transferencia</option>
            </select>
          </div>

          <div>
            <label htmlFor="pay-amount" className="block font-semibold text-ink">
              Importe cobrado (MXN, pago completo obligatorio)
            </label>
            <input
              id="pay-amount"
              type="number"
              step="0.01"
              value={payAmountInput}
              onChange={(e) => setPayAmountInput(e.target.value)}
              required
              className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
            />
          </div>

          {payError ? (
            <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-critical-ink">
              {payError}
            </p>
          ) : null}

          <div className="flex justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setPaymentTarget(null)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover disabled:opacity-60"
            >
              Confirmar cobro completo
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal CU-22 Preparar nuevo corte */}
      <ModalDialog
        open={prepCutOpen}
        title="Preparar corte por especialista (CU-22)"
        description="Solo lista cobros sin corte previo asignado dentro del periodo GMT-6 seleccionado."
        onClose={() => setPrepCutOpen(false)}
      >
        <form onSubmit={(e) => void handlePrepCutSubmit(e)} className="space-y-4 text-sm">
          <div>
            <label htmlFor="cut-specialist" className="block font-semibold text-ink">
              Especialista
            </label>
            <select
              id="cut-specialist"
              value={cutSpecialistId}
              onChange={(e) => handlePrepSpecialistChange(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
            >
              {tenantSpecialists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.specialty ?? 'General'})
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="cut-start" className="block font-semibold text-ink">
                Desde (GMT-6)
              </label>
              <input
                id="cut-start"
                type="date"
                value={cutStartDate}
                onChange={(e) => setCutStartDate(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label htmlFor="cut-end" className="block font-semibold text-ink">
                Hasta (GMT-6)
              </label>
              <input
                id="cut-end"
                type="date"
                value={cutEndDate}
                onChange={(e) => setCutEndDate(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
              />
            </div>
          </div>

          <fieldset className="rounded-md border border-divider p-3">
            <legend className="px-1 text-xs font-semibold text-ink">
              Cobros disponibles sin corte ({prepEligiblePayments.length})
            </legend>
            {prepEligiblePayments.length === 0 ? (
              <p className="text-xs text-ink-muted">
                No hay cobros pendientes de corte para ese especialista y periodo.
              </p>
            ) : (
              <div className="space-y-2">
                {prepEligiblePayments.map((pay) => {
                  const checked = cutPaymentIds.includes(pay.id)
                  return (
                    <label key={pay.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setCutPaymentIds((prev) =>
                              e.target.checked
                                ? [...prev, pay.id]
                                : prev.filter((id) => id !== pay.id),
                            )
                          }
                        />
                        <span className="font-mono font-bold">{pay.folio}</span> (
                        {PAYMENT_METHOD_LABELS[pay.method]})
                      </span>
                      <span className="font-mono font-semibold">{formatMxn(pay.amountMxn)}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </fieldset>

          <div className="rounded-md border border-divider bg-slate-50 p-3 font-mono text-xs">
            <p>
              Efectivo: {formatMxn(prepSummary.byMethod.EFECTIVO)} | Tarjeta:{' '}
              {formatMxn(prepSummary.byMethod.TARJETA)} | Transferencia:{' '}
              {formatMxn(prepSummary.byMethod.TRANSFERENCIA)}
            </p>
            <p className="mt-1 font-bold text-ink">Total del corte: {formatMxn(prepSummary.totalMxn)}</p>
          </div>

          {prepCutError ? (
            <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-critical-ink">
              {prepCutError}
            </p>
          ) : null}

          <div className="flex justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setPrepCutOpen(false)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover disabled:opacity-60"
            >
              Guardar corte en PREPARADO
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal PC-05 / CU-22 Corregir corte OBSERVADO o PREPARADO */}
      <ModalDialog
        open={Boolean(reviseTargetCut)}
        title={`Corregir y reenviar corte ${reviseTargetCut?.folio ?? ''} (CU-22 · PC-05)`}
        description="Registra una nota de corrección trazable y devuelve el corte a estado PREPARADO."
        onClose={() => setReviseTargetCut(null)}
      >
        {reviseTargetCut ? (
          <form onSubmit={(e) => void handleReviseCutSubmit(e)} className="space-y-4 text-sm">
            {reviseTargetCut.lastObservationNote ? (
              <div className="rounded-md border border-amber-300 bg-warning-bg p-3 text-xs text-warning-ink">
                <p className="font-bold">Discrepancia reportada por el especialista:</p>
                <p className="mt-1">{reviseTargetCut.lastObservationNote}</p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="rev-start" className="block font-semibold text-ink">
                  Desde (GMT-6)
                </label>
                <input
                  id="rev-start"
                  type="date"
                  value={reviseStartDate}
                  onChange={(e) => setReviseStartDate(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label htmlFor="rev-end" className="block font-semibold text-ink">
                  Hasta (GMT-6)
                </label>
                <input
                  id="rev-end"
                  type="date"
                  value={reviseEndDate}
                  onChange={(e) => setReviseEndDate(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
                />
              </div>
            </div>

            <fieldset className="rounded-md border border-divider p-3">
              <legend className="px-1 text-xs font-semibold text-ink">
                Cobros asociados al corte
              </legend>
              <div className="space-y-2">
                {reviseEligiblePayments.map((pay) => {
                  const checked = revisePaymentIds.includes(pay.id)
                  return (
                    <label key={pay.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setRevisePaymentIds((prev) =>
                              e.target.checked
                                ? [...prev, pay.id]
                                : prev.filter((id) => id !== pay.id),
                            )
                          }
                        />
                        <span className="font-mono font-bold">{pay.folio}</span> (
                        {PAYMENT_METHOD_LABELS[pay.method]})
                      </span>
                      <span className="font-mono font-semibold">{formatMxn(pay.amountMxn)}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <div className="rounded-md border border-divider bg-slate-50 p-3 font-mono text-xs">
              Total actualizado: <strong>{formatMxn(reviseSummary.totalMxn)}</strong>
            </div>

            <div>
              <label htmlFor="revise-cut-note" className="block font-semibold text-ink">
                Nota de corrección trazable (obligatoria)
              </label>
              <textarea
                id="revise-cut-note"
                rows={2}
                value={reviseNote}
                onChange={(e) => setReviseNote(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2"
                placeholder="Ej. Verificado comprobante de terminal bancaria y reajustado periodo."
              />
            </div>

            {reviseError ? (
              <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-critical-ink">
                {reviseError}
              </p>
            ) : null}

            <div className="flex justify-end gap-3 border-t border-divider pt-4">
              <button
                type="button"
                onClick={() => setReviseTargetCut(null)}
                className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover disabled:opacity-60"
              >
                Reenviar a PREPARADO
              </button>
            </div>
          </form>
        ) : null}
      </ModalDialog>

      {/* Modal D-BI-01 Ajuste compensatorio vinculado */}
      <ModalDialog
        open={adjModalOpen}
        title="Registrar ajuste compensatorio vinculado (D-BI-01)"
        description="Emite un folio AJU- independiente sin alterar el cobro o corte CONFIRMADO original."
        onClose={() => setAdjModalOpen(false)}
      >
        <form onSubmit={(e) => void handleAdjustmentSubmit(e)} noValidate className="space-y-4 text-sm">
          <div>
            <label htmlFor="adj-target-type" className="block font-semibold text-ink">
              Tipo de registro vinculado
            </label>
            <select
              id="adj-target-type"
              value={adjTargetType}
              onChange={(e) => {
                const nextType = e.target.value as BillingAdjustmentTargetType
                setAdjTargetType(nextType)
                const nextTarget =
                  nextType === 'CUT' ? confirmedLiveCuts[0]?.id ?? '' : livePayments[0]?.id ?? ''
                setAdjTargetId(nextTarget)
              }}
              className="mt-1 w-full rounded-md border px-3 py-2"
            >
              <option value="CUT">Corte CONFIRMADO</option>
              <option value="PAYMENT">Cobro registrado</option>
            </select>
          </div>

          <div>
            <label htmlFor="adj-target-id" className="block font-semibold text-ink">
              Folio objetivo
            </label>
            <select
              id="adj-target-id"
              value={adjTargetId}
              onChange={(e) => setAdjTargetId(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-xs"
            >
              {adjTargetType === 'CUT'
                ? confirmedLiveCuts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.folio} · {c.specialistName} ({formatMxn(c.totalMxn)})
                    </option>
                  ))
                : livePayments.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.folio} · {PAYMENT_METHOD_LABELS[p.method]} ({formatMxn(p.amountMxn)})
                    </option>
                  ))}
            </select>
          </div>

          <div>
            <label htmlFor="adj-delta" className="block font-semibold text-ink">
              Delta MXN (positivo o negativo distinto de 0)
            </label>
            <input
              id="adj-delta"
              type="number"
              step="0.01"
              value={adjDeltaInput}
              onChange={(e) => setAdjDeltaInput(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 font-mono"
              placeholder="-150.00"
            />
          </div>

          <div>
            <label htmlFor="adj-reason" className="block font-semibold text-ink">
              Motivo trazable (obligatorio)
            </label>
            <textarea
              id="adj-reason"
              rows={2}
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="Ej. Bonificación administrativa autorizada posterior a confirmación."
            />
          </div>

          {adjError ? (
            <p role="alert" className="rounded-md border border-red-300 bg-critical-bg px-3 py-2 text-critical-ink">
              {adjError}
            </p>
          ) : null}

          <div className="flex justify-end gap-3 border-t border-divider pt-4">
            <button
              type="button"
              onClick={() => setAdjModalOpen(false)}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 py-2 font-semibold text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 font-semibold text-white hover:bg-clinical-hover disabled:opacity-60"
            >
              Emitir ajuste vinculado
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  )
}
