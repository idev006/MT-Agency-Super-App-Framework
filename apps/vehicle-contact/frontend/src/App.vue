<script setup>
import { provide, watch } from 'vue'
import { RouterView } from 'vue-router'
import { accountSecurityRepositoryKey } from './application/auth/account-security-port.js'
import { auditRepositoryKey } from './application/audit/audit-port.js'
import { campaignAdministrationRepositoryKey } from './application/campaigns/campaign-administration-port.js'
import { organizationAdministrationRepositoryKey } from './application/organizations/organization-administration-port.js'
import { qrGovernanceRepositoryKey } from './application/qr/qr-governance-port.js'
import { retentionRepositoryKey } from './application/retention/retention-port.js'
import { registrationReviewRepositoryKey } from './application/registrations/registration-review-port.js'
import { registrationIntakeRepositoryKey } from './application/registrations/registration-intake-port.js'
import { registrationReferenceRepositoryKey } from './application/reference-data/registration-reference-port.js'
import { systemSettingsRepositoryKey } from './application/settings/system-settings-port.js'
import { vehicleSearchRepositoryKey } from './application/vehicles/vehicle-search-port.js'
import { vehicleDetailRepositoryKey } from './application/vehicles/vehicle-detail-port.js'
import { changeReviewRepositoryKey } from './application/vehicles/change-review-port.js'
import { myVehiclesRepositoryKey } from './application/vehicles/my-vehicles-port.js'
import { vehicleRegistryRepositoryKey } from './application/vehicles/vehicle-registry-port.js'
import { vehicleMaintenanceRepositoryKey } from './application/vehicles/vehicle-maintenance-port.js'
import { qrResolveRepositoryKey } from './application/vehicles/qr-resolve-port.js'
import { qrScannerKey } from './application/scanner/qr-scanner-port.js'
import { userDirectoryRepositoryKey } from './application/users/user-directory-port.js'
import { createGasVehicleSearchRepository } from './infrastructure/vehicles/gas-vehicle-search-repository.js'
import { createGasVehicleDetailRepository } from './infrastructure/vehicles/gas-vehicle-detail-repository.js'
import { createGasChangeReviewRepository } from './infrastructure/vehicles/gas-change-review-repository.js'
import { createGasMyVehiclesRepository } from './infrastructure/vehicles/gas-my-vehicles-repository.js'
import { createGasVehicleRegistryRepository } from './infrastructure/vehicles/gas-vehicle-registry-repository.js'
import { createGasVehicleMaintenanceRepository } from './infrastructure/vehicles/gas-vehicle-maintenance-repository.js'
import { createGasQrResolveRepository } from './infrastructure/vehicles/gas-qr-resolve-repository.js'
import { createHtml5QrCodeScannerAdapter } from './infrastructure/scanner/html5-qrcode-scanner-adapter.js'
import { createGasUserDirectoryRepository } from './infrastructure/users/gas-user-directory-repository.js'
import { createGasAccountSecurityRepository } from './infrastructure/auth/gas-account-security-repository.js'
import { createGasAuditRepository } from './infrastructure/audit/gas-audit-repository.js'
import { createGasCampaignAdministrationRepository } from './infrastructure/campaigns/gas-campaign-administration-repository.js'
import { createGasOrganizationAdministrationRepository } from './infrastructure/organizations/gas-organization-administration-repository.js'
import { createGasQrGovernanceRepository } from './infrastructure/qr/gas-qr-governance-repository.js'
import { createGasRetentionRepository } from './infrastructure/retention/gas-retention-repository.js'
import { createGasRegistrationReviewRepository } from './infrastructure/registrations/gas-registration-review-repository.js'
import { createGasRegistrationIntakeRepository } from './infrastructure/registrations/gas-registration-intake-repository.js'
import { createGasRegistrationReferenceRepository } from './infrastructure/reference-data/gas-registration-reference-repository.js'
import { createGasSystemSettingsRepository } from './infrastructure/settings/gas-system-settings-repository.js'
import { useSessionStore } from './stores/session.js'
import { useRegistrationReferenceStore } from './stores/registration-reference.js'
import { useUiStore } from './stores/ui.js'
useUiStore()
const session = useSessionStore()
const referenceData = useRegistrationReferenceStore()
const registrationReferenceRepository = createGasRegistrationReferenceRepository({ callOperation: session.callProtected })
referenceData.configure(registrationReferenceRepository)
provide(registrationReferenceRepositoryKey, registrationReferenceRepository)
watch(
  () => [session.authenticated, session.sessionVerified, session.session?.userId, session.transport, session.endpoint],
  ([authenticated, verified, userId, transport, endpoint]) => {
    if (!authenticated) { referenceData.clear(); return }
    if (!verified || !userId) return
    referenceData.ensureLoaded({ userId, transport, endpoint }).catch(() => {})
  },
  { immediate: true },
)
provide(vehicleSearchRepositoryKey, createGasVehicleSearchRepository({
  callOperation: session.callProtected,
}))
provide(vehicleDetailRepositoryKey, createGasVehicleDetailRepository({ callOperation: session.callProtected }))
provide(changeReviewRepositoryKey, createGasChangeReviewRepository({ callOperation: session.callProtected }))
provide(myVehiclesRepositoryKey, createGasMyVehiclesRepository({ callOperation: session.callProtected }))
provide(vehicleRegistryRepositoryKey, createGasVehicleRegistryRepository({ callOperation: session.callProtected }))
provide(vehicleMaintenanceRepositoryKey, createGasVehicleMaintenanceRepository({ callOperation: session.callProtected }))
provide(qrResolveRepositoryKey, createGasQrResolveRepository({
  callOperation: session.callProtected,
}))
provide(qrScannerKey, createHtml5QrCodeScannerAdapter())
provide(userDirectoryRepositoryKey, createGasUserDirectoryRepository({
  callOperation: session.callProtected,
}))
provide(accountSecurityRepositoryKey, createGasAccountSecurityRepository({ callOperation: session.callProtected }))
provide(organizationAdministrationRepositoryKey, createGasOrganizationAdministrationRepository({ callOperation: session.callProtected }))
provide(campaignAdministrationRepositoryKey, createGasCampaignAdministrationRepository({ callOperation: session.callProtected }))
provide(systemSettingsRepositoryKey, createGasSystemSettingsRepository({ callOperation: session.callProtected }))
provide(qrGovernanceRepositoryKey, createGasQrGovernanceRepository({ callOperation: session.callProtected }))
provide(retentionRepositoryKey, createGasRetentionRepository({ callOperation: session.callProtected }))
provide(registrationReviewRepositoryKey, createGasRegistrationReviewRepository({ callOperation: session.callProtected }))
provide(registrationIntakeRepositoryKey, createGasRegistrationIntakeRepository({ callPublicOperation: session.callPublic }))
provide(auditRepositoryKey, createGasAuditRepository({ callOperation: session.callProtected }))
</script>
<template><RouterView /></template>
