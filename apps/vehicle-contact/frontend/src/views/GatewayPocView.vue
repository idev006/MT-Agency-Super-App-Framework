<script setup>
import { storeToRefs } from 'pinia'
import TransportSelector from '../components/auth/TransportSelector.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import { useSessionStore } from '../stores/session.js'
const auth = useSessionStore()
const { busy, phase, transport, lastResult, error } = storeToRefs(auth)
</script>
<template>
  <PageTemplateComponent eyebrow="เครื่องมือสนับสนุน" title="ตรวจสอบการเชื่อมต่อ" description="ตรวจสอบว่าหน้าเว็บติดต่อระบบส่วนกลางผ่านเส้นทางที่เลือกได้ตามปกติ">
      <section class="rounded-3xl border border-base-300 bg-base-100 p-5 sm:p-7">
        <div class="route-plate" :class="{ 'route-plate--online': lastResult && !error, 'route-plate--error': error }" aria-live="polite">
          <div><span class="route-plate__eyebrow">จุดเริ่มต้น</span><strong>หน้าเว็บ</strong></div>
          <div class="route-plate__track"><span></span><span></span><span></span></div>
          <div class="text-right"><span class="route-plate__eyebrow">เส้นทาง</span><strong>{{ transport === 'worker' ? 'Cloudflare' : 'GAS โดยตรง' }}</strong></div>
        </div>
        <ol class="mt-6 grid gap-3 sm:grid-cols-3"><li class="rounded-xl bg-base-200 p-4"><small>ขั้นที่ 1</small><strong class="mt-1 block font-medium">ส่งคำขอตรวจสอบ</strong></li><li class="rounded-xl bg-base-200 p-4"><small>ขั้นที่ 2</small><strong class="mt-1 block font-medium">{{ transport === 'worker' ? 'ผ่าน Cloudflare' : 'ติดต่อ GAS โดยตรง' }}</strong></li><li class="rounded-xl bg-base-200 p-4"><small>ขั้นที่ 3</small><strong class="mt-1 block font-medium">ยืนยันผลจากระบบ</strong></li></ol>
      </section>
      <template #aside>
      <section class="rounded-3xl border border-base-300 bg-base-100 p-5 sm:p-7">
        <TransportSelector />
        <button class="btn btn-primary mt-5 min-h-11 w-full" type="button" :disabled="busy" @click="auth.checkConnection"><span v-if="phase === 'checking'" class="loading loading-spinner loading-sm"></span>{{ phase === 'checking' ? 'กำลังตรวจสอบ' : 'ตรวจสอบการเชื่อมต่อ' }}</button>
        <div v-if="lastResult" class="alert alert-success mt-5"><div><strong>เชื่อมต่อสำเร็จ</strong><p>ระบบส่วนกลางตอบกลับพร้อมใช้งาน</p><details class="mt-2 text-sm"><summary class="cursor-pointer">รายละเอียดสำหรับเจ้าหน้าที่สนับสนุน</summary><p class="mt-1 font-mono text-xs">{{ lastResult.status }} · {{ lastResult.requestId }}</p></details></div></div>
        <div v-if="error" class="alert alert-error mt-5 items-start"><div><strong>เชื่อมต่อไม่สำเร็จ</strong><p>{{ error.message }} โปรดลองอีกครั้งหรือติดต่อเจ้าหน้าที่สนับสนุน</p><details class="mt-2 text-sm"><summary class="cursor-pointer">รายละเอียดสำหรับเจ้าหน้าที่สนับสนุน</summary><p class="mt-1 font-mono text-xs">{{ error.code }}<span v-if="error.requestId"> · {{ error.requestId }}</span></p></details></div></div>
      </section>
      </template>
      <template #footer><p class="text-sm text-base-content/60">การตรวจสอบนี้ไม่แก้ไขข้อมูลยานพาหนะหรือข้อมูลผู้ใช้</p></template>
  </PageTemplateComponent>
</template>
