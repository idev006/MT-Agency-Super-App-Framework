import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { assertPaginationInput, callPaginatedOperation, mapPaginatedData, PAGE_SIZE_OPTIONS, PaginationContractError } from '../src/infrastructure/api/pagination-contract.js'
import { bangkokLocalToIso, formatBangkokDateTime } from '../src/domain/time/bangkok-date-time.js'

describe('server pagination frontend contract', () => {
  it('accepts only the product page-size policy', () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([1, 5, 10, 15, 25, 50, 100])
    for (const size of PAGE_SIZE_OPTIONS) expect(() => assertPaginationInput(1, size)).not.toThrow()
    expect(() => assertPaginationInput(0, 10)).toThrow(RangeError)
    expect(() => assertPaginationInput(1, 20)).toThrow(RangeError)
  })

  it('maps valid page metadata and rejects inconsistent totals', () => {
    expect(mapPaginatedData({ items: ['a'], total: 11, page: 2, pageSize: 10, totalPages: 2 }, String)).toEqual({ items: ['a'], pagination: { total: 11, page: 2, pageSize: 10, totalPages: 2 } })
    expect(() => mapPaginatedData({ items: [], total: 11, page: 1, pageSize: 10, totalPages: 1 }, String)).toThrow(PaginationContractError)
  })

  it('falls back to a bounded legacy list only for an older gateway contract', async () => {
    const oldGatewayError = Object.assign(new Error('old gateway'), { code: 'HTTP_403' })
    const callOperation = vi.fn().mockRejectedValueOnce(oldGatewayError).mockResolvedValueOnce({ data: ['a', 'b', 'c'], requestId: 'legacy' })
    const response = await callPaginatedOperation({ callOperation, operation: 'users.list', page: 2, pageSize: 1 })
    expect(callOperation).toHaveBeenNthCalledWith(1, 'users.list', { page: 2, pageSize: 1 }, undefined)
    expect(callOperation).toHaveBeenNthCalledWith(2, 'users.list', { limit: 100 }, undefined)
    expect(response.data).toEqual({ items: ['b'], total: 3, page: 2, pageSize: 1, totalPages: 3 })
  })

  it('does not hide authorization failures behind the legacy fallback', async () => {
    const denied = Object.assign(new Error('denied'), { code: 'FORBIDDEN' })
    const callOperation = vi.fn().mockRejectedValue(denied)
    await expect(callPaginatedOperation({ callOperation, operation: 'users.list', page: 1, pageSize: 10 })).rejects.toBe(denied)
    expect(callOperation).toHaveBeenCalledTimes(1)
  })

  it.each(['UserDirectoryPage.vue', 'OrganizationAdministrationPage.vue', 'CampaignAdministrationPage.vue', 'RetentionApprovalPage.vue', 'AuditReviewPage.vue'])('wires PaginationControl into %s', (name) => {
    const page = readFileSync(new URL(`../src/pages/${name}`, import.meta.url), 'utf8')
    expect(page).toContain('PaginationControl')
    expect(page).toContain('@update:page')
    expect(page).toContain('@update:page-size')
  })
})

describe('Asia/Bangkok date-time policy', () => {
  it('converts a Bangkok wall time to a stable UTC instant', () => {
    expect(bangkokLocalToIso('2026-11-20T09:30')).toBe('2026-11-20T02:30:00.000Z')
  })

  it('rejects normalized invalid calendar dates and formats bad data safely', () => {
    expect(() => bangkokLocalToIso('2026-02-31T09:30')).toThrow(RangeError)
    expect(formatBangkokDateTime('not-a-date')).toBe('ไม่ทราบเวลา')
  })
})
