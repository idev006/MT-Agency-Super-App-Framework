<script setup>
import { computed } from 'vue'
const props = defineProps({ items: { type: Array, required: true } })
const availableItems = computed(() => props.items.filter((item) => item.route))
const plannedItems = computed(() => props.items.filter((item) => !item.route))
</script>
<template>
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    <RouterLink v-for="item in availableItems" :key="item.id" class="card card-border p6-task-card bg-base-100 transition hover:border-primary hover:shadow-md" :to="{ name: item.route }">
      <div class="card-body gap-2 p-5 sm:p-6">
        <div class="flex items-start justify-between gap-4"><h3 class="card-title text-xl font-medium">{{ item.label }}</h3><span class="badge badge-ghost">พร้อมใช้</span></div>
        <p class="leading-7 text-base-content/65">{{ item.description }}</p>
        <div class="card-actions mt-2"><span class="link font-medium">เปิดงาน</span></div>
      </div>
    </RouterLink>
  </div>
  <section v-if="plannedItems.length" class="mt-8" aria-labelledby="planned-work-title">
    <h3 id="planned-work-title" class="text-lg font-medium">กำลังพัฒนา</h3>
    <p class="mb-3 mt-1 text-sm text-base-content/70">รายการเหล่านี้ตรงกับสิทธิ์ของคุณ แต่ยังไม่เปิดใช้งาน</p>
    <ul class="list rounded-box border border-base-300 bg-base-100">
      <li v-for="item in plannedItems" :key="item.id" class="list-row items-center">
        <div class="min-w-0 flex-1"><strong class="font-medium">{{ item.label }}</strong><p class="mt-1 text-sm leading-6 text-base-content/60">{{ item.description }}</p></div>
        <span class="badge badge-ghost">ยังไม่เปิดใช้</span>
      </li>
    </ul>
  </section>
</template>
