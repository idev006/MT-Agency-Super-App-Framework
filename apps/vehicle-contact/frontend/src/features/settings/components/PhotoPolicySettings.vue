<script setup>
import { computed, ref, watch } from 'vue'
import { ORIENTATION_LABELS, PHOTO_ORIENTATIONS, PHOTO_POLICY_LIMITS, validPhotoField, validPhotoPolicy } from '../../../domain/media/photo-policy.js'

// VC-ADR-049 / VC-ADR-055 (owner 2026-11-28: "ถ้าสามารถกำหนดกฏ ให้ผู้ใช้ต้องถ่ายแนวนอน แนวตั้ง หรือ อนุญาตทั้ง2 แบบ ... รูปที่
// อัพโหลดขึ้นมาต้องมีขนาดไม่เกินเท่าใด ... การประมวลผลรูปจะเกิดที่ FE"): the photo rules every phone applies before upload; the
// server re-checks each file. Sizes are edited in friendly units (MB, %), saved in the server's (bytes, 0–1).
const props = defineProps({
  policy: { type: Object, required: true },
  canManage: Boolean,
  phase: { type: String, default: 'idle' }, // idle | submitting | success | error | uncertain | forbidden
  failureCode: { type: String, default: '' },
})
const emit = defineEmits(['save'])
const ERRORS = Object.freeze({ INVALID_PHOTO_POLICY: 'ค่าบางช่องไม่อยู่ในช่วงที่กำหนด กรุณาตรวจอีกครั้ง', INVALID_REQUEST: 'ค่าบางช่องไม่อยู่ในช่วงที่กำหนด กรุณาตรวจอีกครั้ง', FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์แก้ไข' })
const errorText = computed(() => ERRORS[props.failureCode] || (props.failureCode ? `บันทึกไม่สำเร็จ (${props.failureCode})` : 'บันทึกไม่สำเร็จ'))

const toDraft = (p) => ({ orientation: p.orientation, maxSide: p.maxSide, minSide: p.minSide, maxMb: p.maxBytes / 1000000, qualityPct: Math.round(p.quality * 100), thumbSide: p.thumbSide })
const draft = ref(toDraft(props.policy))
const reset = () => { draft.value = toDraft(props.policy) }
watch(() => props.policy, reset)
const next = computed(() => ({ maxSide: Number(draft.value.maxSide), quality: Math.round(Number(draft.value.qualityPct)) / 100,
  maxBytes: Math.round(Number(draft.value.maxMb) * 1000000), thumbSide: Number(draft.value.thumbSide), minSide: Number(draft.value.minSide), orientation: draft.value.orientation }))
const fieldOk = (k) => validPhotoField(k, next.value[k])
const crossOk = computed(() => next.value.minSide <= next.value.maxSide && next.value.thumbSide <= next.value.maxSide)
const allValid = computed(() => validPhotoPolicy(next.value))
const dirty = computed(() => Object.keys(next.value).some((k) => next.value[k] !== props.policy[k]))
const busy = computed(() => props.phase === 'submitting')
const range = (k, scale = 1, unit = '') => `${(PHOTO_POLICY_LIMITS[k][0] * scale).toLocaleString('th-TH')}–${(PHOTO_POLICY_LIMITS[k][1] * scale).toLocaleString('th-TH')}${unit}`
function save() { if (dirty.value && allValid.value && !busy.value) emit('save', next.value) }
</script>

<template>
  <section class="card card-border bg-base-100 shadow-none" aria-labelledby="photo-settings-title">
    <div class="card-body gap-4">
      <div>
        <h2 id="photo-settings-title" class="card-title">กฎของรูปถ่าย</h2>
        <p class="text-sm text-base-content/80">มือถือของผู้ใช้จะย่อรูปและตรวจตามกฎนี้ก่อนส่ง (ไม่ใช้ทรัพยากรของเซิร์ฟเวอร์) เซิร์ฟเวอร์ตรวจซ้ำทุกไฟล์ ใช้กับรูปใหม่ที่ถ่ายหลังบันทึก รูปเดิมไม่เปลี่ยน ระบบหมุนรูปให้ตั้งตรงและลบข้อมูลแฝงในรูป (เช่น พิกัด GPS) ให้เสมอ</p>
      </div>
      <div v-if="phase === 'error' || phase === 'uncertain'" class="alert alert-error" role="alert"><span>{{ phase === 'uncertain' ? 'ไม่สามารถยืนยันผลการบันทึกได้ กรุณาโหลดหน้าใหม่' : errorText }}</span></div>
      <div v-else-if="phase === 'success' && !dirty" class="alert alert-success" role="status"><span>บันทึกกฎของรูปถ่ายแล้ว</span></div>

      <fieldset class="fieldset" :disabled="!canManage || busy">
        <legend class="fieldset-legend">แนวของรูป</legend>
        <div class="flex flex-wrap gap-4">
          <label v-for="o in PHOTO_ORIENTATIONS" :key="o" class="flex min-h-11 cursor-pointer items-center gap-2">
            <input v-model="draft.orientation" type="radio" class="radio radio-primary" name="photo-orientation" :value="o" :data-photo-orientation="o" />
            <span>{{ ORIENTATION_LABELS[o] }}</span>
          </label>
        </div>
      </fieldset>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label class="field-stack">
          <span class="label-text font-semibold">ขนาดไฟล์สูงสุดต่อรูป (MB)</span>
          <input v-model.number="draft.maxMb" type="number" step="0.1" inputmode="decimal" class="input input-bordered w-full" :class="fieldOk('maxBytes') ? '' : 'input-error'" :disabled="!canManage || busy" data-photo-max-mb />
          <small class="p6-col-sub">{{ range('maxBytes', 1 / 1000000, ' MB') }} ถ้าเกิน มือถือจะลดคุณภาพหรือขนาดลงให้เอง</small>
        </label>
        <label class="field-stack">
          <span class="label-text font-semibold">ด้านยาวสุด (px)</span>
          <input v-model.number="draft.maxSide" type="number" inputmode="numeric" class="input input-bordered w-full" :class="fieldOk('maxSide') ? '' : 'input-error'" :disabled="!canManage || busy" data-photo-max-side />
          <small class="p6-col-sub">{{ range('maxSide', 1, ' px') }} รูปที่ใหญ่กว่าจะถูกย่อลง</small>
        </label>
        <label class="field-stack">
          <span class="label-text font-semibold">ด้านสั้นอย่างน้อย (px)</span>
          <input v-model.number="draft.minSide" type="number" inputmode="numeric" class="input input-bordered w-full" :class="fieldOk('minSide') && crossOk ? '' : 'input-error'" :disabled="!canManage || busy" data-photo-min-side />
          <small class="p6-col-sub">{{ range('minSide', 1, ' px') }} (0 = ไม่ตรวจ) กันรูปเล็กจนอ่านป้ายทะเบียนไม่ออก</small>
        </label>
        <label class="field-stack">
          <span class="label-text font-semibold">คุณภาพ JPEG (%)</span>
          <input v-model.number="draft.qualityPct" type="number" inputmode="numeric" class="input input-bordered w-full" :class="fieldOk('quality') ? '' : 'input-error'" :disabled="!canManage || busy" data-photo-quality />
          <small class="p6-col-sub">{{ range('quality', 100, '%') }} สูงขึ้น = ชัดขึ้นแต่ไฟล์ใหญ่ขึ้น</small>
        </label>
        <label class="field-stack">
          <span class="label-text font-semibold">ขนาดรูปย่อในรายการ (px)</span>
          <input v-model.number="draft.thumbSide" type="number" inputmode="numeric" class="input input-bordered w-full" :class="fieldOk('thumbSide') && crossOk ? '' : 'input-error'" :disabled="!canManage || busy" data-photo-thumb />
          <small class="p6-col-sub">{{ range('thumbSide', 1, ' px') }}</small>
        </label>
      </div>
      <p v-if="!crossOk" class="text-sm font-medium text-error" role="alert">ด้านสั้นอย่างน้อยและขนาดรูปย่อต้องไม่เกินด้านยาวสุด</p>
      <div v-if="canManage" class="flex flex-wrap justify-end gap-2">
        <button class="btn" type="button" :disabled="!dirty || busy" @click="reset">ยกเลิกการแก้ไข</button>
        <button class="btn btn-primary" type="button" :disabled="!dirty || !allValid || busy" data-photo-save @click="save"><span v-if="busy" class="loading loading-spinner loading-sm"></span>บันทึกกฎของรูปถ่าย</button>
      </div>
    </div>
  </section>
</template>
