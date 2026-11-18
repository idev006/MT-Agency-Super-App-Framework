<script setup>
import { RouterView } from 'vue-router'
import { useUiStore } from './stores/ui.js'
useUiStore()
</script>
<template><RouterView /></template>
