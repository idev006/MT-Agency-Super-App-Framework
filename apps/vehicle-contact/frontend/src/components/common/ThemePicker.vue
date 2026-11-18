<script setup>
import { storeToRefs } from 'pinia'
import { themes, useUiStore } from '../../stores/ui.js'
const ui = useUiStore()
const { theme } = storeToRefs(ui)
</script>
<template>
  <label class="form-control w-36 sm:w-44">
    <span class="sr-only">เลือกธีม</span>
    <select class="select select-bordered select-sm w-full" :value="theme" :aria-label="`ธีม ${theme}`" @change="ui.applyTheme($event.target.value)">
      <option v-for="item in themes" :key="item" :value="item">{{ item }}</option>
    </select>
  </label>
</template>
