<script setup>
// D1/D2 + owner 2026-11-25: rows/columns are a table on desktop AND phone; phones scroll sideways.
// One table look (styles.css .p6-table): columns size to content, never wider than 350px, long text
// wraps inside its column. Column: { key, label, kind?, class?, srOnly? } where kind is one of
// name | text | date | status | number | code | actions (default: plain). The first column is sticky.
// Cells are overridable per column with slots named `cell-<key>` (row passed as `row`).
defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
  rowKey: { type: String, required: true },
  label: { type: String, required: true },
})
const cellClass = (col, index) => [index === 0 ? 'p6-col-sticky' : '', col.kind ? `p6-col-${col.kind}` : '', col.class || '']
</script>

<template>
  <div class="data-table p6-table-wrap">
    <table class="p6-table" :aria-label="label">
      <thead>
        <tr>
          <th v-for="(col, index) in columns" :key="col.key" :class="cellClass(col, index)" scope="col">
            <span :class="col.srOnly ? 'sr-only' : ''">{{ col.label }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row[rowKey]">
          <td v-for="(col, index) in columns" :key="col.key" :class="cellClass(col, index)">
            <div class="p6-cell"><slot :name="`cell-${col.key}`" :row="row">{{ row[col.key] ?? '—' }}</slot></div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
