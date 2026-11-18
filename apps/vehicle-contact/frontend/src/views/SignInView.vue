<script setup>
import ThemePicker from '../components/common/ThemePicker.vue'
import SignInForm from '../components/auth/SignInForm.vue'
</script>
<template>
  <main class="min-h-dvh bg-base-200 p-4 sm:p-6 lg:p-10">
    <div class="mx-auto grid min-h-[calc(100dvh-2rem)] max-w-6xl overflow-hidden rounded-3xl border border-base-300 bg-base-100 shadow-xl sm:min-h-[calc(100dvh-3rem)] lg:grid-cols-[1.08fr_.92fr]">
      <section class="signin-identity relative hidden overflow-hidden p-10 text-primary-content lg:flex lg:flex-col lg:justify-between">
        <div class="relative z-10 flex items-center gap-3"><span class="grid size-12 place-items-center rounded-xl bg-primary-content text-xl font-black text-primary">P6</span><span><strong class="block text-lg">Vehicle Contact</strong><small class="opacity-75">ศูนย์ประสานข้อมูลยานพาหนะ</small></span></div>
        <div class="relative z-10 max-w-xl"><p class="mb-3 text-sm font-bold tracking-widest opacity-70">APPLICATION SHELL</p><h1 class="text-5xl font-black leading-tight">หนึ่งหน้าจอ<br />หลายบทบาท<br />ข้อมูลชุดเดียว</h1><p class="mt-5 max-w-md text-lg leading-8 opacity-80">เมนูเปลี่ยนตามสิทธิ์จาก GAS ส่วนข้อมูลสำคัญและกฎธุรกิจยังคงอยู่ที่ backend</p></div>
        <div class="relative z-10 route-mini"><span>SPA</span><i></i><span>WORKER</span><i></i><span>GAS</span></div>
      </section>
      <section class="flex flex-col p-5 sm:p-8 lg:p-10">
        <div class="mb-8 flex items-center justify-between"><div class="flex items-center gap-3 lg:hidden"><span class="grid size-10 place-items-center rounded-xl bg-primary font-black text-primary-content">P6</span><strong>Vehicle Contact</strong></div><ThemePicker class="ml-auto" /></div>
        <div class="mx-auto my-auto w-full max-w-md"><p class="text-sm font-bold text-primary">เข้าสู่ระบบทดสอบ</p><h2 class="mt-1 text-3xl font-black">ยืนยันตัวตนกับ GAS</h2><p class="mt-2 mb-7 leading-7 text-base-content/60">เลือกเส้นทาง API แล้วใช้บัญชี development เพื่อเปิด dashboard ตามบทบาท</p><SignInForm /></div>
      </section>
    </div>
  </main>
</template>
