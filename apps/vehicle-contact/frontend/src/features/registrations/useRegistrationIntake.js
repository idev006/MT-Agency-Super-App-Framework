import { computed, ref, unref } from 'vue'
import { assertRegistrationIntakeRepository } from '../../application/registrations/registration-intake-port.js'

export const REGISTRATION_PHOTO_SLOTS = Object.freeze([
  { id: 'FRONT', label: 'ด้านหน้า' }, { id: 'REAR', label: 'ด้านหลัง' },
  { id: 'LEFT', label: 'ด้านซ้าย' }, { id: 'RIGHT', label: 'ด้านขวา' },
  { id: 'FRONT_ANGLE', label: 'มุมเฉียงด้านหน้า' },
])
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_FILE_BYTES = 5_000_000
const UNCERTAIN = new Set(['TIMEOUT', 'NETWORK_ERROR'])

// R4: checked when the photo is picked, so the user learns at once (same rules as upload).
export function imageFileProblem(file) {
  if (!file) return 'ยังไม่ได้เลือกภาพ'
  if (!ALLOWED_MIME.has(file.type)) return 'รองรับเฉพาะ JPEG, PNG หรือ WebP'
  if (file.size < 1 || file.size > MAX_FILE_BYTES) return 'ขนาดภาพต้องไม่เกิน 5 MB'
  return ''
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

export function useRegistrationIntake({ repository, permissions }) {
  const source = assertRegistrationIntakeRepository(repository)
  const phase = ref('idle')
  const failure = ref(null)
  const campaign = ref(null)
  const uploaded = ref({})
  const result = ref(null)
  const idempotencyKey = ref('')
  // R4: the exact submission behind the current idempotency key. After an uncertain outcome the
  // only safe action is to resend THIS payload with THIS key: the backend replays the committed
  // winner, while a changed payload under the same key is refused (IDEMPOTENCY_CONFLICT).
  const lastSubmission = ref(null)
  const locked = computed(() => phase.value === 'uncertain')
  const canReceive = computed(() => {
    const values = Array.isArray(unref(permissions)) ? unref(permissions) : []
    return values.includes('vehicle.registration.approve')
  })

  function capture(error, write = false) {
    failure.value = { code: error?.code || 'UNEXPECTED_ERROR', requestId: error?.requestId || '' }
    phase.value = error?.code === 'FORBIDDEN' ? 'forbidden'
      : error?.code === 'UNAUTHENTICATED' ? 'unauthenticated'
        : write && UNCERTAIN.has(error?.code) ? 'uncertain' : 'error'
  }

  async function validateCampaign(campaignToken) {
    phase.value = 'validating'; failure.value = null; campaign.value = null
    try { campaign.value = { ...(await source.validateCampaign(campaignToken)), token: campaignToken }; phase.value = 'ready'; return true }
    catch (error) { capture(error); return false }
  }

  async function submit({ campaignToken, fields, files }) {
    if (!canReceive.value) { phase.value = 'forbidden'; return false }
    result.value = null; failure.value = null
    lastSubmission.value = { campaignToken, fields: { ...fields }, files: { ...files } }
    try {
      if (!campaign.value?.valid || campaign.value.token !== campaignToken) {
        campaign.value = { ...(await source.validateCampaign(campaignToken)), token: campaignToken }
      }
      phase.value = 'uploading'
      for (const slot of REGISTRATION_PHOTO_SLOTS) {
        if (uploaded.value[slot.id]?.file === files[slot.id]) continue
        const base64Image = await fileBase64(files[slot.id])
        const photo = await source.uploadPhoto({ campaignToken, slot: slot.id, base64Image, mimeType: files[slot.id].type })
        uploaded.value = { ...uploaded.value, [slot.id]: { file: files[slot.id], photoId: photo.photoId } }
      }
      phase.value = 'submitting'
      if (!idempotencyKey.value) idempotencyKey.value = globalThis.crypto?.randomUUID?.() || `web-${Date.now()}`
      result.value = await source.submit({
        campaignToken, ...fields,
        photos: REGISTRATION_PHOTO_SLOTS.map((slot) => ({ slot: slot.id, photoId: uploaded.value[slot.id].photoId })),
        idempotencyKey: idempotencyKey.value,
      })
      phase.value = 'success'; uploaded.value = {}; idempotencyKey.value = ''; lastSubmission.value = null
      return true
    } catch (error) { capture(error, ['uploading', 'submitting'].includes(phase.value)); return false }
  }

  async function retrySame() {
    if (!lastSubmission.value || !idempotencyKey.value) return false
    const { campaignToken, fields, files } = lastSubmission.value
    return submit({ campaignToken, fields, files })
  }

  return { phase, failure, campaign, uploaded, result, canReceive, locked, validateCampaign, submit, retrySame,
    // keepCampaign: "next vehicle, same campaign" skips a second validation round trip.
    reset: ({ keepCampaign = false } = {}) => { phase.value = keepCampaign && campaign.value?.valid ? 'ready' : 'idle'; failure.value = null; if (!keepCampaign) campaign.value = null; uploaded.value = {}; result.value = null; idempotencyKey.value = ''; lastSubmission.value = null } }
}
