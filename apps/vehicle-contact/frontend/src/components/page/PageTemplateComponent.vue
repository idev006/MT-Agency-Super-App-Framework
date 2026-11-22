<script setup>
import { computed, useSlots } from 'vue'

const props = defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  size: { type: String, default: 'wide', validator: (value) => ['normal', 'wide', 'full'].includes(value) },
})

const slots = useSlots()
const containerClass = computed(() => ({
  normal: 'max-w-5xl',
  wide: 'max-w-7xl',
  full: 'max-w-none',
}[props.size]))
const contentClass = computed(() => slots.aside ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,.42fr)]' : '')
</script>

<template>
  <article class="page-template mx-auto w-full space-y-4 p-3 sm:p-4 lg:p-5" :class="containerClass">
    <nav v-if="$slots.breadcrumbs" class="text-sm text-base-content/75" aria-label="เส้นทางหน้าปัจจุบัน">
      <slot name="breadcrumbs" />
    </nav>

    <header class="page-template__header">
      <div class="min-w-0 flex-1">
        <p v-if="eyebrow" class="text-sm font-medium text-base-content/75">{{ eyebrow }}</p>
        <h1 class="text-xl font-semibold leading-7 sm:text-2xl sm:leading-8">{{ title }}</h1>
        <p v-if="description" class="mt-1 max-w-3xl text-base leading-6 text-base-content/80">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="page-template__actions"><slot name="actions" /></div>
    </header>

    <section v-if="$slots.context || $slots.status" class="page-template__context">
      <slot name="context"><slot name="status" /></slot>
    </section>

    <section v-if="$slots.toolbar" class="page-template__toolbar" aria-label="เครื่องมือของหน้า"><slot name="toolbar" /></section>

    <div class="page-template__content" :class="contentClass">
      <div class="min-w-0"><slot /></div>
      <aside v-if="$slots.aside" class="min-w-0 lg:sticky lg:top-24 lg:self-start"><slot name="aside" /></aside>
    </div>

    <footer v-if="$slots.footer" class="page-template__footer"><slot name="footer" /></footer>
  </article>
</template>
