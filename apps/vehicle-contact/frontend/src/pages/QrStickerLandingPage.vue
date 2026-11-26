<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session.js'
import { VEHICLE_QR_CODE } from '../domain/qr/vehicle-qr-link.js'

// VC-ADR-032 (A) + owner 2026-11-26 (UX item 1): what anyone sees after pointing a phone camera at a sticker.
// It says plainly what the sticker is and that it shows nothing to the public. It makes NO API call and
// says nothing about the code (valid / revoked / unknown): there is nothing to learn here without signing in.
// A signed-in officer goes straight to the QR check page, which resolves the code and drops it from the URL.
const route = useRoute()
const router = useRouter()
const auth = useSessionStore()
const code = computed(() => (VEHICLE_QR_CODE.test(String(route.params.code || '')) ? String(route.params.code).toLowerCase() : ''))
const target = computed(() => (code.value ? `/app/vehicles/qr?t=${code.value}` : '/app/vehicles/qr'))
function signIn() { router.push({ name: 'sign-in', query: { redirect: target.value } }) }
onMounted(() => { if (auth.authenticated) router.replace(target.value) })
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-base-200 p-4">
    <section class="card card-border w-full max-w-md bg-base-100 shadow-none" aria-labelledby="sticker-title">
      <div class="card-body gap-4 p-6 text-center">
        <span class="mx-auto grid size-14 place-items-center rounded-box bg-base-content text-xl font-bold text-base-100" aria-hidden="true">P6</span>
        <h1 id="sticker-title" class="text-2xl font-bold">QR ยานพาหนะ<br>ตำรวจภูธรภาค 6</h1>
        <p class="text-lg">สติกเกอร์นี้ใช้สำหรับ<strong>เจ้าหน้าที่ตำรวจ</strong>ตรวจสอบรถและติดต่อผู้ประสานงาน</p>
        <div class="alert items-start text-left shadow-none" role="note">
          <span>ข้อมูลรถ<strong>ไม่เปิดเผยต่อบุคคลทั่วไป</strong> หากคุณไม่ใช่เจ้าหน้าที่ ไม่ต้องดำเนินการใด ๆ</span>
        </div>
        <button class="btn btn-primary btn-lg min-h-12 w-full" type="button" @click="signIn">เจ้าหน้าที่: เข้าสู่ระบบเพื่อตรวจสอบ</button>
        <p v-if="!code" class="text-sm text-warning">รหัสบนสติกเกอร์อ่านไม่ครบ หลังเข้าสู่ระบบให้สแกนอีกครั้งในหน้า “ตรวจสอบ QR”</p>
      </div>
    </section>
  </main>
</template>
