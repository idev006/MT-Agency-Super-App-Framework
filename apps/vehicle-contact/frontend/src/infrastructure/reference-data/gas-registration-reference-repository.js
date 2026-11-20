import { mapRegistrationReferences } from '../../application/reference-data/registration-reference-port.js'

export function createGasRegistrationReferenceRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')
  return Object.freeze({
    async load() {
      const response = await callOperation('references.registration', {})
      return mapRegistrationReferences(response.data, response.requestId)
    },
  })
}
