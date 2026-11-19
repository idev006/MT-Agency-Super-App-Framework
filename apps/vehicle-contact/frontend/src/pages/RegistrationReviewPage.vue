<script setup>
import { inject, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { registrationReviewRepositoryKey } from '../application/registrations/registration-review-port.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import PaginationControl from '../components/common/PaginationControl.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import { formatBangkokDateTime } from '../domain/time/bangkok-date-time.js'
import { useRegistrationReview } from '../features/registrations/useRegistrationReview.js'
import { useSessionStore } from '../stores/session.js'

const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const work = useRegistrationReview({ repository: inject(registrationReviewRepositoryKey), permissions })
const pendingDecision = ref(null)
const platePhotoVerified = ref(false)

onMounted(work.load)

function requestDecision(decision) {
  if (!work.selected.value) return
  pendingDecision.value = { requestId: work.selected.value.requestId, decision }
}

async function confirmDecision() {
  const pending = pendingDecision.value
  pendingDecision.value = null
  if (!pending) return
  await work.review({ ...pending, platePhotoVerified: pending.decision === 'APPROVE' && platePhotoVerified.value })
  platePhotoVerified.value = false
}
</script>

<template>
  <PageTemplateComponent eyebrow="งานตรวจสอบ" title="ตรวจสอบการลงทะเบียน" description="พิจารณาคำขอลงทะเบียนจากหลักฐานที่ส่งมา ก่อนอนุมัติให้สร้างข้อมูลยานพาหนะและ QR">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span> / ตรวจสอบการลงทะเบียน</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>

    <div v-if="work.oneTimeQr.value" class="alert alert-success mb-5 items-start" role="status">
      <div class="min-w-0"><strong>อนุมัติแล้ว — บันทึก QR token ตอนนี้</strong><p class="mt-1 break-all font-mono text-sm">{{ work.oneTimeQr.value.token }}</p><p class="mt-1 text-sm">ระบบจะแสดงค่านี้ครั้งเดียว และไม่บันทึกไว้ใน browser</p></div>
      <button class="btn btn-sm" type="button" @click="work.clearOneTimeQr">ปิด</button>
    </div>

    <div v-if="work.phase.value === 'loading'" class="flex min-h-32 items-center justify-center" role="status"><span class="loading loading-spinner"></span><span class="sr-only">กำลังโหลดรายการ</span></div>
    <div v-else-if="work.phase.value === 'forbidden'" class="alert alert-warning">เซสชันนี้ไม่มีสิทธิ์ตรวจสอบการลงทะเบียน</div>
    <div v-else-if="work.phase.value === 'unauthenticated'" class="alert alert-warning">เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง</div>
    <div v-else-if="work.phase.value === 'error'" class="alert alert-error"><span>โหลดรายการไม่สำเร็จ ({{ work.failure.value?.code }})</span><button class="btn btn-sm" type="button" @click="work.load">ลองอีกครั้ง</button></div>
    <div v-else-if="work.phase.value === 'empty'" class="alert alert-info">ไม่มีคำขอลงทะเบียนที่รอตรวจสอบ</div>

    <template v-else>
      <div class="grid gap-5 xl:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.4fr)]">
        <section aria-labelledby="registration-queue-title">
          <h2 id="registration-queue-title" class="mb-3 text-xl font-semibold">รายการรอตรวจสอบ</h2>
          <ul class="list rounded-box border border-base-300 bg-base-100">
            <li v-for="item in work.registrations.value" :key="item.requestId" class="list-row grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div class="min-w-0"><strong class="block truncate">คำขอ {{ item.requestId }}</strong><p class="mt-1 text-sm text-base-content/65">ส่งเมื่อ {{ formatBangkokDateTime(item.submittedAt, '-') }}</p></div>
              <button class="btn btn-sm" type="button" @click="work.inspect(item.requestId)">ตรวจรายละเอียด</button>
            </li>
          </ul>
          <PaginationControl class="mt-4" :page="work.page.value" :page-size="work.pageSize.value" :total-items="work.pagination.value.total" :disabled="work.phase.value === 'loading'" label="แบ่งหน้าคำขอลงทะเบียน" @update:page="work.changePage" @update:page-size="work.changePageSize" />
        </section>

        <section class="rounded-box border border-base-300 bg-base-100 p-5 sm:p-6" aria-labelledby="registration-detail-title">
          <div v-if="work.phase.value === 'loading-detail'" class="flex min-h-48 items-center justify-center" role="status"><span class="loading loading-spinner"></span><span class="sr-only">กำลังโหลดรายละเอียด</span></div>
          <div v-else-if="!work.selected.value" class="grid min-h-48 place-items-center text-center text-base-content/65"><p>เลือกรายการเพื่อดูข้อมูลและหลักฐานก่อนตัดสินใจ</p></div>
          <template v-else>
            <div class="flex flex-wrap items-start justify-between gap-3"><div><p class="text-sm text-base-content/60">คำขอ {{ work.selected.value.requestId }}</p><h2 id="registration-detail-title" class="mt-1 text-2xl font-semibold">{{ work.selected.value.application.plate }} · {{ work.selected.value.application.province }}</h2></div><button class="btn btn-ghost btn-sm" type="button" @click="work.clearSelection">ปิดรายละเอียด</button></div>
            <dl class="mt-5 grid gap-4 sm:grid-cols-2">
              <div><dt class="text-sm text-base-content/60">ยานพาหนะ</dt><dd class="font-medium">{{ work.selected.value.application.brand }} {{ work.selected.value.application.model }} · {{ work.selected.value.application.color }}</dd></div>
              <div><dt class="text-sm text-base-content/60">ประเภท</dt><dd class="font-medium">{{ work.selected.value.application.vehicleType }} / {{ work.selected.value.application.plateType }}</dd></div>
              <div><dt class="text-sm text-base-content/60">ผู้ประสานงาน</dt><dd class="font-medium">{{ work.selected.value.application.contactName }} · {{ work.selected.value.application.contactPhone }}</dd></div>
              <div><dt class="text-sm text-base-content/60">ความสัมพันธ์</dt><dd class="font-medium">{{ work.selected.value.application.relationship }}</dd></div>
            </dl>
            <div class="mt-5"><h3 class="font-semibold">หลักฐานภาพ {{ work.selected.value.application.photos.length }} รายการ</h3><ul class="mt-2 grid gap-2 sm:grid-cols-2"><li v-for="photo in work.selected.value.application.photos" :key="photo.photoId" class="rounded-box bg-base-200 px-3 py-2 text-sm"><strong>{{ photo.slot }}</strong><span class="ml-2 text-base-content/75">{{ photo.mimeType || 'ไฟล์ภาพ' }}</span></li></ul></div>
            <label class="mt-5 flex min-h-11 cursor-pointer items-start gap-3 rounded-box border border-base-300 p-4"><input v-model="platePhotoVerified" class="checkbox checkbox-primary mt-0.5" type="checkbox" /><span><strong class="block">ตรวจสอบภาพป้ายทะเบียนแล้ว</strong><small class="text-base-content/65">ต้องยืนยันก่อนอนุมัติ ระบบจะสร้างยานพาหนะ ผู้ประสานงาน และ QR</small></span></label>
            <div class="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button class="btn" type="button" @click="requestDecision('REJECT')">ปฏิเสธคำขอ</button><button class="btn btn-primary" type="button" :disabled="!platePhotoVerified" @click="requestDecision('APPROVE')">อนุมัติการลงทะเบียน</button></div>
          </template>
        </section>
      </div>
    </template>

    <div v-if="work.actionPhase.value === 'uncertain'" class="alert alert-warning mt-5">ไม่ทราบผลการตัดสินใจแน่ชัด ห้ามกดซ้ำ ให้โหลดรายการใหม่และตรวจสถานะก่อน</div>
    <div v-else-if="work.actionPhase.value === 'error'" class="alert alert-error mt-5">บันทึกผลไม่สำเร็จ ({{ work.failure.value?.code }})</div>
    <template #footer><p class="text-sm text-base-content/70">สิทธิ์บนหน้าจอช่วยนำทางเท่านั้น GAS จะตรวจสิทธิ์และสถานะคำขออีกครั้งก่อนบันทึกผล</p></template>
  </PageTemplateComponent>

  <ConfirmDialog :open="Boolean(pendingDecision)" :title="pendingDecision?.decision === 'APPROVE' ? 'อนุมัติการลงทะเบียนหรือไม่' : 'ปฏิเสธคำขอหรือไม่'" :message="pendingDecision?.decision === 'APPROVE' ? 'ระบบจะสร้างข้อมูลยานพาหนะ ผู้ประสานงาน ภาพ และ QR จากคำขอนี้' : 'คำขอนี้จะถูกปฏิเสธและไม่สามารถอนุมัติซ้ำจากคิวเดิมได้'" :confirm-label="pendingDecision?.decision === 'APPROVE' ? 'ยืนยันการอนุมัติ' : 'ยืนยันการปฏิเสธ'" :busy="work.actionPhase.value === 'submitting'" @cancel="pendingDecision = null" @confirm="confirmDecision" />
</template>
