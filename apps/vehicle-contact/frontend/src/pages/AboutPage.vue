<script setup>
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import packageInfo from '../../package.json'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import { labelsForRoles } from '../domain/identity/role-presentation.js'
import { useSessionStore } from '../stores/session.js'

// Owner 2026-11-25: system information lives on ONE page ("เกี่ยวกับระบบ"), not in every page footer.
// Shown in user language: no backend product names, no endpoints, no tokens.
const auth = useSessionStore()
const { backendRelease, phase, busy, roles, session } = storeToRefs(auth)
onMounted(() => { if (!backendRelease.value) auth.checkConnection() })

const statusLabel = computed(() => {
  if (phase.value === 'checking') return 'กำลังตรวจสอบ'
  return backendRelease.value?.status === 'ready' ? 'พร้อมใช้งาน' : backendRelease.value ? 'ไม่พร้อมใช้งาน' : 'ยังไม่ได้ตรวจสอบ'
})
const statusTone = computed(() => backendRelease.value?.status === 'ready' ? 'status-success' : 'status-warning')
const expiry = computed(() => {
  const at = session.value?.expiresAt
  if (!at || Number.isNaN(Date.parse(at))) return '—'
  return new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(at)) + ' น.'
})
const systemRows = computed(() => [
  ['สถานะระบบ', statusLabel.value],
  ['เวอร์ชันหน้าเว็บ', packageInfo.version],
  ['เวอร์ชันระบบหลัก', backendRelease.value?.backendVersion || '—'],
  ['รุ่น API', backendRelease.value?.apiVersion || '—'],
  ['สภาพแวดล้อม', 'ระบบทดสอบ · ใช้ข้อมูลสมมติเท่านั้น ห้ามใช้ข้อมูลบุคคลจริง'],
])
const sessionRows = computed(() => [
  ['ผู้ใช้', session.value?.displayName || '—'],
  ['หน้าที่', labelsForRoles(roles.value).join(' · ') || '—'],
  ['เซสชันสิ้นสุด', expiry.value],
])
const safeguards = Object.freeze([
  ['การตรวจสิทธิ์', 'ระบบหลักตรวจเซสชันและสิทธิ์ทุกคำสั่ง เมนูบนหน้าจอเป็นเพียงตัวช่วยนำทาง'],
  ['การค้นหาและเปิดดูข้อมูล', 'ทุกการค้นหา การเปิดรายละเอียด และการตรวจ QR ถูกบันทึกเป็นประวัติการใช้งาน (audit)'],
  ['QR ยานพาหนะ', 'ต้องเข้าสู่ระบบด้วยสิทธิ์เจ้าหน้าที่ก่อนจึงเห็นข้อมูลรถ QR ที่ถูกเพิกถอนจะไม่เปิดเผยข้อมูลใด ๆ'],
  ['ภาพยานพาหนะ', 'จัดเก็บใน Google Drive ของหน่วยงาน และเปิดดูผ่านระบบเมื่อมีสิทธิ์เท่านั้น'],
  ['การเปลี่ยนแปลงข้อมูล', 'การแก้ไข อนุมัติ และปฏิเสธ ถูกบันทึกค่าก่อนและหลังเปลี่ยน พร้อมป้องกันการแก้ไขชนกัน'],
  ['บัญชีผู้ใช้', 'การระงับ รีเซ็ตรหัสผ่าน หรือเปลี่ยนบทบาท ทำให้เซสชันเดิมใช้ไม่ได้ทันที'],
  ['แคมเปญลงทะเบียน', 'ลิงก์คัดลอกได้ตลอดเวลา ถ้าลิงก์หลุดไปที่ที่ไม่ต้องการ ให้เพิกถอนแคมเปญแล้วสร้างใหม่'],
  ['การเก็บรักษาข้อมูล', 'การลบตามระยะเก็บรักษาต้องได้รับอนุมัติก่อนเสมอ และไม่ลบประวัติการใช้งาน'],
])
</script>

<template>
  <PageTemplateComponent eyebrow="ข้อมูลระบบ" title="เกี่ยวกับระบบ" description="P6 Vehicle Contact — ระบบลงทะเบียน ค้นหา และติดต่อผู้ประสานงานยานพาหนะด้วยทะเบียนรถหรือ QR">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span aria-hidden="true"> / </span><span aria-current="page">เกี่ยวกับระบบ</span></template>
    <div class="grid gap-6 lg:grid-cols-2">
      <section class="card card-border min-w-0 bg-base-100 shadow-none" aria-labelledby="about-system">
        <div class="card-body gap-3 p-5">
          <div class="flex items-center justify-between gap-2">
            <h2 id="about-system" class="card-title text-lg">สถานะและเวอร์ชัน</h2>
            <span class="flex items-center gap-2 text-sm"><span class="status" :class="statusTone" aria-hidden="true"></span>{{ statusLabel }}</span>
          </div>
          <div class="p6-table-wrap" tabindex="0" role="region" aria-labelledby="about-system"><table class="p6-table"><tbody>
            <tr v-for="[label, value] in systemRows" :key="label"><th>{{ label }}</th><td class="p6-col-text">{{ value }}</td></tr>
          </tbody></table></div>
          <div class="card-actions justify-end"><button class="btn btn-sm" type="button" :disabled="busy" @click="auth.checkConnection"><span v-if="phase === 'checking'" class="loading loading-spinner loading-sm"></span>ตรวจสถานะอีกครั้ง</button></div>
        </div>
      </section>
      <section class="card card-border min-w-0 bg-base-100 shadow-none" aria-labelledby="about-session">
        <div class="card-body gap-3 p-5">
          <h2 id="about-session" class="card-title text-lg">เซสชันของคุณ</h2>
          <div class="p6-table-wrap" tabindex="0" role="region" aria-labelledby="about-session"><table class="p6-table"><tbody>
            <tr v-for="[label, value] in sessionRows" :key="label"><th>{{ label }}</th><td class="p6-col-text">{{ value }}</td></tr>
          </tbody></table></div>
        </div>
      </section>
    </div>
    <section class="card card-border mt-6 bg-base-100 shadow-none" aria-labelledby="about-safeguards">
      <div class="card-body gap-3 p-5">
        <h2 id="about-safeguards" class="card-title text-lg">การคุ้มครองข้อมูลและความปลอดภัย</h2>
        <div class="p6-table-wrap" tabindex="0" role="region" aria-labelledby="about-safeguards"><table class="p6-table">
          <thead><tr><th>เรื่อง</th><th>ระบบทำอย่างไร</th></tr></thead>
          <tbody><tr v-for="[topic, detail] in safeguards" :key="topic"><th>{{ topic }}</th><td class="p6-col-text">{{ detail }}</td></tr></tbody>
        </table></div>
      </div>
    </section>
  </PageTemplateComponent>
</template>
