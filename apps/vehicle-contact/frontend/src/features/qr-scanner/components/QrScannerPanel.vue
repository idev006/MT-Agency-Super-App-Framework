<script setup>
defineProps({
  readerId: { type: String, required: true },
  phase: { type: String, required: true },
  failureCode: { type: String, default: '' },
  devices: { type: Array, default: () => [] },
  selectedDeviceId: { type: String, default: '' },
  facingMode: { type: String, default: 'environment' },
  activeFacingMode: { type: String, default: '' },
  active: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  notice: { type: String, default: '' },
})
const emit = defineEmits(['start', 'stop', 'switch', 'select-device', 'scan-file'])

function chooseFile(event) {
  const file = event.target.files?.[0]
  if (file) emit('scan-file', file)
  event.target.value = ''
}
</script>

<template>
  <section class="card card-border bg-base-100 shadow-none" aria-labelledby="qr-scanner-title">
    <div class="card-body gap-5 p-5 sm:p-6">
      <div><h2 id="qr-scanner-title" class="card-title text-xl">สแกน QR ด้วยกล้อง</h2><p class="mt-1 text-sm text-base-content/80">กล้องจะเปิดเมื่อกดปุ่มเท่านั้น ระบบอ่าน QR บนอุปกรณ์และไม่อัปโหลดภาพจากกล้อง</p></div>
      <div class="relative mx-auto grid aspect-[4/5] max-h-[30rem] w-full max-w-md place-items-center overflow-hidden rounded-box bg-neutral text-neutral-content">
        <div :id="readerId" class="size-full overflow-hidden"></div>
        <p v-if="!active && phase !== 'starting' && phase !== 'switching'" class="absolute max-w-xs px-6 text-center text-sm">กล้องปิดอยู่ กด “เปิดกล้อง” เพื่อเริ่มใช้งาน</p>
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <button class="btn btn-primary min-h-11" type="button" :disabled="busy || active" @click="emit('start')">เปิดกล้อง</button>
        <button class="btn min-h-11" type="button" :disabled="busy || !active" @click="emit('switch')">สลับหน้า–หลัง</button>
        <button class="btn min-h-11" type="button" :disabled="busy || !active" @click="emit('stop')">ปิดกล้อง</button>
      </div>
      <label class="field-stack"><span class="label font-medium">เลือกกล้อง</span><select class="select select-bordered min-h-11 w-full" :value="selectedDeviceId" :disabled="busy || devices.length < 2" @change="emit('select-device', $event.target.value)"><option value="">{{ devices.length ? `อัตโนมัติ — ขอใช้${facingMode === 'environment' ? 'กล้องหลัง' : 'กล้องหน้า'}` : 'เปิดกล้องเพื่อค้นหาอุปกรณ์' }}</option><option v-for="device in devices" :key="device.id" :value="device.id">{{ device.label }}</option></select><span class="text-sm text-base-content/65">ชื่อและทิศทางกล้องอาจไม่แสดงบน iPhone กรุณาตรวจภาพก่อนใช้งาน</span></label>
      <label class="field-stack"><span class="label font-medium">อ่าน QR จากรูปภาพ</span><input class="file-input file-input-bordered min-h-11 w-full" type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy" @change="chooseFile"><span class="text-sm text-base-content/65">ใช้เป็นทางเลือกเมื่อกล้องเปิดไม่ได้ รองรับ JPEG, PNG และ WebP ไม่เกิน 10 MB</span></label>
      <div v-if="phase === 'starting' || phase === 'switching' || phase === 'scanning-file'" class="alert" role="status"><span class="loading loading-spinner loading-sm"></span><span>{{ phase === 'scanning-file' ? 'กำลังอ่าน QR จากรูปภาพ' : 'กำลังเตรียมกล้อง' }}</span></div>
      <div v-if="phase === 'scanning' && notice" class="alert alert-warning" role="status" data-qr-notice>{{ notice === 'LINK_NOT_VEHICLE_QR' ? 'QR นี้เป็นลิงก์ (เช่น QR แคมเปญลงทะเบียน) ไม่ใช่ QR ยานพาหนะ' : 'QR นี้ไม่ใช่ QR ยานพาหนะ' }} — กล้องยังเปิดอยู่ ลองสแกน QR บนสติกเกอร์รถ</div>
      <div v-else-if="phase === 'scanning'" class="alert alert-success" role="status">กล้องทำงานแล้ว<span v-if="activeFacingMode"> (อุปกรณ์รายงาน: {{ activeFacingMode }})</span> จัด QR ให้อยู่ในกรอบ</div>
      <div v-else-if="phase === 'error'" class="alert alert-warning items-start"><div><strong>ไม่สามารถอ่าน QR ได้</strong><p class="mt-1 text-sm">รหัสข้อผิดพลาด: {{ failureCode || 'CAMERA_UNAVAILABLE' }} — สามารถใช้รูปภาพหรือกรอกรหัส QR ด้านล่างแทนได้</p></div></div>
    </div>
  </section>
</template>
