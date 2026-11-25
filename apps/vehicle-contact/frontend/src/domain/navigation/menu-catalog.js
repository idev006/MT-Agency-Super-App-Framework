export const menuCatalog = Object.freeze([
  { id: 'dashboard', icon: 'dashboard', label: 'ภาพรวม', description: 'งานที่คุณได้รับสิทธิ์และสถานะการใช้งาน', route: 'dashboard', shared: true },
  { id: 'about', icon: 'connection', label: 'เกี่ยวกับระบบ', description: 'สถานะ เวอร์ชัน และการคุ้มครองข้อมูลของระบบ', route: 'about', shared: true },
  { id: 'account-security', icon: 'account', label: 'บัญชีและความปลอดภัย', description: 'เปลี่ยนรหัสผ่านและจัดการการเชื่อมโยงบัญชี', route: 'account-security', permissionsAny: ['session.authenticated'] },
  { id: 'vehicle-search', label: 'ค้นหายานพาหนะ', description: 'ค้นหาทะเบียนและข้อมูลผู้ประสานงาน', route: 'vehicle-search', permissionsAny: ['vehicle.lookup'] },
  { id: 'qr-resolve', icon: 'qr', label: 'ตรวจสอบ QR ยานพาหนะ', description: 'ตรวจสอบ QR และดูข้อมูลรถตามสิทธิ์', route: 'qr-resolve', permissionsAny: ['vehicle.lookup'] },
  { id: 'registration-intake', icon: 'add', label: 'รับลงทะเบียนยานพาหนะ', description: 'บันทึกคำขอใหม่พร้อมข้อมูลและภาพหลักฐาน 5 ตำแหน่ง', route: 'registration-intake', permissionsAny: ['vehicle.registration.approve'] },
  { id: 'registration-review', icon: 'registration', label: 'ตรวจสอบการลงทะเบียน', description: 'พิจารณารายการที่รอตรวจสอบ', route: 'registration-review', permissionsAny: ['vehicle.registration.approve'] },
  { id: 'change-review', icon: 'registration', label: 'ตรวจสอบคำขอเปลี่ยนแปลง', description: 'เปรียบเทียบค่าปัจจุบันกับที่เสนอ แล้วอนุมัติหรือปฏิเสธ', route: 'change-review', permissionsAny: ['vehicle.change.approve'] },
  { id: 'my-vehicles', label: 'ยานพาหนะของฉัน', description: 'ดูข้อมูลและส่งคำขอเปลี่ยนแปลง', route: 'my-vehicles', permissionsAny: ['vehicle.change.submit'] },
  { id: 'vehicle-registry', icon: 'registration', label: 'ทะเบียนยานพาหนะ', description: 'รายการยานพาหนะที่อนุมัติแล้วทั้งหมดสำหรับผู้ดูแลระบบ', route: 'vehicle-registry', permissionsAny: ['vehicle.list'] },
  { id: 'user-admin', icon: 'users', label: 'ผู้ใช้และสิทธิ์', description: 'ตรวจสอบผู้ใช้ สถานะ บทบาท และสิทธิ์', route: 'user-directory', permissionsAny: ['users.manage'] },
  { id: 'organizations', icon: 'organizations', label: 'หน่วยงาน', description: 'จัดการโครงสร้างหน่วยงานตำรวจและหน่วยงานภายนอก', route: 'organization-administration', permissionsAny: ['organizations.read', 'organizations.manage'] },
  { id: 'campaigns', icon: 'campaigns', label: 'แคมเปญลงทะเบียน', description: 'สร้าง ตรวจสอบ และเพิกถอนแคมเปญลงทะเบียน', route: 'campaign-administration', permissionsAny: ['campaigns.manage'] },
  { id: 'qr-governance', icon: 'qr', label: 'จัดการ QR', description: 'ออก เพิกถอน และเปลี่ยน QR ภายใต้สิทธิ์ที่กำหนด', route: 'qr-governance', permissionsAny: ['qr.manage'] },
  { id: 'system-settings', icon: 'settings', label: 'ตั้งค่าระบบ', description: 'ตรวจสอบและปรับนโยบายการทำงานของระบบ', route: 'system-settings', permissionsAny: ['system.settings.read', 'system.settings.manage'] },
  { id: 'retention', icon: 'retention', label: 'การเก็บรักษาข้อมูล', description: 'ตรวจสอบหรือดำเนินงานตามนโยบายข้อมูล', route: 'retention-approval', permissionsAny: ['retention.read', 'retention.delete.approve'] },
  { id: 'audit', icon: 'audit', label: 'ตรวจสอบ Audit', description: 'ตรวจสอบและส่งออกหลักฐานกิจกรรมที่ได้รับอนุญาต', route: 'audit-review', permissionsAny: ['audit.read'] },
])

export function menuForPermissions(permissions = []) {
  const granted = new Set(permissions)
  return menuCatalog.filter((item) => item.shared || item.permissionsAny?.some((permission) => granted.has(permission)))
}
