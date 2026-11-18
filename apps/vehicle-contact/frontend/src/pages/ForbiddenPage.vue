<script setup>
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
</script>

<template>
  <PageTemplateComponent title="ไม่สามารถเปิดงานนี้ได้" description="เซสชันนี้ไม่ได้รับอนุญาตให้เปิดหน้าที่ร้องขอ">
    <div class="alert alert-warning items-start shadow-none"><div><h2 class="font-medium">ไม่มีข้อมูลถูกเปิดเผย</h2><p class="mt-1">กลับไปเลือกงานที่ได้รับอนุญาต หรือติดต่อผู้ดูแลหากหน้าที่ของคุณเปลี่ยนแปลง</p><RouterLink class="btn mt-4" :to="{ name: 'dashboard' }">กลับไปภาพรวม</RouterLink></div></div>
  </PageTemplateComponent>
</template>
