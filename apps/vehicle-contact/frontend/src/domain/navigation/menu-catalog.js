export const menuCatalog = Object.freeze([
  { id: 'dashboard', label: 'ภาพรวม', description: 'สถานะระบบและเมนูตามบทบาท', route: 'dashboard', roles: ['*'], icon: '▦' },
  { id: 'connection', label: 'ทดสอบการเชื่อมต่อ', description: 'เปรียบเทียบ Direct GAS และ Cloudflare', route: 'connection-test', roles: ['*'], icon: '↔' },
  { id: 'vehicle-search', label: 'ค้นหายานพาหนะ', description: 'ค้นหาทะเบียนและข้อมูลผู้ประสานงาน', roles: ['STAFF', 'REGISTRATION_ADMIN', 'SYSTEM_ADMIN'], icon: '⌕' },
  { id: 'registration-review', label: 'ตรวจสอบการลงทะเบียน', description: 'พิจารณารายการที่รอตรวจสอบ', roles: ['REGISTRATION_ADMIN', 'SYSTEM_ADMIN'], icon: '✓' },
  { id: 'my-vehicles', label: 'ยานพาหนะของฉัน', description: 'ดูข้อมูลและส่งคำขอเปลี่ยนแปลง', roles: ['OWNER'], icon: '▣' },
  { id: 'user-admin', label: 'ผู้ใช้และสิทธิ์', description: 'จัดการผู้ใช้ บทบาท และหน่วยงาน', roles: ['SYSTEM_ADMIN'], icon: '♙' },
  { id: 'retention', label: 'การเก็บรักษาข้อมูล', description: 'ตรวจสอบงาน retention ที่ได้รับอนุมัติ', roles: ['RETENTION_WORKER', 'SYSTEM_ADMIN'], icon: '◷' },
])

export function menuForRoles(roles = []) {
  return menuCatalog.filter((item) => item.roles.includes('*') || item.roles.some((role) => roles.includes(role)))
}
