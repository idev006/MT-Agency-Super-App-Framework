<script setup>
defineProps({ users: { type: Array, required: true } })

const statusLabels = Object.freeze({ ACTIVE: 'ใช้งาน', SUSPENDED: 'ระงับการใช้งาน', INACTIVE: 'ไม่ใช้งาน' })
const statusLabel = (status) => statusLabels[status] || 'สถานะอื่น'
const statusClass = (status) => status === 'ACTIVE' ? 'badge-success' : status === 'SUSPENDED' ? 'badge-warning' : 'badge-ghost'
</script>

<template>
  <section class="card card-border bg-base-100 shadow-none" aria-labelledby="user-directory-title">
    <div class="card-body gap-5 p-5 sm:p-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="user-directory-title" class="card-title text-xl font-medium">บัญชีผู้ใช้</h2><p class="mt-1 text-base-content/70">แสดงสูงสุด 50 บัญชีตามลำดับที่ระบบส่วนกลางคืนมา</p></div>
        <span class="badge badge-neutral">{{ users.length }} บัญชี</span>
      </div>

      <div class="hidden overflow-x-auto md:block">
        <table class="table">
          <thead><tr><th>ชื่อที่แสดง</th><th>ชื่อผู้ใช้</th><th>หน่วยงาน</th><th>สถานะ</th></tr></thead>
          <tbody>
            <tr v-for="user in users" :key="user.userId">
              <td class="font-medium">{{ user.displayName || 'ยังไม่กำหนด' }}</td>
              <td>{{ user.username }}</td>
              <td>{{ user.organizationId || 'ยังไม่ผูกหน่วยงาน' }}</td>
              <td><span class="badge" :class="statusClass(user.status)">{{ statusLabel(user.status) }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul class="list rounded-box border border-base-300 md:hidden">
        <li v-for="user in users" :key="user.userId" class="list-row gap-3">
          <div class="min-w-0 flex-1"><strong class="block truncate font-medium">{{ user.displayName || 'ยังไม่กำหนดชื่อ' }}</strong><p class="truncate text-sm text-base-content/70">{{ user.username }}</p><p class="mt-1 text-sm text-base-content/60">{{ user.organizationId || 'ยังไม่ผูกหน่วยงาน' }}</p></div>
          <span class="badge" :class="statusClass(user.status)">{{ statusLabel(user.status) }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
