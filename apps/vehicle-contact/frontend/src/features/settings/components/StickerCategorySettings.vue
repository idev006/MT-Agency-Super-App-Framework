<script setup>
import { computed, ref } from 'vue'
import DataTable from '../../../components/common/DataTable.vue'
import FormDialog from '../../../components/common/FormDialog.vue'
import { STICKER_HEX, STICKER_SIZES, stickerInk } from '../../../domain/reference/sticker-categories.js'

// VC-ADR-038 (owner 2026-11-26: "ควรตั้งค่าได้ทั้งสี และ ประเภทบุคคล"): a system admin keeps the list of person
// types and their sticker colour + size. Used along the workflow: the registrant picks a type, the reviewer
// confirms it at approval, maintenance can change it, the print uses its colour. Types are retired
// (ปิดใช้งาน), never deleted, because vehicles may already use them.
const props = defineProps({
  categories: { type: Array, required: true },
  canManage: Boolean,
  phase: { type: String, default: 'idle' }, // idle | submitting | success | error | uncertain | forbidden
  failureCode: { type: String, default: '' },
})
const emit = defineEmits(['save'])
const columns = [
  { key: 'preview', label: 'ตัวอย่าง', kind: 'actions' },
  { key: 'label', label: 'ประเภทบุคคล', kind: 'name' },
  { key: 'colour', label: 'สี', kind: 'nowrap' },
  { key: 'size', label: 'ขนาด', kind: 'nowrap' },
  { key: 'active', label: 'สถานะ', kind: 'nowrap' },
  { key: 'actions', label: 'จัดการ', kind: 'actions' },
]
const ERRORS = Object.freeze({
  STICKER_CATEGORY_IN_USE: 'ลบประเภทไม่ได้ เพราะอาจมีรถใช้อยู่ ให้ "ปิดใช้งาน" แทน',
  INVALID_STICKER_CATEGORIES: 'ข้อมูลไม่ถูกต้อง: ต้องมีชื่อประเภท ชื่อสี รหัสสี #RRGGBB ขนาด 5 หรือ 8 ซม. และต้องเปิดใช้งานอย่างน้อย 1 ประเภท',
  FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์แก้ไข',
})
const errorText = computed(() => ERRORS[props.failureCode] || (props.failureCode ? `บันทึกไม่สำเร็จ (${props.failureCode})` : 'บันทึกไม่สำเร็จ'))

const editing = ref(null) // { index, form }
const form = computed(() => editing.value?.form)
const formValid = computed(() => {
  const f = form.value
  return Boolean(f && f.label.trim() && f.label.trim().length <= 60 && f.colour.trim() && f.colour.trim().length <= 30
    && STICKER_HEX.test(f.hex.toLowerCase()) && STICKER_SIZES.includes(Number(f.size)))
})
function openEdit(index) { editing.value = { index, form: { ...props.categories[index] } } }
function openNew() {
  const code = `TYPE_${Date.now().toString(36).toUpperCase()}`
  editing.value = { index: -1, form: { code, label: '', colour: '', hex: '#0a7c86', size: 5, active: true } }
}
function submit() {
  if (!formValid.value) return
  const f = editing.value.form
  const row = { code: f.code, label: f.label.trim(), colour: f.colour.trim(), hex: f.hex.toLowerCase(), size: Number(f.size), active: Boolean(f.active) }
  const list = props.categories.map((c) => ({ ...c }))
  if (editing.value.index < 0) list.push(row); else list[editing.value.index] = row
  emit('save', list, () => { editing.value = null })
}
function move(index, step) {
  const list = props.categories.map((c) => ({ ...c }))
  const to = index + step
  if (to < 0 || to >= list.length) return
  ;[list[index], list[to]] = [list[to], list[index]]
  emit('save', list, () => {})
}
const rows = computed(() => props.categories.map((c, i) => ({ ...c, index: i })))
</script>

