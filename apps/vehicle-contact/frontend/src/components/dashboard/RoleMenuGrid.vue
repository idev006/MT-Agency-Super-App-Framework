<script setup>
defineProps({ items: { type: Array, required: true } })
</script>
<template>
  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    <template v-for="item in items" :key="item.id">
      <RouterLink v-if="item.route" class="group rounded-2xl border border-base-300 bg-base-100 p-5 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md" :to="{ name: item.route }">
        <span class="grid size-11 place-items-center rounded-xl bg-primary/10 text-2xl text-primary">{{ item.icon }}</span><strong class="mt-4 block text-lg">{{ item.label }}</strong><p class="mt-1 text-sm leading-6 text-base-content/60">{{ item.description }}</p>
      </RouterLink>
      <div v-else class="rounded-2xl border border-dashed border-base-300 bg-base-100/60 p-5 opacity-65"><span class="grid size-11 place-items-center rounded-xl bg-base-200 text-2xl">{{ item.icon }}</span><div class="mt-4 flex items-center justify-between gap-2"><strong class="text-lg">{{ item.label }}</strong><span class="badge badge-ghost badge-sm">เร็วๆ นี้</span></div><p class="mt-1 text-sm leading-6 text-base-content/60">{{ item.description }}</p></div>
    </template>
  </div>
</template>
