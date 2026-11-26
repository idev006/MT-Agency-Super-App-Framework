<script setup>
import { computed, ref, watch } from 'vue'
import DataTable from '../../../components/common/DataTable.vue'
import FormDialog from '../../../components/common/FormDialog.vue'
import { daysText, validLogDays } from '../../../domain/settings/log-policy.js'

// VC-ADR-040 (owner 2026-11-26: "การเก็บประวัติต่างๆ ไม่จำเป็น ... เปลืองค่าใช้จ่าย" → "ควรให้ system admin ตั้งค่าการบันทึก
// logs ต่างๆ ได้"): per kind of log, on/off + how many days it is kept. Required logs show a lock instead of a switch.
// The server re-checks every rule; this card only edits a draft and saves all five at once.
const props = defineProps({
  policy: { type: Array, required: true },
  counts: { type: Object, default: null },
  canManage: Boolean,
  phase: { type: String, default: 'idle' }, // idle | submitting | success | error | uncertain | forbidden
  failureCode: { type: String, default: '' },
})
const emit = defineEmits(['save'])
const columns = [
  { key: 'label', label: 'ประเภท / ใช้ทำอะไร', kind: 'name' },
  { key: 'enabled', label: 'บันทึก', kind: 'nowrap' },
  { key: 'days', label: 'เก็บไว้', kind: 'nowrap' },
  { key: 'count', label: 'มีอยู่ตอนนี้', kind: 'number' },
]
const ERRORS = Object.freeze({
  INVALID_LOG_POLICY: 'จำนวนวันไม่อยู่ในช่วงที่กำหนด กรุณาตรวจอีกครั้ง',
  LOG_REQUIRED: 'บันทึกประเภทนี้ปิดไม่ได้',
  FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์แก้ไข',
})
const errorText = computed(() => ERRORS[props.failureCode] || (props.failureCode ? `บันทึกไม่สำเร็จ (${props.failureCode})` : 'บันทึกไม่สำเร็จ'))

const draft = ref([])
const reset = () => { draft.value = props.policy.map((k) => ({ ...k, forever: k.days === 0, daysInput: k.days === 0 ? k.defaultDays || k.minDays : k.days })) }
watch(() => props.policy, reset, { immediate: true })
const daysOf = (k) => (k.forever ? 0 : Number(k.daysInput))
const rowValid = (k) => validLogDays(k, daysOf(k))
const dirty = computed(() => draft.value.some((k, i) => k.enabled !== props.policy[i]?.enabled || daysOf(k) !== props.policy[i]?.days))
const allValid = computed(() => draft.value.every(rowValid))
// switching a kind off asks first (what can no longer be traced)
const turnedOff = computed(() => draft.value.filter((k, i) => !k.enabled && props.policy[i]?.enabled))
const confirming = ref(false)
const busy = computed(() => props.phase === 'submitting')
function requestSave() {
  if (!dirty.value || !allValid.value || busy.value) return
  if (turnedOff.value.length) { confirming.value = true; return }
  save()
}
function save() {
  emit('save', draft.value.map((k) => ({ code: k.code, enabled: k.enabled, days: daysOf(k) })), () => { confirming.value = false })
}
const rows = computed(() => draft.value.map((k, index) => ({ ...k, index, count: props.counts?.[k.code] })))
const countText = (n) => (Number.isSafeInteger(n) ? n.toLocaleString('th-TH') : '—')
</script>

