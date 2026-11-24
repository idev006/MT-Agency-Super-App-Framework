<script setup>
defineProps({ items: { type: Array, required: true } })
defineEmits(['retry'])
</script>
<template>
  <section v-if="items.length" aria-labelledby="pending-work-title" class="mb-8">
    <h2 id="pending-work-title" class="mb-3 text-2xl font-semibold">งานรอดำเนินการ</h2>
    <div class="grid gap-4 sm:grid-cols-2">
      <article v-for="item in items" :key="item.id" class="card card-border bg-base-100" :aria-busy="item.status === 'loading'">
        <div class="card-body gap-3 p-5">
          <h3 class="font-medium text-base-content/80">{{ item.label }}</h3>
          <template v-if="item.status === 'loading'">
            <div class="skeleton h-10 w-20" aria-hidden="true"></div>
            <p class="text-sm text-base-content/70" role="status">กำลังนับรายการจากระบบส่วนกลาง…</p>
          </template>
          <template v-else-if="item.status === 'error'">
            <div class="alert alert-error py-2 text-sm" role="alert"><span>นับรายการไม่สำเร็จ <span class="font-mono text-xs">({{ item.errorCode }})</span></span></div>
            <div class="card-actions"><button class="btn btn-sm" type="button" @click="$emit('retry', item)">ลองอีกครั้ง</button></div>
          </template>
          <template v-else>
            <p class="text-4xl font-bold" :class="item.total ? 'text-primary' : 'text-base-content/60'">{{ item.total.toLocaleString('th-TH') }} <span class="text-base font-normal text-base-content/70">รายการ</span></p>
            <p v-if="!item.total" class="text-sm text-base-content/70">{{ item.emptyText }}</p>
            <div class="card-actions"><RouterLink class="btn btn-primary btn-sm" :to="{ name: item.route }">{{ item.total ? 'เริ่มตรวจสอบ' : 'เปิดคิว' }}</RouterLink></div>
          </template>
        </div>
      </article>
    </div>
  </section>
</template>
