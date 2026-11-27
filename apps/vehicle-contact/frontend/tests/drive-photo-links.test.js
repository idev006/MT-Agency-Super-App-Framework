// VC-ADR-050 PR B: photos by Drive link — only the server's link shape is accepted; the review screen uses the link at once and
// falls back to the audited API when the image fails to load.
import { describe, it, expect, vi } from 'vitest'
import { DRIVE_IMAGE_URL, safeDriveImageUrl } from '../src/infrastructure/media/drive-image-url.js'
import { DRIVE_IMAGE_URL as SERVER_RULE, photoLinks } from '../../backend/gas/src/domain/policies/PhotoLayout.js'
import { mapVehicleResponse } from '../src/infrastructure/vehicles/gas-vehicle-search-repository.js'

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'
const links = photoLinks(ID, { thumbSide: 320, maxSide: 1600 })

describe('Drive photo links', () => {
  it('the web app accepts exactly the server rule (no drift)', () => {
    expect(DRIVE_IMAGE_URL.source).toBe(SERVER_RULE.source)
    expect(safeDriveImageUrl(links.thumbUrl)).toBe(links.thumbUrl)
    for (const bad of ['https://evil.example/x.jpg', 'javascript:alert(1)', `${links.thumbUrl}&x=1`, 'data:image/png;base64,AAAA', 42, null])
      expect(safeDriveImageUrl(bad)).toBe('')
  })

  it('vehicle photos keep the links; anything else becomes empty (the API path is used instead)', () => {
    const v = mapVehicleResponse({ vehicleId: 'v1', plate: 'กข1', province: 'TH-10', status: 'ACTIVE',
      photos: [{ photoId: 'p1', slot: 'FRONT', mimeType: 'image/jpeg', ...links }, { photoId: 'p2', slot: 'REAR', thumbUrl: 'https://evil.example/a', fullUrl: '' }] },
    new Set(['vehicle.photos.read']))
    expect(v.photos[0].thumbUrl).toBe(links.thumbUrl); expect(v.photos[0].fullUrl).toBe(links.fullUrl)
    expect(v.photos[1].thumbUrl).toBe(''); expect(v.photos[1].fullUrl).toBe('')
  })
})

describe('registration review photos', async () => {
  const { useRegistrationReview } = await import('../src/features/registrations/useRegistrationReview.js')
  it('shows the linked photo at once, and asks the API only after the link failed', async () => {
    const photo = vi.fn(async () => ({ photo: { photoId: 'p1', slot: 'FRONT', mimeType: 'image/png', base64Image: 'AAAA' } }))
    const source = {
      listPending: async () => ({ items: [], page: 1, pageSize: 50, total: 0 }),
      detail: async () => ({ registration: { requestId: 'r1', status: 'PENDING_APPROVAL', submittedAt: '',
        application: { photos: [{ photoId: 'p1', slot: 'FRONT', mimeType: 'image/png', ...links }] } } }),
      photo, review: async () => ({})
    }
    const work = useRegistrationReview({ repository: source, permissions: ['vehicle.registration.approve'] })
    await work.inspect('r1')
    await Promise.resolve()
    expect(work.photoStates.value.p1).toMatchObject({ status: 'ready', dataUrl: links.fullUrl, thumbUrl: links.thumbUrl, viaLink: true })
    expect(photo).not.toHaveBeenCalled()
    await work.photoFailed('p1')
    expect(photo).toHaveBeenCalledTimes(1)
    expect(work.photoStates.value.p1.dataUrl).toBe('data:image/png;base64,AAAA')
  })
})
