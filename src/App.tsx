import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router'
import { ClinicLoginPage } from './features/auth/ClinicLoginPage.tsx'
import { PlatformLoginPage } from './features/auth/PlatformLoginPage.tsx'
import { BillingHubPage } from './features/billing-bi/BillingHubPage.tsx'
import { ClinicBiPage } from './features/billing-bi/ClinicBiPage.tsx'
import { PlatformBiPage } from './features/billing-bi/PlatformBiPage.tsx'
import { SpecialistCutsPage } from './features/billing-bi/SpecialistCutsPage.tsx'
import { AppointmentsPage } from './features/clinical-care/AppointmentsPage.tsx'
import { EncounterWorkspacePage } from './features/clinical-care/EncounterWorkspacePage.tsx'
import { OpenNotesPage } from './features/clinical-care/OpenNotesPage.tsx'
import { PatientTriagePage } from './features/clinical-care/PatientTriagePage.tsx'
import { SchedulesPage } from './features/clinical-care/SchedulesPage.tsx'
import { AdminPatientsPage } from './features/patients-access/AdminPatientsPage.tsx'
import { ClinicalRecordSpacePage } from './features/patients-access/ClinicalRecordSpacePage.tsx'
import { ClinicalRecordsListPage } from './features/patients-access/ClinicalRecordsListPage.tsx'
import { ExceptionalAccessPage } from './features/patients-access/ExceptionalAccessPage.tsx'
import { PatientAdminDetailPage } from './features/patients-access/PatientAdminDetailPage.tsx'
import { PatientCreatePage } from './features/patients-access/PatientCreatePage.tsx'
import { AdminPlanPage } from './features/tenants-staff/AdminPlanPage.tsx'
import { AdminStaffPage } from './features/tenants-staff/AdminStaffPage.tsx'
import { PlatformClinicsPage } from './features/tenants-staff/PlatformClinicsPage.tsx'
import { AuxiliaryWorkspacePage } from './features/workspaces/AuxiliaryWorkspacePage.tsx'
import { ClinicalWorkspacePage } from './features/workspaces/ClinicalWorkspacePage.tsx'
import { defaultRouteForRole } from './guards/policy.ts'
import { RouteGuard } from './guards/RouteGuard.tsx'
import { AdminClinicLayout } from './layouts/AdminClinicLayout.tsx'
import { ClinicalLayout } from './layouts/ClinicalLayout.tsx'
import { DevRoleSwitcher } from './layouts/DevRoleSwitcher.tsx'
import { PlatformLayout } from './layouts/PlatformLayout.tsx'
import { MockStoreProvider } from './mocks/MockStoreContext.tsx'
import { useMockStore } from './mocks/useMockStore.ts'

function HomeRedirect() {
  const { currentUser } = useMockStore()
  if (!currentUser) {
    return <Navigate to="/login" replace />
  }
  return <Navigate to={defaultRouteForRole(currentUser.role)} replace />
}

function PatientCreateLayoutWrapper() {
  const { currentUser } = useMockStore()
  if (currentUser?.role === 'ESPECIALISTA') {
    return (
      <ClinicalLayout>
        <PatientCreatePage />
      </ClinicalLayout>
    )
  }
  return (
    <AdminClinicLayout>
      <PatientCreatePage />
    </AdminClinicLayout>
  )
}

function NotFoundPage() {
  const { currentUser } = useMockStore()
  const homePath = currentUser ? defaultRouteForRole(currentUser.role) : '/login'

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-xl px-4 py-16 text-center">
      <p className="font-mono text-xs font-semibold text-ink-muted">RUTA NO ENCONTRADA (404)</p>
      <h1 className="mt-2 text-2xl font-bold text-ink">La pantalla solicitada no existe</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Verifica la dirección o regresa a tu espacio autorizado dentro de Vital.
      </p>
      <div className="mt-6 flex justify-center">
        <Link
          to={homePath}
          className="inline-flex min-h-11 items-center rounded-md bg-clinical px-4 py-2 text-sm font-semibold text-white hover:bg-clinical-hover"
        >
          Volver al inicio autorizado
        </Link>
      </div>
    </main>
  )
}

