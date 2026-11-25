<script setup>
// D1 (owner: rows/columns are a table on desktop AND phone; phones scroll sideways). One table component:
// sticky header + sticky first column, horizontal scroll inside the card, cells overridable per column
// with slots named `cell-<key>` (row passed as `row`).
defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
  rowKey: { type: String, required: true },
  label: { type: String, required: true },
})
</script>

<template>
  <div class="data-table overflow-x-auto rounded-box border border-base-300 bg-base-100">
    <table class="table table-zebra" :aria-label="label">
      <thead>
        <tr>
          <th v-for="(col, index) in columns" :key="col.key" :class="[index === 0 ? 'data-table__sticky' : '', col.class || '']" scope="col">
            <span :class="col.srOnly ? 'sr-only' : ''">{{ col.label }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row[rowKey]">
          <td v-for="(col, index) in columns" :key="col.key" :class="[index === 0 ? 'data-table__sticky font-semibold' : '', col.class || '']">
            <slot :name="`cell-${col.key}`" :row="row">{{ row[col.key] ?? '—' }}</slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.data-table thead th { position: sticky; top: 0; z-index: 2; background: var(--color-base-100); }
.data-table .data-table__sticky { position: sticky; left: 0; z-index: 1; background: inherit; }
.data-table thead .data-table__sticky { z-index: 3; }
.data-table tbody tr:nth-child(odd) .data-table__sticky { background: var(--color-base-100); }
.data-table tbody tr:nth-child(even) .data-table__sticky { background: var(--color-base-200); }
</style>
