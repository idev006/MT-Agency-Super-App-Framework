export const roleLabels = Object.freeze({
  SYSTEM_ADMIN: 'ผู้ดูแลระบบ',
  REGISTRATION_ADMIN: 'ผู้ตรวจสอบการลงทะเบียน',
  STAFF: 'เจ้าหน้าที่ค้นหาข้อมูล',
  OWNER: 'เจ้าของยานพาหนะ',
  RETENTION_WORKER: 'ผู้ปฏิบัติงานด้านการเก็บรักษาข้อมูล',
})

export function labelsForRoles(roles = []) {
  return roles.map((role) => roleLabels[role] || 'บทบาทเฉพาะ')
}