function App() {
  return (
    <MockStoreProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<ClinicLoginPage />} />
          <Route path="/platform/login" element={<PlatformLoginPage />} />

          <Route
            path="/platform/clinics"
            element={
              <RouteGuard scope="PLATFORM">
                <PlatformLayout>
                  <PlatformClinicsPage />
                </PlatformLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/platform/bi"
            element={
              <RouteGuard scope="PLATFORM">
                <PlatformLayout>
                  <PlatformBiPage />
                </PlatformLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/admin/patients"
            element={
              <RouteGuard scope="CLINIC_ADMIN_OR_AUX">
                <AdminClinicLayout>
                  <AdminPatientsPage />
                </AdminClinicLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/admin/patients/new"
            element={
              <RouteGuard scope="CLINIC_PATIENT_REGISTER">
                <PatientCreateLayoutWrapper />
              </RouteGuard>
            }
          />

          <Route
            path="/admin/patients/:id"
            element={
              <RouteGuard scope="CLINIC_ADMIN_OR_AUX">
                <AdminClinicLayout>
                  <PatientAdminDetailPage />
                </AdminClinicLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/admin/exceptional-access"
            element={
              <RouteGuard scope="CLINIC_ADMIN_OR_AUX">
                <AdminClinicLayout>
                  <ExceptionalAccessPage />
                </AdminClinicLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/admin/staff"
            element={
              <RouteGuard scope="CLINIC_ADMIN">
                <AdminClinicLayout>
                  <AdminStaffPage />
                </AdminClinicLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/admin/plan"
            element={
              <RouteGuard scope="CLINIC_ADMIN">
                <AdminClinicLayout>
                  <AdminPlanPage />
                </AdminClinicLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/admin/billing"
            element={
              <RouteGuard scope="CLINIC_ADMIN_OR_AUX">
                <AdminClinicLayout>
                  <BillingHubPage />
                </AdminClinicLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/admin/bi"
            element={
              <RouteGuard scope="CLINIC_ADMIN">
                <AdminClinicLayout>
                  <ClinicBiPage />
                </AdminClinicLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/admin/workspace"
            element={
              <RouteGuard scope="CLINIC_AUXILIAR">
                <AdminClinicLayout>
                  <AuxiliaryWorkspacePage />
                </AdminClinicLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/admin/appointments"
            element={
              <RouteGuard scope="CLINIC_ADMIN_OR_AUX">
                <AdminClinicLayout>
                  <AppointmentsPage />
                </AdminClinicLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/admin/schedules"
            element={
              <RouteGuard scope="CLINIC_ADMIN">
                <AdminClinicLayout>
                  <SchedulesPage />
                </AdminClinicLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/admin/patients/:id/triage"
            element={
              <RouteGuard scope="CLINIC_AUXILIAR">
                <AdminClinicLayout>
                  <PatientTriagePage />
                </AdminClinicLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/clinical/records"
            element={
              <RouteGuard scope="CLINIC_CLINICAL">
                <ClinicalLayout>
                  <ClinicalRecordsListPage />
                </ClinicalLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/clinical/open-notes"
            element={
              <RouteGuard scope="CLINIC_CLINICAL">
                <ClinicalLayout>
                  <OpenNotesPage />
                </ClinicalLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/clinical/records/:id"
            element={
              <RouteGuard scope="CLINIC_CLINICAL">
                <ClinicalLayout>
                  <ClinicalRecordSpacePage />
                </ClinicalLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/clinical/records/:id/encounters/new"
            element={
              <RouteGuard scope="CLINIC_CLINICAL">
                <ClinicalLayout>
                  <EncounterWorkspacePage />
                </ClinicalLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/clinical/records/:id/encounters/:encounterId"
            element={
              <RouteGuard scope="CLINIC_CLINICAL">
                <ClinicalLayout>
                  <EncounterWorkspacePage />
                </ClinicalLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/clinical/workspace"
            element={
              <RouteGuard scope="CLINIC_CLINICAL">
                <ClinicalLayout>
                  <ClinicalWorkspacePage />
                </ClinicalLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/clinical/my-cuts"
            element={
              <RouteGuard scope="CLINIC_CLINICAL">
                <ClinicalLayout>
                  <SpecialistCutsPage />
                </ClinicalLayout>
              </RouteGuard>
            }
          />

          <Route
            path="/clinical/schedule"
            element={
              <RouteGuard scope="CLINIC_CLINICAL">
                <ClinicalLayout>
                  <SchedulesPage />
                </ClinicalLayout>
              </RouteGuard>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <DevRoleSwitcher />
      </BrowserRouter>
    </MockStoreProvider>
  )
}

export default App
