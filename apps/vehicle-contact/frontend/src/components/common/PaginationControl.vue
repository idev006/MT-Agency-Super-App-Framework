<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

const PAGE_SIZE_OPTIONS = Object.freeze([1, 5, 10, 15, 25, 50, 100])

const props = defineProps({
  page: { type: Number, required: true },
  pageSize: { type: Number, required: true, validator: (value) => [1, 5, 10, 15, 25, 50, 100].includes(value) },
  totalItems: { type: Number, required: true },
  label: { type: String, default: 'การแบ่งหน้า' },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:page', 'update:pageSize'])
const totalPages = computed(() => Math.max(1, Math.ceil(Math.max(0, props.totalItems) / props.pageSize)))
const pageOptions = computed(() => Array.from({ length: totalPages.value }, (_, index) => index + 1))
const safePage = computed(() => Math.min(Math.max(1, props.page), totalPages.value))
const firstItem = computed(() => props.totalItems ? (safePage.value - 1) * props.pageSize + 1 : 0)
const lastItem = computed(() => Math.min(safePage.value * props.pageSize, Math.max(0, props.totalItems)))

function changePageSize(event) {
  emit('update:pageSize', Number(event.target.value))
  emit('update:page', 1)
}
</script>

<template>
  <nav class="flex min-w-0 flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-3 sm:flex-row sm:items-center sm:justify-between" :aria-label="label">
    <p class="text-sm text-base-content/70" aria-live="polite">แสดง {{ firstItem }}–{{ lastItem }} จาก {{ totalItems }} รายการ</p>
    <div class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
      <label class="flex min-h-11 min-w-0 items-center gap-2 text-sm"><span class="whitespace-nowrap">รายการต่อหน้า</span><select class="select select-bordered select-sm min-h-11 min-w-20" :value="pageSize" :disabled="disabled" aria-label="จำนวนรายการต่อหน้า" @change="changePageSize"><option v-for="option in PAGE_SIZE_OPTIONS" :key="option" :value="option">{{ option }}</option></select></label>
      <div class="join grid grid-cols-[minmax(2.75rem,auto)_minmax(5rem,1fr)_minmax(2.75rem,auto)]" role="group" aria-label="เลือกหน้า">
        <button class="btn join-item min-h-11 gap-1" type="button" :disabled="disabled || safePage <= 1" aria-label="ก่อนหน้า" @click="emit('update:page', safePage - 1)"><AppIcon name="previous" size-class="size-4" /><span>ก่อนหน้า</span></button>
        <select class="select join-item min-h-11 min-w-0 text-center" :value="safePage" :disabled="disabled" aria-label="เลือกหน้าปัจจุบัน" @change="emit('update:page', Number($event.target.value))"><option v-for="option in pageOptions" :key="option" :value="option">หน้า {{ option }} / {{ totalPages }}</option></select>
        <button class="btn join-item min-h-11 gap-1" type="button" :disabled="disabled || safePage >= totalPages" aria-label="ถัดไป" @click="emit('update:page', safePage + 1)"><span>ถัดไป</span><AppIcon name="next" size-class="size-4" /></button>
      </div>
    </div>
  </nav>
</template>
