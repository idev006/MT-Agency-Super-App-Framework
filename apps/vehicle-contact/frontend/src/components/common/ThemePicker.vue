<script setup>
import { storeToRefs } from 'pinia'
import { themes, useUiStore } from '../../stores/ui.js'
const ui = useUiStore()
const { theme } = storeToRefs(ui)
const themeLabels = Object.freeze({
  light: 'สว่าง', dark: 'มืด', cupcake: 'คัพเค้ก', bumblebee: 'ผึ้ง', emerald: 'มรกต', corporate: 'สุภาพ',
  synthwave: 'ซินธ์เวฟ', retro: 'ย้อนยุค', cyberpunk: 'ไซเบอร์พังก์', valentine: 'วาเลนไทน์', halloween: 'ฮาโลวีน',
  garden: 'สวน', forest: 'ป่า', aqua: 'น้ำทะเล', lofi: 'โลไฟ', pastel: 'พาสเทล', fantasy: 'แฟนตาซี',
  wireframe: 'โครงร่าง', black: 'ดำ', luxury: 'หรู', dracula: 'แดรกคูลา', cmyk: 'งานพิมพ์', autumn: 'ใบไม้ร่วง',
  business: 'ธุรกิจ', acid: 'แอซิด', lemonade: 'เลมอนเนด', night: 'กลางคืน', coffee: 'กาแฟ', winter: 'ฤดูหนาว',
  dim: 'สลัว', nord: 'นอร์ด', sunset: 'อาทิตย์ตก', caramellatte: 'คาราเมลลาเต้', abyss: 'ห้วงลึก', silk: 'ไหม',
})
</script>
<template>
  <label class="w-full sm:w-48">
    <span class="sr-only">เลือกชุดสี</span>
    <select class="select select-bordered min-h-11 w-full" :value="theme" :aria-label="`ชุดสี ${themeLabels[theme]} (${theme})`" @change="ui.applyTheme($event.target.value)">
      <option v-for="item in themes" :key="item" :value="item">{{ themeLabels[item] }} ({{ item }})</option>
    </select>
  </label>
</template>
