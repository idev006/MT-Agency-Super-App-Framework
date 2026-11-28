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
  <!-- Owner 2026-11-26: one obvious action (open/close the camera), the status in plain words right above
       the view, and the rarely needed options (camera choice, read from a photo) folded below. -->
  <section class="card card-border bg-base-100 shadow-none" aria-labelledby="qr-scanner-title">
    <div class="card-body gap-4 p-4 sm:p-6">
      <h2 id="qr-scanner-title" class="card-title text-xl">สแกน QR บนรถ</h2>
      <div v-if="phase === 'starting' || phase === 'switching' || phase === 'scanning-file'" class="alert" role="status"><span class="loading loading-spinner loading-sm"></span><span>{{ phase === 'scanning-file' ? 'กำลังอ่าน QR จากรูปภาพ' : 'กำลังเตรียมกล้อง' }}</span></div>
      <div v-else-if="phase === 'scanning' && notice" class="alert alert-warning" role="status" data-qr-notice>{{ notice === 'LINK_NOT_VEHICLE_QR' ? 'QR นี้เป็นลิงก์ (เช่น QR แคมเปญลงทะเบียน) ไม่ใช่ QR ยานพาหนะ' : 'QR นี้ไม่ใช่ QR ยานพาหนะ' }} — กล้องยังเปิดอยู่ ลองสแกน QR บนสติกเกอร์รถ</div>
      <div v-else-if="phase === 'scanning'" class="alert alert-success" role="status">เล็ง QR บนสติกเกอร์ให้อยู่ในกรอบ ระยะประมาณ 15–25 ซม.</div>
      <div v-else-if="phase === 'error'" class="alert alert-warning items-start"><div><strong>เปิดกล้องหรืออ่าน QR ไม่ได้</strong><p class="mt-1 text-sm">รหัสข้อผิดพลาด: {{ failureCode || 'CAMERA_UNAVAILABLE' }} — ใช้ "อ่าน QR จากรูปภาพ" หรือกรอกรหัสด้านล่างแทนได้</p></div></div>
      <div class="relative mx-auto grid aspect-square max-h-[26rem] w-full max-w-md place-items-center overflow-hidden rounded-box bg-neutral text-neutral-content">
        <div :id="readerId" class="size-full overflow-hidden"></div>
        <p v-if="!active && phase !== 'starting' && phase !== 'switching'" class="absolute max-w-xs px-6 text-center text-white">กด “เปิดกล้อง” แล้วเล็งไปที่ QR บนรถ<br><span class="text-sm opacity-80">กล้องเปิดเฉพาะเมื่อกด ระบบไม่อัปโหลดภาพจากกล้อง</span></p>
      </div>
      <button v-if="!active" class="btn btn-primary btn-lg min-h-12 w-full" type="button" :disabled="busy" @click="emit('start')">เปิดกล้อง</button>
      <div v-else class="grid grid-cols-2 gap-3">
        <button class="btn min-h-11" type="button" :disabled="busy" @click="emit('switch')">สลับกล้องหน้า–หลัง</button>
        <button class="btn min-h-11" type="button" :disabled="busy" @click="emit('stop')">ปิดกล้อง</button>
      </div>
      <details class="rounded-box border border-base-300 p-3">
        <summary class="cursor-pointer text-sm font-medium">ตัวเลือกเพิ่มเติม: เลือกกล้อง หรืออ่าน QR จากรูปภาพ</summary>
        <div class="mt-3 grid gap-3">
          <label class="field-stack"><span class="label font-medium">เลือกกล้อง</span><select class="select select-bordered min-h-11 w-full" :value="selectedDeviceId" :disabled="busy || devices.length < 2" @change="emit('select-device', $event.target.value)"><option value="">{{ devices.length ? `อัตโนมัติ — ขอใช้${facingMode === 'environment' ? 'กล้องหลัง' : 'กล้องหน้า'}` : 'เปิดกล้องเพื่อค้นหาอุปกรณ์' }}</option><option v-for="device in devices" :key="device.id" :value="device.id">{{ device.label }}</option></select><span class="text-sm text-base-content/65">ชื่อกล้องอาจไม่แสดงบน iPhone<span v-if="activeFacingMode"> · อุปกรณ์รายงาน: {{ activeFacingMode }}</span></span></label>
          <label class="field-stack"><span class="label font-medium">อ่าน QR จากรูปภาพ</span><input class="file-input file-input-bordered min-h-11 w-full" type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy" @change="chooseFile"><span class="text-sm text-base-content/65">JPEG, PNG หรือ WebP ไม่เกิน 10 MB</span></label>
        </div>
      </details>
    </div>
  </section>
</template>
