<script setup>
import { computed, inject, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { registrationReviewRepositoryKey } from '../application/registrations/registration-review-port.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import PaginationControl from '../components/common/PaginationControl.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import { formatBangkokDateTime } from '../domain/time/bangkok-date-time.js'
import { useRegistrationReview } from '../features/registrations/useRegistrationReview.js'
import { provinceLabel } from '../domain/reference/provinces.js'
import { formatThaiPhone, photoSlotLabel } from '../domain/reference/vehicle-presentation.js'
import { useRegistrationReferenceStore } from '../stores/registration-reference.js'
import { useSessionStore } from '../stores/session.js'

const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const work = useRegistrationReview({ repository: inject(registrationReviewRepositoryKey), permissions })
const pendingDecision = ref(null)
const platePhotoVerified = ref(false)
const copied = ref(false)
const qrCopied = ref(false)
const { lists } = storeToRefs(useRegistrationReferenceStore())
const application = computed(() => work.selected.value?.application || {})

// R5: reviewers read Thai labels, not reference codes; the code stays in the tooltip.
function labelOf(key, code) {
  return lists.value?.[key]?.find((item) => item.code === code)?.label || code || '—'
}
function waitingFor(value) {
  const ms = Date.now() - Date.parse(value)
  if (!Number.isFinite(ms) || ms < 0) return ''
  const hours = Math.floor(ms / 3_600_000)
  return hours >= 24 ? `รอ ${Math.floor(hours / 24)} วัน` : hours >= 1 ? `รอ ${hours} ชม.` : 'เพิ่งส่ง'
}
async function copyQrToken() {
  try { await navigator.clipboard.writeText(work.oneTimeQr.value.token); qrCopied.value = true } catch { /* token stays selectable */ }
}

const detailPhotos = computed(() => work.selected.value?.application?.photos || [])
const activePhotoState = computed(() => work.photoStates.value[work.activePhotoId.value] || null)
const activeSlot = computed(() => detailPhotos.value.find((photo) => photo.photoId === work.activePhotoId.value)?.slot || '')

function shortId(value) {
  return typeof value === 'string' && value.length > 8 ? `${value.slice(0, 8)}…` : value
}

const slotLabel = photoSlotLabel

async function copyRequestId() {
  if (!work.selected.value) return
  try {
    await navigator.clipboard.writeText(work.selected.value.requestId)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch { /* clipboard unavailable; full id remains selectable via title */ }
}

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

    <div v-if="work.oneTimeQr.value" class="alert alert-success mb-3 items-start py-2" role="status">
      <div class="min-w-0"><strong>อนุมัติแล้ว — คัดลอกรหัส QR ไปพิมพ์สติกเกอร์ตอนนี้</strong><p class="mt-1 break-all font-mono text-sm">{{ work.oneTimeQr.value.token }}</p><p class="mt-1 text-sm">ระบบแสดงค่านี้ครั้งเดียวและไม่บันทึกใน browser (ถ้าพลาด ให้ผู้ดูแลออก QR ใหม่ที่หน้า “จัดการ QR”)</p></div>
      <div class="flex gap-2"><button class="btn btn-sm" type="button" @click="copyQrToken">{{ qrCopied ? 'คัดลอกแล้ว' : 'คัดลอก' }}</button><button class="btn btn-sm" type="button" @click="work.clearOneTimeQr(); qrCopied = false">ปิด</button></div>
    </div>

    <div v-if="work.phase.value === 'loading'" class="flex min-h-24 items-center justify-center" role="status"><span class="loading loading-spinner"></span><span class="sr-only">กำลังโหลดรายการ</span></div>
    <div v-else-if="work.phase.value === 'forbidden'" class="alert alert-warning py-2">เซสชันนี้ไม่มีสิทธิ์ตรวจสอบการลงทะเบียน</div>
    <div v-else-if="work.phase.value === 'unauthenticated'" class="alert alert-warning py-2">เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง</div>
    <div v-else-if="work.phase.value === 'error'" class="alert alert-error py-2"><span>โหลดรายการไม่สำเร็จ ({{ work.failure.value?.code }})</span><button class="btn btn-sm" type="button" @click="work.load">ลองอีกครั้ง</button></div>
    <div v-else-if="work.phase.value === 'empty'" class="alert alert-info py-2">ไม่มีคำขอลงทะเบียนที่รอตรวจสอบ — คิวนี้แสดงเฉพาะคำขอสถานะ “รอตรวจ” คำขอที่อนุมัติหรือปฏิเสธแล้วจะไม่ปรากฏที่นี่</div>

    <template v-else>
      <div class="grid gap-3 xl:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.5fr)]">
        <section aria-labelledby="registration-queue-title">
          <h2 id="registration-queue-title" class="mb-2 text-base font-semibold">รายการรอตรวจสอบ</h2>
          <ul class="list rounded-box border border-base-300 bg-base-100 [&>li]:py-2">
            <li v-for="item in work.registrations.value" :key="item.requestId" class="list-row grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div class="min-w-0"><strong class="block truncate">คำขอ <span class="font-mono" :title="item.requestId">{{ shortId(item.requestId) }}</span></strong><p class="mt-0.5 text-sm text-base-content/80">ส่งเมื่อ {{ formatBangkokDateTime(item.submittedAt, '-') }} <span class="badge badge-ghost badge-sm">{{ waitingFor(item.submittedAt) }}</span></p></div>
              <button class="btn btn-sm" type="button" @click="work.inspect(item.requestId)">ตรวจรายละเอียด</button>
            </li>
          </ul>
          <PaginationControl class="mt-3" :page="work.page.value" :page-size="work.pageSize.value" :total-items="work.pagination.value.total" :disabled="work.phase.value === 'loading'" label="แบ่งหน้าคำขอลงทะเบียน" @update:page="work.changePage" @update:page-size="work.changePageSize" />
        </section>

        <section class="rounded-box border border-base-300 bg-base-100 p-3 sm:p-4 xl:max-h-[calc(100vh-13rem)] xl:overflow-y-auto" aria-labelledby="registration-detail-title">
          <div v-if="work.phase.value === 'loading-detail'" class="flex min-h-32 items-center justify-center" role="status"><span class="loading loading-spinner"></span><span class="sr-only">กำลังโหลดรายละเอียด</span></div>
          <div v-else-if="!work.selected.value" class="grid min-h-32 place-items-center text-center text-base text-base-content/80"><p>เลือกรายการเพื่อดูข้อมูลและหลักฐานก่อนตัดสินใจ</p></div>
          <template v-else>
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="flex flex-wrap items-center gap-1.5 text-sm text-base-content/80">
                  <span>คำขอ <span class="font-mono" :title="work.selected.value.requestId">{{ shortId(work.selected.value.requestId) }}</span></span>
                  <button class="btn btn-ghost btn-sm" type="button" @click="copyRequestId">{{ copied ? 'คัดลอกแล้ว' : 'คัดลอกเลขเต็ม' }}</button>
                  <span class="badge badge-warning badge-sm">{{ work.selected.value.status === 'PENDING_APPROVAL' ? 'รอตรวจ' : work.selected.value.status }}</span>
                </p>
                <h2 id="registration-detail-title" class="mt-0.5 text-lg font-semibold">{{ application.plate }} · <span :title="application.province">{{ provinceLabel(application.province) || application.province }}</span></h2>
                <p class="mt-0.5 text-sm text-base-content/80">ส่งเมื่อ {{ formatBangkokDateTime(work.selected.value.submittedAt, '-') }}</p>
              </div>
              <button class="btn btn-ghost btn-sm" type="button" @click="work.clearSelection">ปิดรายละเอียด</button>
            </div>
            <dl class="mt-3 grid gap-2 sm:grid-cols-2">
              <div><dt class="text-sm text-base-content/80">ยานพาหนะ</dt><dd class="font-medium">{{ labelOf('brands', application.brand) }} {{ application.model }} · {{ labelOf('colors', application.color) }}</dd></div>
              <div><dt class="text-sm text-base-content/80">ประเภท</dt><dd class="font-medium">{{ labelOf('vehicleTypes', application.vehicleType) }} / {{ labelOf('plateTypes', application.plateType) }}</dd></div>
              <div><dt class="text-sm text-base-content/80">ผู้ประสานงาน</dt><dd class="font-medium">{{ application.contactName }} · <span class="font-mono">{{ formatThaiPhone(application.contactPhone) }}</span></dd></div>
              <div><dt class="text-sm text-base-content/80">ความสัมพันธ์</dt><dd class="font-medium">{{ labelOf('relationships', application.relationship) }}</dd></div>
            </dl>
            <div class="mt-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="text-sm font-semibold">หลักฐานภาพ {{ detailPhotos.length }} รายการ</h3>
                <span v-if="activeSlot" class="badge badge-ghost badge-sm">{{ slotLabel(activeSlot) }}</span>
              </div>
              <div class="mt-2 overflow-hidden rounded-box border border-base-300 bg-base-200">
                <div class="relative aspect-[4/3] w-full max-h-64">
                  <img v-if="activePhotoState?.status === 'ready'" :src="activePhotoState.dataUrl" :alt="`ภาพหลักฐานยานพาหนะ ${slotLabel(activeSlot)}`" class="absolute inset-0 h-full w-full object-contain" />
                  <div v-else-if="activePhotoState?.status === 'error'" class="absolute inset-0 grid place-items-center p-4 text-center">
                    <div>
                      <p class="text-sm text-base-content/80">โหลดภาพไม่สำเร็จ ({{ activePhotoState.code }})</p>
                      <button class="btn btn-sm mt-2" type="button" @click="work.retryPhoto(work.activePhotoId.value)">ลองใหม่</button>
                    </div>
                  </div>
                  <div v-else class="absolute inset-0 grid place-items-center" role="status"><span class="loading loading-spinner loading-lg"></span><span class="sr-only">กำลังโหลดภาพหลักฐาน</span></div>
                </div>
              </div>
              <ul class="mt-2 grid grid-cols-5 gap-1.5">
                <li v-for="photo in detailPhotos" :key="photo.photoId">
                  <button type="button" class="block w-full overflow-hidden rounded-box border-2 bg-base-200"
                    :class="photo.photoId === work.activePhotoId.value ? 'border-primary' : 'border-transparent hover:border-base-300'"
                    :aria-pressed="photo.photoId === work.activePhotoId.value"
                    @click="work.selectPhoto(photo.photoId)">
                    <span class="sr-only">ดูภาพ</span>
                    <span class="relative block aspect-square w-full">
                      <img v-if="work.photoStates.value[photo.photoId]?.status === 'ready'" :src="work.photoStates.value[photo.photoId].dataUrl" alt="" class="absolute inset-0 h-full w-full object-cover" />
                      <span v-else-if="work.photoStates.value[photo.photoId]?.status === 'error'" class="absolute inset-0 grid place-items-center text-xs text-error">ผิดพลาด</span>
                      <span v-else class="skeleton absolute inset-0"></span>
                    </span>
                    <span class="block truncate px-1 py-1 text-center text-[11px] leading-tight text-base-content/80">{{ slotLabel(photo.slot) }}</span>
                  </button>
                </li>
              </ul>
              <p class="mt-2 text-sm text-base-content/80">ภาพแสดงในหน่วยความจำเท่านั้น ไม่บันทึกลงเครื่อง และการเปิดภาพแต่ละครั้งถูกบันทึก audit</p>
            </div>
            <label class="mt-3 flex min-h-11 cursor-pointer items-start gap-2 rounded-box border border-base-300 p-3"><input v-model="platePhotoVerified" class="checkbox checkbox-primary mt-0.5" type="checkbox" /><span><strong class="block">ตรวจสอบภาพป้ายทะเบียนแล้ว</strong><small class="text-base-content/80">ต้องยืนยันก่อนอนุมัติ ระบบจะสร้างยานพาหนะ ผู้ประสานงาน และ QR</small></span></label>
            <div class="sticky bottom-0 z-10 mt-3 flex flex-col-reverse gap-2 border-t border-base-300 bg-base-100 py-2 sm:static sm:flex-row sm:justify-end sm:border-0 sm:py-0"><button class="btn" type="button" @click="requestDecision('REJECT')">ปฏิเสธคำขอ</button><button class="btn btn-primary" type="button" :disabled="!platePhotoVerified" @click="requestDecision('APPROVE')">อนุมัติการลงทะเบียน</button></div>
          </template>
        </section>
      </div>
    </template>

    <div v-if="work.actionPhase.value === 'uncertain'" class="alert alert-warning mt-3" role="alert"><div><p class="font-semibold">ไม่ทราบผลแน่ชัด (การเชื่อมต่อขาดระหว่างบันทึก)</p><p class="text-sm">กด “ส่งการตัดสินใจเดิมซ้ำ” ได้อย่างปลอดภัย ถ้าบันทึกไปแล้ว ระบบจะคืนผลเดิม (รวม QR เดิม) และไม่สร้างซ้ำ ห้ามเปลี่ยนเป็นการตัดสินใจอื่น</p></div><button class="btn btn-sm" type="button" @click="work.resendDecision">ส่งการตัดสินใจเดิมซ้ำ ({{ work.lastDecision.value?.decision === 'APPROVE' ? 'อนุมัติ' : 'ปฏิเสธ' }})</button></div>
    <div v-else-if="work.actionPhase.value === 'error'" class="alert alert-error mt-3">บันทึกผลไม่สำเร็จ ({{ work.failure.value?.code }})</div>
    <template #footer><p class="text-sm text-base-content/80">สิทธิ์บนหน้าจอช่วยนำทางเท่านั้น GAS จะตรวจสิทธิ์และสถานะคำขออีกครั้งก่อนบันทึกผล</p></template>
  </PageTemplateComponent>

  <ConfirmDialog :open="Boolean(pendingDecision)" :title="pendingDecision?.decision === 'APPROVE' ? 'อนุมัติการลงทะเบียนหรือไม่' : 'ปฏิเสธคำขอหรือไม่'" :message="pendingDecision?.decision === 'APPROVE' ? 'ระบบจะสร้างข้อมูลยานพาหนะ ผู้ประสานงาน ภาพ และ QR จากคำขอนี้' : 'คำขอนี้จะถูกปฏิเสธและไม่สามารถอนุมัติซ้ำจากคิวเดิมได้'" :confirm-label="pendingDecision?.decision === 'APPROVE' ? 'ยืนยันการอนุมัติ' : 'ยืนยันการปฏิเสธ'" :busy="work.actionPhase.value === 'submitting'" @cancel="pendingDecision = null" @confirm="confirmDecision" />
</template>
