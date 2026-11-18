export const menuCatalog = Object.freeze([
  { id: 'dashboard', label: 'ภาพรวม', description: 'งานที่คุณได้รับสิทธิ์และสถานะการใช้งาน', route: 'dashboard', shared: true },
  { id: 'connection', label: 'ตรวจสอบการเชื่อมต่อ', description: 'ตรวจสอบเส้นทางเชื่อมต่อระบบส่วนกลาง', route: 'connection-test', shared: true },
  { id: 'vehicle-search', label: 'ค้นหายานพาหนะ', description: 'ค้นหาทะเบียนและข้อมูลผู้ประสานงาน', route: 'vehicle-search', permissionsAny: ['vehicle.lookup'] },
  { id: 'registration-review', label: 'ตรวจสอบการลงทะเบียน', description: 'พิจารณารายการที่รอตรวจสอบ', permissionsAny: ['vehicle.registration.approve'] },
  { id: 'my-vehicles', label: 'ยานพาหนะของฉัน', description: 'ดูข้อมูลและส่งคำขอเปลี่ยนแปลง', permissionsAny: ['vehicle.change.submit'] },
  { id: 'user-admin', label: 'ผู้ใช้และสิทธิ์', description: 'ตรวจสอบผู้ใช้ สถานะ และหน่วยงาน', route: 'user-directory', permissionsAny: ['users.manage'] },
  { id: 'retention', label: 'การเก็บรักษาข้อมูล', description: 'ตรวจสอบหรือดำเนินงานตามนโยบายข้อมูล', permissionsAny: ['retention.read', 'retention.delete.approve', 'retention.worker'] },
])

export function menuForPermissions(permissions = []) {
  const granted = new Set(permissions)
  return menuCatalog.filter((item) => item.shared || item.permissionsAny?.some((permission) => granted.has(permission)))
}