<template>
  <section class="card card-border bg-base-100 shadow-none" aria-labelledby="sticker-settings-title">
    <div class="card-body gap-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="sticker-settings-title" class="card-title">ประเภทบุคคลและสีสติกเกอร์</h2>
          <p class="text-sm text-base-content/80">ผู้ลงทะเบียนเลือกประเภท → ผู้อนุมัติยืนยัน (จำเป็นก่อนอนุมัติ) → แก้ไขได้ที่หน้าแก้ไขรถ → ใช้กำหนดสีและขนาดตอนพิมพ์ QR สีช่วยจำแนกเท่านั้น ไม่ใช่สิทธิ์ผ่านประตูหรือจอดรถ</p>
        </div>
        <button v-if="canManage" class="btn btn-primary btn-sm" type="button" :disabled="phase === 'submitting'" @click="openNew">เพิ่มประเภท</button>
      </div>
      <div v-if="phase === 'error' || phase === 'uncertain'" class="alert alert-error" role="alert"><span>{{ phase === 'uncertain' ? 'ไม่สามารถยืนยันผลการบันทึกได้ กรุณาโหลดหน้าใหม่' : errorText }}</span></div>
      <div v-else-if="phase === 'success'" class="alert alert-success" role="status"><span>บันทึกประเภทบุคคลและสีสติกเกอร์แล้ว</span></div>
      <DataTable :columns="columns" :rows="rows" row-key="code" label="ประเภทบุคคลและสีสติกเกอร์">
        <template #cell-preview="{ row }">
          <span class="sticker-swatch" :style="{ background: row.hex, color: row.ink || stickerInk(row.hex) }" :data-swatch="row.code" aria-hidden="true"><span class="sticker-swatch__qr"></span>{{ row.size }}</span>
        </template>
        <template #cell-colour="{ row }"><span class="inline-flex items-center gap-2">{{ row.colour }} <code class="text-xs text-base-content/70">{{ row.hex }}</code></span></template>
        <template #cell-size="{ row }">{{ row.size }} × {{ row.size }} ซม.</template>
        <template #cell-active="{ row }"><span class="badge" :class="row.active ? 'badge-success' : 'badge-ghost'">{{ row.active ? 'ใช้งาน' : 'ปิดใช้งาน' }}</span></template>
        <template #cell-actions="{ row }">
          <div v-if="canManage" class="flex gap-1">
            <button class="btn btn-sm" type="button" :disabled="phase === 'submitting'" @click="openEdit(row.index)">แก้ไข</button>
            <button class="btn btn-sm btn-ghost btn-square" type="button" :disabled="phase === 'submitting' || row.index === 0" :aria-label="`เลื่อน ${row.label} ขึ้น`" @click="move(row.index, -1)">▲</button>
            <button class="btn btn-sm btn-ghost btn-square" type="button" :disabled="phase === 'submitting' || row.index === categories.length - 1" :aria-label="`เลื่อน ${row.label} ลง`" @click="move(row.index, 1)">▼</button>
          </div>
          <span v-else class="text-sm text-base-content/70">อ่านอย่างเดียว</span>
        </template>
      </DataTable>
    </div>

    <FormDialog :open="Boolean(editing)" :title="editing && editing.index < 0 ? 'เพิ่มประเภทบุคคล' : 'แก้ไขประเภทบุคคล'" @close="editing = null">
      <form v-if="form" class="grid gap-3" @submit.prevent="submit">
        <label class="field-stack"><span class="label-text font-semibold">ประเภทบุคคล</span><input v-model="form.label" class="input input-bordered w-full" maxlength="60" required placeholder="เช่น ข้าราชการบำนาญ" /></label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="field-stack"><span class="label-text font-semibold">ชื่อสี</span><input v-model="form.colour" class="input input-bordered w-full" maxlength="30" required placeholder="เช่น ส้ม" /></label>
          <div class="field-stack"><span class="label-text font-semibold" id="sticker-hex-label">สี</span>
            <div class="flex items-center gap-2">
              <input v-model="form.hex" type="color" class="h-11 w-14 cursor-pointer rounded border border-base-300" aria-labelledby="sticker-hex-label" />
              <input v-model="form.hex" class="input input-bordered w-full font-mono" maxlength="7" pattern="#[0-9a-fA-F]{6}" aria-label="รหัสสี" />
            </div>
          </div>
        </div>
        <label class="field-stack"><span class="label-text font-semibold">ขนาดสติกเกอร์</span><select v-model.number="form.size" class="select select-bordered w-full"><option :value="5">5 × 5 ซม.</option><option :value="8">8 × 8 ซม.</option></select></label>
        <label class="flex min-h-11 cursor-pointer items-start gap-3 whitespace-normal"><input v-model="form.active" type="checkbox" class="checkbox mt-0.5" /><span>เปิดใช้งาน <small class="block text-base-content/70">ให้เลือกได้ตอนลงทะเบียนและอนุมัติ</small></span></label>
        <div class="flex items-center gap-3 rounded-box bg-base-200 p-3">
          <span class="sticker-swatch sticker-swatch--lg" :style="{ background: STICKER_HEX.test(form.hex.toLowerCase()) ? form.hex : '#999999', color: stickerInk(form.hex.toLowerCase()) }" aria-hidden="true"><strong>กข 1234</strong><span class="sticker-swatch__qr"></span><small>{{ form.label || 'ประเภทบุคคล' }}</small></span>
          <p class="text-sm">ตัวอย่างสติกเกอร์ สีตัวอักษร (ดำ/ขาว) เลือกให้อัตโนมัติตามความเข้มของสี</p>
        </div>
        <div class="flex justify-end gap-2">
          <button class="btn" type="button" @click="editing = null">ยกเลิก</button>
          <button class="btn btn-primary" type="submit" :disabled="!formValid || phase === 'submitting'"><span v-if="phase === 'submitting'" class="loading loading-spinner loading-sm"></span>บันทึก</button>
        </div>
      </form>
    </FormDialog>
  </section>
</template>

<style scoped>
.sticker-swatch { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; width: 2.75rem; height: 2.75rem; border-radius: 0.25rem; font-size: 0.7rem; font-weight: 700; line-height: 1; }
.sticker-swatch__qr { width: 1.1rem; height: 1.1rem; background: #fff; border-radius: 2px; }
.sticker-swatch--lg { width: 6.5rem; height: 6.5rem; gap: 4px; font-size: 0.8rem; text-align: center; padding: 4px; }
.sticker-swatch--lg .sticker-swatch__qr { width: 2.75rem; height: 2.75rem; }
.sticker-swatch--lg small { font-size: 0.6rem; font-weight: 600; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
