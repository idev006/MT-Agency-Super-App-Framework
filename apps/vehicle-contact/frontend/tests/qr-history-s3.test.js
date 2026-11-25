// VC-ADR-036 S3: QR reasons + history in the UI. Reason vocabulary must equal the backend policy.
import { describe, expect, it, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { QR_REASONS as UI_REASONS, qrReasonProblem, qrReasonLabel } from '../src/domain/reference/qr-reasons.js'
import { QR_REASONS as SERVER_REASONS } from '../../backend/gas/src/domain/policies/QrReasonPolicy.js'
import { createGasQrGovernanceRepository } from '../src/infrastructure/qr/gas-qr-governance-repository.js'
import QrHistoryTable from '../src/features/qr-governance/components/QrHistoryTable.vue'

describe('QR reasons and history (S3)', () => {
  it('UI reason lists equal the backend policy (no drift)', () => {
    expect(JSON.parse(JSON.stringify(UI_REASONS))).toEqual(JSON.parse(JSON.stringify(SERVER_REASONS)))
  })
  it('validates reasons like the backend: OTHER needs a note; wrong mode refused', () => {
    expect(qrReasonProblem('revoke', 'NEW', '')).toBe('เลือกเหตุผล')
    expect(qrReasonProblem('replace', 'OTHER', '  ')).toBe('ระบุเหตุผลเพิ่มเติม')
    expect(qrReasonProblem('replace', 'OTHER', 'ซีด')).toBe('')
    expect(qrReasonProblem('issue', 'NEW', 'x'.repeat(201))).toMatch(/200/)
    expect(qrReasonLabel('VEHICLE_CANCELLED')).toBe('ยกเลิกยานพาหนะ')
  })
  it('repository sends reason (+ trimmed note) and maps history without tokens', async () => {
    const callOperation = vi.fn()
      .mockResolvedValueOnce({ data: { vehicleId: 'v', revoked: true }, requestId: 'r1' })
      .mockResolvedValueOnce({ data: { vehicleId: 'v', items: [{ qrId: 'q1', status: 'REVOKED', reason: 'NEW', revokeReason: 'LOST', revokedByName: 'Admin', token: 'should-not-pass' }] }, requestId: 'r2' })
    const repo = createGasQrGovernanceRepository({ callOperation })
    await repo.revoke('v', { reason: 'LOST', note: '  หาย  ' })
    expect(callOperation.mock.calls[0]).toEqual(['qr.revoke', { vehicleId: 'v', reason: 'LOST', note: 'หาย' }])
    const items = await repo.history('v')
    expect(items[0]).toMatchObject({ qrId: 'q1', revokeReason: 'LOST', revokedByName: 'Admin' })
    expect(JSON.stringify(items)).not.toContain('should-not-pass')
  })
  it('history table shows reasons, who, status; legacy rows without a reason are labelled', async () => {
    const html = await renderToString(createSSRApp(QrHistoryTable, { items: [
      { qrId: 'q2', status: 'ACTIVE', issuedAt: '2026-11-25T01:00:00Z', issuedByName: 'ผู้ดูแล', reason: 'DAMAGED', note: '', replacesQrId: 'q1', revokedAt: '', revokedByName: '', revokeReason: '', revokeNote: '' },
      { qrId: 'q1', status: 'REVOKED', issuedAt: '2026-11-24T01:00:00Z', issuedByName: '', reason: 'REGISTRATION_APPROVED', note: '', replacesQrId: '', revokedAt: '2026-11-25T01:00:00Z', revokedByName: '', revokeReason: '', revokeNote: '' },
    ] }))
    expect(html).toContain('ชำรุด / อ่านไม่ได้')
    expect(html).toContain('แทน QR ครั้งก่อน')
    expect(html).toContain('ใช้งานอยู่')
    expect(html).toContain('ออกเมื่ออนุมัติการลงทะเบียน')
    expect(html).toContain('ไม่ระบุ (ก่อนมีระบบเหตุผล)')
  })
})
