<script setup>
import { computed, inject, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { myVehiclesRepositoryKey } from '../application/vehicles/my-vehicles-port.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import PaginationControl from '../components/common/PaginationControl.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import { formatBangkokDateTime } from '../domain/time/bangkok-date-time.js'
import { useMyVehicles } from '../features/vehicle-changes/useMyVehicles.js'
import { useSessionStore } from '../stores/session.js'

const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const work = useMyVehicles({ repository: inject(myVehiclesRepositoryKey), permissions })
const form = ref({ brand: '', model: '', color: '', contactName: '', contactPhone: '' })
const confirming = ref(false)

const fieldLabels = { contactName: 'ชื่อผู้ประสานงาน', contactPhone: 'เบอร์โทรผู้ประสานงาน', brand: 'ยี่ห้อ', model: 'รุ่น', color: 'สี' }
const statusLabels = { PENDING: 'รอตรวจสอบ', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ปฏิเสธ' }
const statusBadge = { PENDING: 'badge-warning', APPROVED: 'badge-success', REJECTED: 'badge-error' }
const filledCount = computed(() => Object.values(form.value).filter((value) => value.trim()).length)

function shortId(value) {
  return typeof value === 'string' && value.length > 8 ? `${value.slice(0, 8)}…` : value
}

function deltaSummary(delta) {
  return Object.entries(delta || {}).map(([field, value]) => `${fieldLabels[field] || field}: ${value}`).join(' · ')
}

function openVehicle(vehicle) {
  form.value = { brand: vehicle.brand || '', model: vehicle.model || '', color: vehicle.color || '', contactName: '', contactPhone: '' }
  work.selectVehicle(vehicle)
}

onMounted(work.load)

async function confirmSubmit() {
  confirming.value = false
  await work.submitChange({ ...form.value })
}
</script>

<template>
  <PageTemplateComponent eyebrow="เจ้าของยานพาหนะ" title="ยานพาหนะของฉัน" description="ดูยานพาหนะที่คุณเป็นเจ้าของ ส่งคำขอเปลี่ยนแปลงข้อมูล และติดตามสถานะคำขอ">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span> / ยานพาหนะของฉัน</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>

    <div v-if="work.phase.value === 'loading'" class="flex min-h-32 items-center justify-center" role="status"><span class="loading loading-spinner"></span><span class="sr-only">กำลังโหลดรายการ</span></div>
    <div v-else-if="work.phase.value === 'forbidden'" class="alert alert-warning">เซสชันนี้ไม่มีสิทธิ์ดูยานพาหนะของตนเอง</div>
    <div v-else-if="work.phase.value === 'unauthenticated'" class="alert alert-warning">เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง</div>
    <div v-else-if="work.phase.value === 'error'" class="alert alert-error"><span>โหลดรายการไม่สำเร็จ ({{ work.failure.value?.code }})</span><button class="btn btn-sm" type="button" @click="work.load">ลองอีกครั้ง</button></div>
    <div v-else-if="work.phase.value === 'empty'" class="alert alert-info">ไม่มียานพาหนะที่คุณเป็นเจ้าของในระบบ</div>

    <template v-else>
      <div class="grid gap-5 xl:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.4fr)]">
        <section aria-labelledby="my-vehicles-title">
          <h2 id="my-vehicles-title" class="mb-3 text-xl font-semibold">ยานพาหนะของฉัน</h2>
          <ul class="list rounded-box border border-base-300 bg-base-100">
            <li v-for="vehicle in work.vehicles.value" :key="vehicle.vehicleId" class="list-row grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div class="min-w-0"><strong class="block truncate">{{ vehicle.plate }} · {{ vehicle.province }}</strong><p class="mt-1 text-sm text-base-content/65">{{ vehicle.brand }} {{ vehicle.model }} · {{ vehicle.color }}</p></div>
              <button class="btn btn-sm" type="button" @click="openVehicle(vehicle)">จัดการ</button>
            </li>
          </ul>
          <PaginationControl class="mt-4" :page="work.page.value" :page-size="work.pageSize.value" :total-items="work.pagination.value.total" :disabled="work.phase.value === 'loading'" label="แบ่งหน้ายานพาหนะของฉัน" @update:page="work.changePage" @update:page-size="work.changePageSize" />
        </section>

        <section class="rounded-box border border-base-300 bg-base-100 p-5 sm:p-6" aria-labelledby="my-vehicle-detail-title">
          <div v-if="!work.selectedVehicle.value" class="grid min-h-48 place-items-center text-center text-base-content/65"><p>เลือกยานพาหนะเพื่อส่งคำขอเปลี่ยนแปลงและติดตามสถานะ</p></div>
          <template v-else>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <h2 id="my-vehicle-detail-title" class="text-2xl font-semibold">{{ work.selectedVehicle.value.plate }} · {{ work.selectedVehicle.value.province }}</h2>
                <p class="mt-1 text-sm text-base-content/60">{{ work.selectedVehicle.value.brand }} {{ work.selectedVehicle.value.model }} · {{ work.selectedVehicle.value.color }} · <span class="font-mono" :title="work.selectedVehicle.value.vehicleId">{{ shortId(work.selectedVehicle.value.vehicleId) }}</span></p>
              </div>
              <button class="btn btn-ghost btn-sm" type="button" @click="work.clearSelection">ปิด</button>
            </div>

            <div v-if="work.lastSubmitted.value" class="alert alert-success mt-4" role="status"><span>ส่งคำขอแล้ว เลขที่ <span class="font-mono">{{ work.lastSubmitted.value.requestId }}</span> — รอผู้ตรวจสอบอนุมัติ</span></div>

            <fieldset class="fieldset mt-5 rounded-box border border-base-300 p-4">
              <legend class="fieldset-legend font-semibold">ส่งคำขอเปลี่ยนแปลง</legend>
              <p class="mb-3 text-sm text-base-content/65">กรอกเฉพาะรายการที่ต้องการเปลี่ยน ระบบจะส่งให้ผู้ตรวจสอบพิจารณาก่อนปรับปรุงข้อมูลจริง</p>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="field-stack"><span class="label-text font-semibold">ยี่ห้อ</span><input v-model.trim="form.brand" class="input input-bordered w-full" maxlength="100" /></label>
                <label class="field-stack"><span class="label-text font-semibold">รุ่น</span><input v-model.trim="form.model" class="input input-bordered w-full" maxlength="100" /></label>
                <label class="field-stack"><span class="label-text font-semibold">สี</span><input v-model.trim="form.color" class="input input-bordered w-full" maxlength="100" /></label>
                <label class="field-stack"><span class="label-text font-semibold">ชื่อผู้ประสานงาน</span><input v-model.trim="form.contactName" class="input input-bordered w-full" maxlength="100" /></label>
                <label class="field-stack sm:col-span-2"><span class="label-text font-semibold">เบอร์โทรผู้ประสานงาน</span><input v-model.trim="form.contactPhone" class="input input-bordered w-full" maxlength="20" inputmode="tel" placeholder="+66..." /></label>
              </div>
              <div class="mt-4 flex justify-end"><button class="btn btn-primary" type="button" :disabled="!work.canSubmit.value || filledCount === 0 || work.actionPhase.value === 'submitting'" @click="confirming = true"><span v-if="work.actionPhase.value === 'submitting'" class="loading loading-spinner loading-xs"></span>ส่งคำขอเปลี่ยนแปลง</button></div>
              <p v-if="!work.canSubmit.value" class="mt-2 text-xs text-base-content/60">เซสชันนี้ไม่มีสิทธิ์ส่งคำขอเปลี่ยนแปลง</p>
            </fieldset>

            <div class="mt-5">
              <h3 class="mb-3 font-semibold">คำขอของฉัน {{ work.selectedChanges.value.length }} รายการ</h3>
              <div v-if="!work.selectedChanges.value.length" class="text-sm text-base-content/65">ยังไม่มีคำขอเปลี่ยนแปลงสำหรับยานพาหนะนี้</div>
              <ul v-else class="list rounded-box border border-base-300">
                <li v-for="item in work.selectedChanges.value" :key="item.requestId" class="list-row grid-cols-1 gap-2">
                  <div class="min-w-0">
                    <p class="flex flex-wrap items-center gap-2"><span class="badge" :class="statusBadge[item.status] || 'badge-ghost'">{{ statusLabels[item.status] || item.status }}</span><span class="font-mono text-sm" :title="item.requestId">{{ shortId(item.requestId) }}</span></p>
                    <p class="mt-1 text-sm text-base-content/75">{{ deltaSummary(item.proposedDelta) }}</p>
                    <p class="mt-1 text-xs text-base-content/60">ส่งเมื่อ {{ formatBangkokDateTime(item.submittedAt, '-') }}<template v-if="item.reviewedAt"> · ตรวจเมื่อ {{ formatBangkokDateTime(item.reviewedAt, '-') }}</template></p>
                  </div>
                </li>
              </ul>
            </div>
          </template>
        </section>
      </div>
    </template>

    <div v-if="work.actionPhase.value === 'uncertain'" class="alert alert-warning mt-5">ไม่ทราบผลการส่งคำขอแน่ชัด ห้ามกดซ้ำ ให้โหลดรายการใหม่และตรวจสถานะก่อน</div>
    <div v-else-if="work.actionPhase.value === 'error'" class="alert alert-error mt-5">ส่งคำขอไม่สำเร็จ ({{ work.failure.value?.code }})</div>
    <template #footer><p class="text-sm text-base-content/70">สิทธิ์บนหน้าจอช่วยนำทางเท่านั้น GAS จะตรวจความเป็นเจ้าของและสิทธิ์อีกครั้งก่อนรับคำขอ</p></template>
  </PageTemplateComponent>

  <ConfirmDialog :open="confirming" title="ส่งคำขอเปลี่ยนแปลงหรือไม่" :message="`ระบบจะส่ง ${filledCount} รายการที่กรอกให้ผู้ตรวจสอบพิจารณา ข้อมูลจริงจะเปลี่ยนเมื่อได้รับอนุมัติเท่านั้น`" confirm-label="ยืนยันการส่งคำขอ" :busy="work.actionPhase.value === 'submitting'" @cancel="confirming = false" @confirm="confirmSubmit" />
</template>