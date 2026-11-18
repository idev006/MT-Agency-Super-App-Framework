import { createRouter, createWebHashHistory } from 'vue-router'
import { pinia } from '../app/pinia.js'
import { useSessionStore } from '../stores/session.js'
import SignInView from '../views/SignInView.vue'
import AppShell from '../layouts/AppShell.vue'
import DashboardView from '../views/DashboardView.vue'
import GatewayPocView from '../views/GatewayPocView.vue'
import VehicleSearchPage from '../pages/VehicleSearchPage.vue'
import ForbiddenPage from '../pages/ForbiddenPage.vue'
import UserDirectoryPage from '../pages/UserDirectoryPage.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/signin', name: 'sign-in', component: SignInView, meta: { title: 'เข้าสู่ระบบ', public: true } },
    {
      path: '/app', component: AppShell, meta: { requiresAuth: true },
      children: [
        { path: 'dashboard', name: 'dashboard', component: DashboardView, meta: { title: 'ภาพรวม' } },
        { path: 'connection', name: 'connection-test', component: GatewayPocView, meta: { title: 'ทดสอบการเชื่อมต่อ' } },
        { path: 'vehicles/search', name: 'vehicle-search', component: VehicleSearchPage, meta: { title: 'ค้นหายานพาหนะ', requiredPermissions: ['vehicle.lookup'] } },
        { path: 'forbidden', name: 'forbidden', component: ForbiddenPage, meta: { title: 'ไม่มีสิทธิ์เปิดงาน' } },
        { path: 'admin/users', name: 'user-directory', component: UserDirectoryPage, meta: { title: 'ผู้ใช้และสิทธิ์', requiredPermissions: ['users.manage'] } },
      ],
    },
    { path: '/', redirect: { name: 'dashboard' } },
    { path: '/:pathMatch(.*)*', redirect: { name: 'dashboard' } },
  ],
})

router.beforeEach(async (to) => {
  const auth = useSessionStore(pinia)
  if (to.meta.requiresAuth) {
    if (!auth.authenticated) return { name: 'sign-in', query: { redirect: to.fullPath } }
    if (!(await auth.restoreSession())) return { name: 'sign-in', query: { reason: 'session-expired' } }
    const required = Array.isArray(to.meta.requiredPermissions) ? to.meta.requiredPermissions : []
    if (required.some((permission) => !auth.permissions.includes(permission))) return { name: 'forbidden' }
  }
  if (to.name === 'sign-in' && auth.authenticated && await auth.restoreSession()) return { name: 'dashboard' }
  return true
})

router.afterEach((to) => {
  document.title = `${to.meta.title || 'P6 Vehicle Contact'} — P6 Vehicle Contact`
})
