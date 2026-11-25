<script setup>
import { computed } from 'vue'
import { qrImageDataUrl } from '../../../infrastructure/media/qr-image.js'

// Owner 2026-11-25: the vehicle QR could only be copied as text, so there was nothing to scan with a
// real phone. Shown together with the one-time code (same one-time rule: not stored anywhere); the
// QR holds exactly the 64-character code the scanner accepts. Printing files are S5.
const props = defineProps({ token: { type: String, required: true }, label: { type: String, default: '' } })
// Upper-case hex = QR alphanumeric mode (version 4, 33×33): easier to scan; the scanner accepts any case.
const image = computed(() => (/^[a-f0-9]{64}$/i.test(props.token) ? qrImageDataUrl(props.token.toUpperCase(), { mode: 'Alphanumeric', cellSize: 10 }) : ''))
</script>

<template>
  <figure v-if="image" class="mt-3 flex flex-wrap items-center gap-4" data-vehicle-qr>
    <img :src="image" :alt="`QR ยานพาหนะ${label ? ' ' + label : ''}`" class="w-60 max-w-full rounded bg-white p-2 [image-rendering:pixelated]" />
    <figcaption class="grid gap-2 text-sm">
      <span>สแกนด้วยหน้า “ตรวจสอบ QR” เพื่อทดสอบ หรือดาวน์โหลดไปพิมพ์สติกเกอร์</span>
      <a class="btn btn-sm w-fit" :href="image" :download="`vehicle-qr${label ? '-' + label : ''}.gif`">ดาวน์โหลดภาพ QR</a>
    </figcaption>
  </figure>
</template>
