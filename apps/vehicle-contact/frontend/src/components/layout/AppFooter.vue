<script setup>
import packageInfo from '../../../package.json'
// Owner 2026-11-25: system details live on the About page, not in every footer.
</script>

<template>
  <footer class="border-t border-base-300 bg-base-100 px-4 py-3 text-center text-sm text-base-content/80 sm:px-6">
    <p>P6 Vehicle Contact · ระบบทดสอบ (ข้อมูลสมมติเท่านั้น) · v{{ packageInfo.version }} · <RouterLink class="link" :to="{ name: 'about' }">เกี่ยวกับระบบ</RouterLink></p>
  </footer>
</template>
