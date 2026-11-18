import { describe, expect, it } from 'vitest'
import { labelsForRoles } from '../src/domain/identity/role-presentation.js'

describe('Thai role presentation', () => {
  it('presents known role codes in Thai without changing the authority value', () => {
    expect(labelsForRoles(['STAFF', 'SYSTEM_ADMIN'])).toEqual(['เจ้าหน้าที่ค้นหาข้อมูล', 'ผู้ดูแลระบบ'])
  })

  it('uses a safe label for an unknown future role', () => {
    expect(labelsForRoles(['FUTURE_ROLE'])).toEqual(['บทบาทเฉพาะ'])
  })
})
