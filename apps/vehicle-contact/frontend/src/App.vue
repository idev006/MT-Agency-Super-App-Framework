<script setup>
import { provide } from 'vue'
import { RouterView } from 'vue-router'
import { vehicleSearchRepositoryKey } from './application/vehicles/vehicle-search-port.js'
import { userDirectoryRepositoryKey } from './application/users/user-directory-port.js'
import { createGasVehicleSearchRepository } from './infrastructure/vehicles/gas-vehicle-search-repository.js'
import { createGasUserDirectoryRepository } from './infrastructure/users/gas-user-directory-repository.js'
import { useSessionStore } from './stores/session.js'
import { useUiStore } from './stores/ui.js'
useUiStore()
const session = useSessionStore()
provide(vehicleSearchRepositoryKey, createGasVehicleSearchRepository({
  callOperation: session.callProtected,
}))
provide(userDirectoryRepositoryKey, createGasUserDirectoryRepository({
  callOperation: session.callProtected,
}))
</script>
<template><RouterView /></template>
