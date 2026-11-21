import { computed, ref, unref } from 'vue'
import { assertVehicleMaintenanceRepository } from '../../application/vehicles/vehicle-maintenance-port.js'
import { assertVehicleDetailRepository } from '../../application/vehicles/vehicle-detail-port.js'

const WRITE_UNCERTAIN = new Set(['TIMEOUT', 'NETWORK_ERROR'])
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_FILE_BYTES = 5_000_000

function permissionList(permissions) {
  return Array.isArray(unref(permissions)) ? unref(permissions) : []
}

async function fileBase64(file) {
  if (!file || !ALLOWED_MIME.has(file.type) || file.size < 1 || file.size > MAX_FILE_BYTES) {
    throw Object.assign(new Error('invalid image'), { code: 'INVALID_MEDIA' })
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  return btoa(binary)
}

export function useVehicleMaintenance({ repository, detailRepository, permissions }) {
  const source = assertVehicleMaintenanceRepository(repository)
  const detailSource = assertVehicleDetailRepository(detailRepository)
  const phase = ref('idle')
  const actionPhase = ref('idle')
  const failure = ref(null)
  const vehicle = ref(null)
  const version = ref(0)
  const vehicleId = ref('')
  const conflict = ref(false)
  const cancelled = ref(false)
  const canEdit = computed(() => permissionList(permissions).includes('vehicle.update'))

  function capture(error, target) {
    failure.value = { code: error?.code || 'UNEXPECTED_ERROR', requestId: error?.requestId || '' }
    target.value = error?.code === 'FORBIDDEN' ? 'forbidden'
      : error?.code === 'UNAUTHENTICATED' ? 'unauthenticated'
        : WRITE_UNCERTAIN.has(error?.code) ? 'uncertain' : 'error'
  }

  async function load(id) {
    vehicleId.value = String(id || '').trim()
    conflict.value = false
    if (!canEdit.value) { phase.value = 'forbidden'; return false }
    if (!vehicleId.value) { phase.value = 'empty'; return false }
    phase.value = 'loading'; failure.value = null
    try {
      const detail = await detailSource.detail(vehicleId.value, { permissions: permissionList(permissions) })
      if (!detail.vehicle) { phase.value = 'empty'; return false }
      vehicle.value = detail.vehicle
      version.value = detail.version
      phase.value = 'success'
      return true
    } catch (error) { capture(error, phase); return false }
  }

  async function runWrite(write) {
    if (!canEdit.value) { actionPhase.value = 'forbidden'; return false }
    actionPhase.value = 'submitting'; failure.value = null; conflict.value = false
    try {
      const result = await write()
      actionPhase.value = 'success'
      return result
    } catch (error) {
      if (error?.code === 'VERSION_CONFLICT') {
        actionPhase.value = 'conflict'
        failure.value = { code: 'VERSION_CONFLICT', requestId: error?.requestId || '' }
        await load(vehicleId.value)
        conflict.value = true
        return false
      }
      capture(error, actionPhase)
      return false
    }
  }

  function updateVehicle(fields) {
    return runWrite(async () => {
      const result = await source.updateVehicle({ vehicleId: vehicleId.value, expectedVersion: version.value, fields })
      version.value = result.version
      await load(vehicleId.value)
      return result
    })
  }

  function updateContact({ contactName, contactPhone }) {
    return runWrite(async () => {
      const result = await source.updateContact({ vehicleId: vehicleId.value, contactName, contactPhone })
      await load(vehicleId.value)
      return result
    })
  }

  async function replacePhoto({ slot, file }) {
    if (!canEdit.value) { actionPhase.value = 'forbidden'; return false }
    let base64Image
    try { base64Image = await fileBase64(file) } catch (error) { capture(error, actionPhase); return false }
    return runWrite(async () => {
      const result = await source.replacePhoto({ vehicleId: vehicleId.value, slot, base64Image, mimeType: file.type })
      await load(vehicleId.value)
      return result
    })
  }

  function cancelVehicle() {
    return runWrite(async () => {
      const result = await source.cancelVehicle({ vehicleId: vehicleId.value })
      cancelled.value = true
      return result
    })
  }

  return {
    phase, actionPhase, failure, vehicle, version, vehicleId, conflict, cancelled, canEdit,
    load, updateVehicle, updateContact, replacePhoto, cancelVehicle,
    retry: () => load(vehicleId.value),
  }
}