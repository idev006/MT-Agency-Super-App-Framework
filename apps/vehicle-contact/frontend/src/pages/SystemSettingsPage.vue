<script setup>
import { computed, inject, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { systemSettingsRepositoryKey } from '../application/settings/system-settings-port.js'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import SystemSettingsForm from '../features/settings/components/SystemSettingsForm.vue'
import StickerCategorySettings from '../features/settings/components/StickerCategorySettings.vue'
import SystemResetPanel from '../features/settings/components/SystemResetPanel.vue'
import { useSystemSettings } from '../features/settings/useSystemSettings.js'
import { useSessionStore } from '../stores/session.js'

const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const settingsRepository = inject(systemSettingsRepositoryKey)
const systemSettings = useSystemSettings({ repository: settingsRepository, permissions })
// VC-ADR-039: shown only to sessions with system.reset (the server also checks it and its own switch)
const canReset = computed(() => (permissions.value || []).includes('system.reset') && typeof settingsRepository?.resetPreview === 'function')
onMounted(() => systemSettings.load())
async function saveStickers(list, done) { if (await systemSettings.saveStickerCategories(list)) done() }
</script>

<template>
  <PageTemplateComponent eyebrow="การดูแลระบบ" title="ตั้งค่าระบบ" description="กำหนดอายุ session นโยบายการเก็บข้อมูล และประเภทบุคคล/สีสติกเกอร์">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span aria-hidden="true"> / </span><span aria-current="page">ตั้งค่าระบบ</span></template>
    <template #actions><span v-if="!systemSettings.canManage.value" class="badge badge-ghost">อ่านอย่างเดียว</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>
    <div v-if="systemSettings.phase.value === 'idle' || systemSettings.phase.value === 'loading'" class="space-y-3" role="status"><span class="sr-only">กำลังโหลดการตั้งค่าระบบ</span><div class="skeleton h-52 w-full"></div></div>
    <div v-else-if="systemSettings.phase.value === 'forbidden'" class="alert alert-warning"><span>เซสชันนี้ไม่มีสิทธิ์อ่านการตั้งค่าระบบ</span></div>
    <div v-else-if="systemSettings.phase.value === 'unauthenticated'" class="alert alert-warning"><span>เซสชันสิ้นสุดแล้ว กรุณาเข้าสู่ระบบใหม่</span></div>
    <div v-else-if="systemSettings.phase.value === 'error'" class="alert alert-error"><div><strong>โหลดการตั้งค่าไม่สำเร็จ</strong><button class="btn btn-sm mt-2" type="button" @click="systemSettings.load">ลองอีกครั้ง</button></div></div>
    <template v-else>
      <div v-if="systemSettings.savePhase.value === 'uncertain'" class="alert alert-warning mb-4"><span>ไม่สามารถยืนยันผลการบันทึกได้ กรุณาโหลดค่าใหม่ก่อนบันทึกซ้ำ</span></div>
      <div v-else-if="systemSettings.savePhase.value === 'error'" class="alert alert-error mb-4"><span>บันทึกการตั้งค่าไม่สำเร็จ</span></div>
      <div v-else-if="systemSettings.savePhase.value === 'success'" class="alert alert-success mb-4"><span>บันทึกการตั้งค่าระบบแล้ว</span></div>
      <SystemSettingsForm :settings="systemSettings.settings.value" :can-manage="systemSettings.canManage.value" :busy="systemSettings.savePhase.value === 'submitting'" @save="systemSettings.save" />
      <StickerCategorySettings class="mt-6" :categories="systemSettings.settings.value?.stickerCategories || []" :can-manage="systemSettings.canManage.value"
        :phase="systemSettings.stickerPhase.value" :failure-code="systemSettings.stickerFailure.value?.code || ''" @save="saveStickers" />
      <SystemResetPanel v-if="canReset" class="mt-6" :repository="settingsRepository" />
    </template>
  </PageTemplateComponent>
</template>
