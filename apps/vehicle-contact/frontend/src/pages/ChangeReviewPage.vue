<script setup>
import { computed, inject, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { changeReviewRepositoryKey } from '../application/vehicles/change-review-port.js'
import { vehicleDetailRepositoryKey } from '../application/vehicles/vehicle-detail-port.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import PaginationControl from '../components/common/PaginationControl.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import { formatBangkokDateTime } from '../domain/time/bangkok-date-time.js'
import { useChangeReview } from '../features/vehicle-changes/useChangeReview.js'
import { useSessionStore } from '../stores/session.js'

const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const work = useChangeReview({
  repository: inject(changeReviewRepositoryKey),
  detailRepository: inject(vehicleDetailRepositoryKey),
  permissions,
})
const pendingDecision = ref(null)
const copied = ref(false)
const deltaCount = computed(() => Object.keys(work.selected.value?.proposedDelta || {}).length)

function shortId(value) {
  return typeof value === 'string' && value.length > 8 ? `${value.slice(0, 8)}…` : value
}

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
  await work.review(pending)
}
</script>

<template>
  <PageTemplateComponent eyebrow="งานตรวจสอบ" title="ตรวจสอบคำขอเปลี่ยนแปลง" description="เปรียบเทียบข้อมูลปัจจุบันกับค่าที่เสนอ ก่อนอนุมัติให้ปรับปรุงยานพาหนะและผู้ประสานงาน">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span> / ตรวจสอบคำขอเปลี่ยนแปลง</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>

    <div v-if="work.phase.value === 'loading'" class="flex min-h-32 items-center justify-center" role="status"><span class="loading loading-spinner"></span><span class="sr-only">กำลังโหลดรายการ</span></div>
    <div v-else-if="work.phase.value === 'forbidden'" class="alert alert-warning">เซสชันนี้ไม่มีสิทธิ์ตรวจสอบคำขอเปลี่ยนแปลง</div>
    <div v-else-if="work.phase.value === 'unauthenticated'" class="alert alert-warning">เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง</div>
    <div v-else-if="work.phase.value === 'error'" class="alert alert-error"><span>โหลดรายการไม่สำเร็จ ({{ work.failure.value?.code }})</span><button class="btn btn-sm" type="button" @click="work.load">ลองอีกครั้ง</button></div>
    <div v-else-if="work.phase.value === 'empty'" class="alert alert-info">ไม่มีคำขอเปลี่ยนแปลงที่รอตรวจสอบ</div>

    <template v-else>
      <div class="grid gap-5 xl:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.4fr)]">
        <section aria-labelledby="change-queue-title">
          <h2 id="change-queue-title" class="mb-3 text-xl font-semibold">รายการรอตรวจสอบ</h2>
          <ul class="list rounded-box border border-base-300 bg-base-100">
            <li v-for="item in work.changes.value" :key="item.requestId" class="list-row grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div class="min-w-0"><strong class="block truncate">คำขอ <span class="font-mono" :title="item.requestId">{{ shortId(item.requestId) }}</span></strong><p class="mt-1 text-sm text-base-content/65">ส่งเมื่อ {{ formatBangkokDateTime(item.submittedAt, '-') }}</p></div>
              <button class="btn btn-sm" type="button" @click="work.inspect(item)">ตรวจรายละเอียด</button>
            </li>
          </ul>
          <PaginationControl class="mt-4" :page="work.page.value" :page-size="work.pageSize.value" :total-items="work.pagination.value.total" :disabled="work.phase.value === 'loading'" label="แบ่งหน้าคำขอเปลี่ยนแปลง" @update:page="work.changePage" @update:page-size="work.changePageSize" />
        </section>

        <section class="rounded-box border border-base-300 bg-base-100 p-5 sm:p-6" aria-labelledby="change-detail-title">
          <div v-if="work.phase.value === 'loading-detail'" class="flex min-h-48 items-center justify-center" role="status"><span class="loading loading-spinner"></span><span class="sr-only">กำลังโหลดรายละเอียด</span></div>
          <div v-else-if="!work.selected.value" class="grid min-h-48 place-items-center text-center text-base-content/65"><p>เลือกรายการเพื่อดูข้อมูลปัจจุบันและค่าที่เสนอก่อนตัดสินใจ</p></div>
          <template v-else>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="flex flex-wrap items-center gap-2 text-sm text-base-content/60">
                  <span>คำขอ <span class="font-mono" :title="work.selected.value.requestId">{{ shortId(work.selected.value.requestId) }}</span></span>
                  <button class="btn btn-ghost btn-sm" type="button" @click="copyRequestId">{{ copied ? 'คัดลอกแล้ว' : 'คัดลอกเลขเต็ม' }}</button>
                  <span class="badge badge-warning">PENDING</span>
                </p>
                <h2 id="change-detail-title" class="mt-1 text-2xl font-semibold">ยานพาหนะ <span class="font-mono">{{ shortId(work.selected.value.vehicleId) }}</span></h2>
                <p class="mt-1 text-sm text-base-content/60">ส่งเมื่อ {{ formatBangkokDateTime(work.selected.value.submittedAt, '-') }} · เสนอเปลี่ยน {{ deltaCount }} รายการ</p>
              </div>
              <button class="btn btn-ghost btn-sm" type="button" @click="work.clearSelection">ปิดรายละเอียด</button>
            </div>

            <div v-if="work.currentVehicle.value" class="mt-4 rounded-box border border-base-300 bg-base-200 p-4">
              <p class="text-sm text-base-content/60">ข้อมูลปัจจุบัน</p>
              <p class="mt-1 font-medium">{{ work.currentVehicle.value.plate }} · {{ work.currentVehicle.value.province }}</p>
              <p class="text-sm text-base-content/70">{{ work.currentVehicle.value.brand }} {{ work.currentVehicle.value.model }} · {{ work.currentVehicle.value.color }}</p>
            </div>

            <div class="mt-5 overflow-x-auto">
              <table class="table table-zebra">
                <thead><tr><th>รายการ</th><th>ค่าปัจจุบัน</th><th>ค่าที่เสนอ</th></tr></thead>
                <tbody>
                  <tr v-for="row in work.diffRows.value" :key="row.field">
                    <td class="font-medium">{{ row.label }}</td>
                    <td class="text-base-content/70">{{ row.current || '—' }}</td>
                    <td class="font-semibold text-primary">{{ row.proposed }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="mt-2 text-xs text-base-content/60">ค่าปัจจุบันดึงจาก GAS ตามสิทธิ์ของเซสชัน การอนุมัติจะปรับปรุงยานพาหนะและผู้ประสานงานหลักทันที</p>

            <div class="sticky bottom-0 z-10 mt-5 flex flex-col-reverse gap-3 border-t border-base-300 bg-base-100 py-3 sm:static sm:flex-row sm:justify-end sm:border-0 sm:py-0"><button class="btn" type="button" @click="requestDecision('REJECT')">ปฏิเสธคำขอ</button><button class="btn btn-primary" type="button" @click="requestDecision('APPROVE')">อนุมัติการเปลี่ยนแปลง</button></div>
          </template>
        </section>
      </div>
    </template>

    <div v-if="work.actionPhase.value === 'uncertain'" class="alert alert-warning mt-5">ไม่ทราบผลการตัดสินใจแน่ชัด ห้ามกดซ้ำ ให้โหลดรายการใหม่และตรวจสถานะก่อน</div>
    <div v-else-if="work.actionPhase.value === 'error'" class="alert alert-error mt-5">บันทึกผลไม่สำเร็จ ({{ work.failure.value?.code }})</div>
    <template #footer><p class="text-sm text-base-content/70">สิทธิ์บนหน้าจอช่วยนำทางเท่านั้น GAS จะตรวจสิทธิ์และสถานะคำขออีกครั้งก่อนบันทึกผล</p></template>
  </PageTemplateComponent>

  <ConfirmDialog :open="Boolean(pendingDecision)" :title="pendingDecision?.decision === 'APPROVE' ? 'อนุมัติการเปลี่ยนแปลงหรือไม่' : 'ปฏิเสธคำขอหรือไม่'" :message="pendingDecision?.decision === 'APPROVE' ? 'ระบบจะปรับปรุงข้อมูลยานพาหนะและผู้ประสานงานหลักตามค่าที่เสนอทันที' : 'คำขอนี้จะถูกปฏิเสธและไม่สามารถอนุมัติซ้ำจากคิวเดิมได้'" :confirm-label="pendingDecision?.decision === 'APPROVE' ? 'ยืนยันการอนุมัติ' : 'ยืนยันการปฏิเสธ'" :busy="work.actionPhase.value === 'submitting'" @cancel="pendingDecision = null" @confirm="confirmDecision" />
</template>