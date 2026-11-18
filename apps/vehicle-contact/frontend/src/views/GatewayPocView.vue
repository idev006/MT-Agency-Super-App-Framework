<script setup>
import { storeToRefs } from 'pinia'
import TransportSelector from '../components/auth/TransportSelector.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import { useSessionStore } from '../stores/session.js'
const auth = useSessionStore()
const { busy, phase, transport, lastResult, error } = storeToRefs(auth)
</script>
<template>
  <PageTemplateComponent eyebrow="Integration POC" title="ทดสอบเส้นทาง Frontend ↔ Backend" description="ใช้ canonical envelope เดียวกัน เปลี่ยนเฉพาะ transport เพื่อเปรียบเทียบการเรียก GAS โดยตรงกับการส่งผ่าน Cloudflare Worker">
      <section class="rounded-3xl border border-base-300 bg-base-100 p-5 sm:p-7">
        <div class="route-plate" :class="{ 'route-plate--online': lastResult && !error, 'route-plate--error': error }" aria-live="polite">
          <div><span class="route-plate__eyebrow">FRONTEND</span><strong>VUE SPA</strong></div>
          <div class="route-plate__track"><span></span><span></span><span></span></div>
          <div class="text-right"><span class="route-plate__eyebrow">ROUTE</span><strong>{{ transport === 'worker' ? 'WORKER' : 'GAS' }}</strong></div>
        </div>
        <div class="mt-6 grid gap-3 sm:grid-cols-3"><div class="rounded-xl bg-base-200 p-4"><small>1 · Browser</small><strong class="mt-1 block">สร้าง envelope</strong></div><div class="rounded-xl bg-base-200 p-4"><small>2 · Transport</small><strong class="mt-1 block">{{ transport === 'worker' ? 'Worker forward' : 'Direct fetch' }}</strong></div><div class="rounded-xl bg-base-200 p-4"><small>3 · GAS</small><strong class="mt-1 block">ตรวจ operation</strong></div></div>
      </section>
      <template #aside>
      <section class="rounded-3xl border border-base-300 bg-base-100 p-5 sm:p-7">
        <TransportSelector />
        <button class="btn btn-primary mt-5 w-full" type="button" :disabled="busy" @click="auth.checkConnection"><span v-if="phase === 'checking'" class="loading loading-spinner loading-sm"></span>{{ phase === 'checking' ? 'กำลังทดสอบ' : 'เรียก system.health' }}</button>
        <div v-if="lastResult" class="alert alert-success mt-5"><span>✓</span><div><strong>เชื่อมต่อสำเร็จ</strong><p>{{ lastResult.status }}</p><small class="font-mono">{{ lastResult.requestId }}</small></div></div>
        <div v-if="error" class="alert alert-error mt-5 items-start"><span>!</span><div><strong>{{ error.code }}</strong><p>{{ error.message }}</p><small v-if="error.requestId" class="font-mono">{{ error.requestId }}</small></div></div>
      </section>
      </template>
      <template #footer><p class="text-xs text-base-content/50">PageTemplateComponent จัด layout และ slot ส่วนหน้านี้รับผิดชอบเฉพาะข้อมูลและ interaction ของ integration test</p></template>
  </PageTemplateComponent>
</template>
