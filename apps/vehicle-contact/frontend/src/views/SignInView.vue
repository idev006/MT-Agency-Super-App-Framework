<script setup>
import ThemePicker from '../components/common/ThemePicker.vue'
import SignInForm from '../components/auth/SignInForm.vue'
</script>
<template>
  <main class="min-h-dvh bg-base-200 p-4 sm:p-6 lg:p-10">
    <div class="mx-auto grid min-h-[calc(100dvh-2rem)] max-w-6xl overflow-hidden rounded-3xl border border-base-300 bg-base-100 shadow-xl sm:min-h-[calc(100dvh-3rem)] lg:grid-cols-[1.08fr_.92fr]">
      <section class="signin-identity relative hidden overflow-hidden p-10 text-primary-content lg:flex lg:flex-col lg:justify-between">
        <div class="relative z-10 flex items-center gap-3"><span class="grid size-12 place-items-center rounded-xl bg-primary-content text-xl font-black text-primary">P6</span><span><strong class="block text-lg">Vehicle Contact</strong><small class="opacity-75">ตำรวจภูธรภาค 6</small></span></div>
        <div class="relative z-10 max-w-xl">
          <h1 class="text-5xl font-black leading-tight">ศูนย์ประสาน<br />ข้อมูลยานพาหนะ</h1>
          <ul class="mt-6 max-w-md space-y-2 text-lg leading-8 opacity-90">
            <li>ค้นหาทะเบียนหรือสแกน QR เพื่อติดต่อผู้ประสานงาน</li>
            <li>ตรวจสอบคำขอลงทะเบียนพร้อมภาพหลักฐาน</li>
            <li>ทุกการเข้าถึงข้อมูลถูกบันทึกเพื่อการตรวจสอบ</li>
          </ul>
        </div>
        <p class="relative z-10 text-sm opacity-75">ใช้งานเฉพาะเจ้าหน้าที่และผู้ที่ได้รับอนุญาตเท่านั้น</p>
      </section>
      <section class="flex flex-col p-5 sm:p-8 lg:p-10">
        <div class="mb-8 flex items-center justify-between"><div class="flex items-center gap-3 lg:hidden"><span class="grid size-10 place-items-center rounded-xl bg-primary font-black text-primary-content">P6</span><strong>Vehicle Contact</strong></div><ThemePicker class="ml-auto" /></div>
        <div class="mx-auto my-auto w-full max-w-md">
          <span class="badge badge-warning mb-3">ระบบทดสอบ · ข้อมูลสมมติเท่านั้น</span>
          <h2 class="text-3xl font-black">เข้าสู่ระบบ</h2>
          <p class="mt-2 mb-7 leading-7 text-base-content/80">ใช้ชื่อผู้ใช้และรหัสผ่านที่ได้รับจากผู้ดูแลระบบ</p>
          <SignInForm />
          <p class="mt-4 text-sm text-base-content/80">เพื่อความปลอดภัย การเข้าสู่ระบบแยกตามแท็บ เปิดแท็บใหม่ต้องเข้าสู่ระบบอีกครั้ง</p>
        </div>
      </section>
    </div>
  </main>
</template>