<template>
  <section class="card card-border bg-base-100 shadow-none" aria-labelledby="log-settings-title">
    <div class="card-body gap-4">
      <div>
        <h2 id="log-settings-title" class="card-title">การบันทึกประวัติ</h2>
        <p class="text-sm text-base-content/80">เลือกว่าจะบันทึกอะไร และเก็บไว้นานเท่าไร ครบกำหนดแล้วระบบลบให้เอง ค่าที่เปลี่ยนใช้กับบันทึกใหม่ (บันทึกเดิมยังอยู่) ทุกการเปลี่ยนจะถูกบันทึกว่าใครเปลี่ยน เมื่อไร</p>
      </div>
      <div v-if="phase === 'error' || phase === 'uncertain'" class="alert alert-error" role="alert"><span>{{ phase === 'uncertain' ? 'ไม่สามารถยืนยันผลการบันทึกได้ กรุณาโหลดหน้าใหม่' : errorText }}</span></div>
      <div v-else-if="phase === 'success' && !dirty" class="alert alert-success" role="status"><span>บันทึกการตั้งค่าการบันทึกประวัติแล้ว</span></div>
      <DataTable :columns="columns" :rows="rows" row-key="code" label="การบันทึกประวัติ">
        <template #cell-label="{ row }">{{ row.label }}<span class="p6-col-sub font-normal">{{ row.use }}</span></template>
        <template #cell-enabled="{ row }">
          <label v-if="row.canDisable" class="flex min-h-11 cursor-pointer items-center gap-2">
            <input v-model="draft[row.index].enabled" type="checkbox" class="toggle toggle-primary" :disabled="!canManage || busy" :data-log-toggle="row.code" :aria-label="`บันทึก ${row.label}`" />
            <span>{{ draft[row.index].enabled ? 'บันทึก' : 'ไม่บันทึก' }}</span>
          </label>
          <span v-else class="badge badge-ghost whitespace-nowrap" :data-log-locked="row.code" title="ปิดไม่ได้">บันทึกเสมอ</span>
        </template>
        <template #cell-days="{ row }">
          <div v-if="canManage">
            <div class="flex items-center gap-2">
            <input v-model.number="draft[row.index].daysInput" type="number" inputmode="numeric" class="input input-bordered input-sm w-24"
              :class="rowValid(draft[row.index]) ? '' : 'input-error'" :min="row.minDays" :max="row.maxDays" :disabled="busy || draft[row.index].forever"
              :data-log-days="row.code" :aria-label="`จำนวนวันที่เก็บ ${row.label}`" />
            <span class="text-sm">วัน</span>
            <label v-if="row.allowForever" class="flex cursor-pointer items-center gap-1 text-sm"><input v-model="draft[row.index].forever" type="checkbox" class="checkbox checkbox-sm" :disabled="busy" :data-log-forever="row.code" />ไม่จำกัด</label>
            </div>
            <small class="p6-col-sub">{{ row.minDays }}–{{ row.maxDays }} วัน</small>
          </div>
          <span v-else class="whitespace-nowrap">{{ daysText(row.days) }}</span>
        </template>
        <template #cell-count="{ row }">{{ countText(row.count) }}</template>
      </DataTable>
      <div v-if="canManage" class="flex flex-wrap justify-end gap-2">
        <button class="btn" type="button" :disabled="!dirty || busy" @click="reset">ยกเลิกการแก้ไข</button>
        <button class="btn btn-primary" type="button" :disabled="!dirty || !allValid || busy" data-log-save @click="requestSave"><span v-if="busy" class="loading loading-spinner loading-sm"></span>บันทึกการตั้งค่า</button>
      </div>
    </div>

    <FormDialog :open="confirming" title="ยืนยันการหยุดบันทึก" @close="confirming = false">
      <div class="grid gap-3">
        <p>จะหยุดบันทึกประวัติต่อไปนี้:</p>
        <ul class="list-disc space-y-1 pl-5">
          <li v-for="k in turnedOff" :key="k.code"><strong>{{ k.label }}</strong> — {{ k.offWarning || 'จะตรวจย้อนรายการนี้ไม่ได้' }}</li>
        </ul>
        <p class="text-sm text-base-content/70">บันทึกเดิมยังอยู่จนครบกำหนดวันเก็บ เปิดกลับได้ทุกเมื่อ</p>
        <div class="flex justify-end gap-2">
          <button class="btn" type="button" @click="confirming = false">ยกเลิก</button>
          <button class="btn btn-warning" type="button" :disabled="busy" data-log-confirm @click="save">หยุดบันทึก</button>
        </div>
      </div>
    </FormDialog>
  </section>
</template>
