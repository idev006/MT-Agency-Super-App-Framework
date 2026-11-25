<script setup>
import { qrReasonLabel } from '../../../domain/reference/qr-reasons.js'
import { formatBangkokDateTime } from '../../../domain/time/bangkok-date-time.js'

// VC-ADR-036 S3: one table for the QR history (QR management page and the vehicle detail "QR" tab).
defineProps({ items: { type: Array, required: true }, phase: { type: String, default: 'ready' } })
const when = (value) => formatBangkokDateTime(value, '—')
</script>

<template>
  <div v-if="phase === 'loading'" class="skeleton h-24 w-full" role="status"><span class="sr-only">กำลังโหลดประวัติ QR</span></div>
  <div v-else-if="phase === 'error'" class="alert alert-error">โหลดประวัติ QR ไม่สำเร็จ</div>
  <p v-else-if="!items.length" class="text-base-content/80">ยังไม่มีประวัติ QR</p>
  <div v-else class="overflow-x-auto rounded-box border border-base-300">
    <table class="table table-sm" aria-label="ประวัติ QR">
      <thead><tr><th>ครั้งที่</th><th>ออกเมื่อ</th><th>ผู้ออก</th><th>เหตุผลที่ออก</th><th>สถานะ</th><th>เพิกถอนเมื่อ</th><th>ผู้เพิกถอน</th><th>เหตุผลที่เพิกถอน</th></tr></thead>
      <tbody>
        <tr v-for="(item, index) in items" :key="item.qrId">
          <td>{{ items.length - index }}</td>
          <td class="whitespace-nowrap">{{ when(item.issuedAt) }}</td>
          <td>{{ item.issuedByName || '—' }}</td>
          <td>{{ qrReasonLabel(item.reason) }}<span v-if="item.note" class="block text-xs text-base-content/80">{{ item.note }}</span><span v-if="item.replacesQrId" class="block text-xs text-base-content/80">แทน QR ครั้งก่อน</span></td>
          <td><span class="badge whitespace-nowrap" :class="item.status === 'ACTIVE' ? 'badge-success' : 'badge-ghost'">{{ item.status === 'ACTIVE' ? 'ใช้งานอยู่' : 'เพิกถอนแล้ว' }}</span></td>
          <td class="whitespace-nowrap">{{ item.revokedAt ? when(item.revokedAt) : '—' }}</td>
          <td>{{ item.revokedByName || (item.revokedAt ? 'ไม่ระบุ' : '—') }}</td>
          <td>{{ item.revokeReason ? qrReasonLabel(item.revokeReason) : (item.revokedAt ? 'ไม่ระบุ (ก่อนมีระบบเหตุผล)' : '—') }}<span v-if="item.revokeNote" class="block text-xs text-base-content/80">{{ item.revokeNote }}</span></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
