<script setup>
import { storeToRefs } from 'pinia'
import { useSessionStore } from '../../stores/session.js'
const auth = useSessionStore()
const { transport, endpoint, endpointValid } = storeToRefs(auth)
</script>
<template>
  <fieldset class="space-y-3">
    <legend class="text-sm font-bold">เส้นทางเชื่อมต่อ API</legend>
    <div class="grid grid-cols-2 gap-2">
      <label class="transport-choice" :class="{ 'transport-choice--active': transport === 'direct' }">
        <input class="radio radio-primary radio-sm" type="radio" name="transport" value="direct" :checked="transport === 'direct'" @change="auth.setTransport('direct')" />
        <span><strong>ตรงไป GAS</strong><small>Browser → GAS</small></span>
      </label>
      <label class="transport-choice" :class="{ 'transport-choice--active': transport === 'worker' }">
        <input class="radio radio-primary radio-sm" type="radio" name="transport" value="worker" :checked="transport === 'worker'" @change="auth.setTransport('worker')" />
        <span><strong>ผ่าน Cloudflare</strong><small>Browser → Worker → GAS</small></span>
      </label>
    </div>
    <label class="field-stack">
      <span class="label-text text-sm font-semibold">{{ transport === 'direct' ? 'GAS Web App URL' : 'Cloudflare Gateway URL' }}</span>
      <input class="input input-bordered w-full font-mono text-xs" type="url" :value="endpoint"
        :placeholder="transport === 'direct' ? 'https://script.google.com/macros/s/.../exec' : 'https://...workers.dev/api/frontend'"
        @input="auth.updateEndpoint($event.target.value)" />
      <span class="text-xs" :class="endpointValid ? 'text-success' : 'text-error'">{{ endpointValid ? 'รูปแบบ endpoint ถูกต้อง' : 'กรุณาตรวจ URL ของ endpoint' }}</span>
    </label>
    <div class="rounded-xl bg-base-200 p-3 text-xs leading-5 text-base-content/65">
      <template v-if="transport === 'direct'">โหมดตรงใช้ GAS URL จริง แต่อาจถูก browser ปฏิเสธที่ redirect/CORS</template>
      <template v-else>Worker รับ request จาก SPA แล้วส่งต่อไป GAS ช่วยควบคุม CORS, origin และ logging โดยไม่ย้าย business logic ออกจาก GAS</template>
    </div>
  </fieldset>
</template>
