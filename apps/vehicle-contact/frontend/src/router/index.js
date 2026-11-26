import { createRouter, createWebHashHistory } from 'vue-router'
import { pinia } from '../app/pinia.js'
import { useSessionStore } from '../stores/session.js'
import SignInView from '../views/SignInView.vue'
import AppShell from '../layouts/AppShell.vue'
import DashboardView from '../views/DashboardView.vue'
import AboutPage from '../pages/AboutPage.vue'
import VehicleSearchPage from '../pages/VehicleSearchPage.vue'
import VehicleDetailPage from '../pages/VehicleDetailPage.vue'
import VehicleMaintenancePage from '../pages/VehicleMaintenancePage.vue'
import QrResolvePage from '../pages/QrResolvePage.vue'
import RegistrationReviewPage from '../pages/RegistrationReviewPage.vue'
import ChangeReviewPage from '../pages/ChangeReviewPage.vue'
import MyVehiclesPage from '../pages/MyVehiclesPage.vue'
import VehicleRegistryPage from '../pages/VehicleRegistryPage.vue'
import RegistrationIntakePage from '../pages/RegistrationIntakePage.vue'
import ForbiddenPage from '../pages/ForbiddenPage.vue'
import UserDirectoryPage from '../pages/UserDirectoryPage.vue'
import AccountSecurityPage from '../pages/AccountSecurityPage.vue'
import OrganizationAdministrationPage from '../pages/OrganizationAdministrationPage.vue'
import CampaignAdministrationPage from '../pages/CampaignAdministrationPage.vue'
import QrGovernancePage from '../pages/QrGovernancePage.vue'
import QrPrintPage from '../pages/QrPrintPage.vue'
import QrStickerLandingPage from '../pages/QrStickerLandingPage.vue'
import SystemSettingsPage from '../pages/SystemSettingsPage.vue'
import RetentionApprovalPage from '../pages/RetentionApprovalPage.vue'
import AuditReviewPage from '../pages/AuditReviewPage.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/signin', name: 'sign-in', component: SignInView, meta: { title: 'เข้าสู่ระบบ', public: true } },
    {
      path: '/app', component: AppShell, meta: { requiresAuth: true },
      children: [
        { path: 'dashboard', name: 'dashboard', component: DashboardView, meta: { title: 'ภาพรวม' } },
        { path: 'about', name: 'about', component: AboutPage, meta: { title: 'เกี่ยวกับระบบ' } },
        { path: 'connection', redirect: { name: 'about' } },
        { path: 'vehicles/search', name: 'vehicle-search', component: VehicleSearchPage, meta: { title: 'ค้นหายานพาหนะ', requiredPermissions: ['vehicle.lookup'] } },
        { path: 'vehicles/detail/:vehicleId', name: 'vehicle-detail', component: VehicleDetailPage, meta: { title: 'รายละเอียดยานพาหนะ', requiredPermissions: ['vehicle.lookup'] } },
        { path: 'vehicles/maintenance/:vehicleId', name: 'vehicle-maintenance', component: VehicleMaintenancePage, meta: { title: 'แก้ไขข้อมูลยานพาหนะ', requiredPermissions: ['vehicle.update'] } },
        { path: 'vehicles/qr', name: 'qr-resolve', component: QrResolvePage, meta: { title: 'ตรวจสอบ QR ยานพาหนะ', requiredPermissions: ['vehicle.lookup'] } },
        { path: 'registrations/new', name: 'registration-intake', component: RegistrationIntakePage, meta: { title: 'รับลงทะเบียนยานพาหนะ', requiredPermissions: ['vehicle.registration.approve'] } },
        { path: 'registrations/review', name: 'registration-review', component: RegistrationReviewPage, meta: { title: 'ตรวจสอบการลงทะเบียน', requiredPermissions: ['vehicle.registration.approve'] } },
        { path: 'vehicles/changes/review', name: 'change-review', component: ChangeReviewPage, meta: { title: 'ตรวจสอบคำขอเปลี่ยนแปลง', requiredPermissions: ['vehicle.change.approve'] } },
        { path: 'vehicles/mine', name: 'my-vehicles', component: MyVehiclesPage, meta: { title: 'ยานพาหนะของฉัน', requiredPermissions: ['vehicle.change.submit'] } },
        { path: 'vehicles/registry', name: 'vehicle-registry', component: VehicleRegistryPage, meta: { title: 'ทะเบียนยานพาหนะที่อนุมัติ', requiredPermissions: ['vehicle.list'] } },
        { path: 'forbidden', name: 'forbidden', component: ForbiddenPage, meta: { title: 'ไม่มีสิทธิ์เปิดงาน' } },
        { path: 'admin/users', name: 'user-directory', component: UserDirectoryPage, meta: { title: 'ผู้ใช้และสิทธิ์', requiredPermissions: ['users.manage'] } },
        { path: 'account/security', name: 'account-security', component: AccountSecurityPage, meta: { title: 'บัญชีและความปลอดภัย', requiredPermissions: ['session.authenticated'] } },
        { path: 'admin/organizations', name: 'organization-administration', component: OrganizationAdministrationPage, meta: { title: 'หน่วยงาน', requiredPermissions: ['organizations.read'] } },
        { path: 'admin/campaigns', name: 'campaign-administration', component: CampaignAdministrationPage, meta: { title: 'แคมเปญลงทะเบียน', requiredPermissions: ['campaigns.manage'] } },
        { path: 'admin/qr-print', name: 'qr-print', component: QrPrintPage, meta: { title: 'พิมพ์ QR', requiredPermissions: ['qr.manage', 'vehicle.list'] } },
        { path: 'admin/qr', name: 'qr-governance', component: QrGovernancePage, meta: { title: 'จัดการ QR', requiredPermissions: ['qr.manage'] } },
        { path: 'admin/settings', name: 'system-settings', component: SystemSettingsPage, meta: { title: 'ตั้งค่าระบบ', requiredPermissions: ['system.settings.read'] } },
        { path: 'admin/retention', name: 'retention-approval', component: RetentionApprovalPage, meta: { title: 'การเก็บรักษาข้อมูล', requiredPermissions: ['retention.read'] } },
        { path: 'admin/audit', name: 'audit-review', component: AuditReviewPage, meta: { title: 'ตรวจสอบ Audit', requiredPermissions: ['audit.read'] } },
      ],
    },
    // VC-ADR-031: the stable, shareable campaign link. Today it opens the staff intake page with the
    // code pre-filled (sign-in first); a public registrant page can replace the target later without
    // changing links already printed or shared.
    // VC-ADR-032 (A): a scanned sticker opens <app>#/q/<code>: a public page that says what the sticker is
    // (no API call); officers sign in and land on the QR check page, which resolves the code.
    { path: '/q/:code', name: 'qr-link', component: QrStickerLandingPage, meta: { title: 'QR ยานพาหนะ', public: true } },
    { path: '/register', name: 'campaign-link', redirect: (to) => ({ name: 'registration-intake', query: typeof to.query.c === 'string' ? { c: to.query.c } : {} }) },
    { path: '/', redirect: { name: 'dashboard' } },
    { path: '/:pathMatch(.*)*', redirect: { name: 'dashboard' } },
  ],
})

router.beforeEach(async (to) => {
  const auth = useSessionStore(pinia)
  if (to.meta.requiresAuth) {
    if (!auth.authenticated) return { name: 'sign-in', query: { redirect: to.fullPath } }
    if (!(await auth.restoreSession())) return { name: 'sign-in', query: { reason: 'session-expired' } }
    if (auth.session?.mustChangePassword && to.name !== 'account-security') {
      return { name: 'account-security', query: { reason: 'password-change-required' } }
    }
    const required = Array.isArray(to.meta.requiredPermissions) ? to.meta.requiredPermissions : []
    if (required.some((permission) => !auth.permissions.includes(permission))) return { name: 'forbidden' }
  }
  if (to.name === 'sign-in' && auth.authenticated && await auth.restoreSession()) {
    return { name: auth.session?.mustChangePassword ? 'account-security' : 'dashboard' }
  }
  return true
})

router.afterEach((to) => {
  document.title = `${to.meta.title || 'P6 Vehicle Contact'} — P6 Vehicle Contact`
})
