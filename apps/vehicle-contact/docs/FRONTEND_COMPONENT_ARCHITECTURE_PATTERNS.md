# P6 Vehicle Contact — Component Architecture and Design Patterns

**Document ID:** P6VC-FE-PATTERN-001

**Status:** REQUIRED PATTERN CATALOG

**Version:** 1.0 — 2026-11-18

## 1. Core rule: composition over inheritance

Vue components MUST NOT inherit feature behavior or UI from other page components using `extends`, prototype/class inheritance or application mixins. Shared structure uses slots. Shared behavior uses composables. Shared state uses a deliberately scoped store. Shared external access uses ports/adapters.

```text
Reuse structure → component + slots
Reuse behavior  → composable
Reuse state     → local owner or scoped Pinia store
Reuse policy    → pure domain function or policy wrapper
Replace service → interface/port + adapter or provide/inject
```

## 2. Pattern catalog

### 2.1 Slot-based Template Method

**Use when:** every page requires the same information hierarchy but different content

`PageTemplateComponent` owns ordering, spacing and responsive placement. Pages fill named slots.

```vue
<PageTemplateComponent>
  <template #header>
    <PageHeader title="ค้นหายานพาหนะ" />
  </template>
  <template #context>
    <OperationalContextStrip />
  </template>
  <template #toolbar>
    <VehicleSearchFilters />
  </template>
  <VehicleSearchResults />
</PageTemplateComponent>
```

**Must:** template remains presentation-only

**Must not:** template reads feature stores, calls API or displays architecture explanations

### 2.2 Container/Presentational separation

**Use when:** feature requires data orchestration and reusable UI

```text
VehicleSearchPage             # container/orchestrator
├─ useVehicleSearch()         # behavior/state
├─ VehicleSearchForm          # presentation + local input
├─ VehicleSearchSummary       # presentation
└─ VehicleSearchResults       # presentation
```

Presentational components receive serializable props and emit domain-named events They MUST NOT know endpoint URLs, session tokens or GAS envelope shape

### 2.3 Composable

**Use when:** reusable reactive behavior has lifecycle or Vue reactivity

Examples:

- `useAsyncOperation()`
- `usePagination()`
- `usePermission()`
- `useConfirmation()`
- `useSupportDetails()`

Composable names MUST start with `use` It MUST return a small explicit public contract and clean up listeners/timers on unmount It SHOULD accept dependencies as arguments instead of importing a global singleton invisibly

Do not create composables that merely rename a store or return an unstructured object containing an entire feature

### 2.4 Adapter and Repository

**Use when:** external API/storage format must not leak into feature code

```js
export function createVehicleRepository({ apiClient }) {
  return {
    async search(criteria, options) {
      const response = await apiClient.call('vehicles.lookup', criteria, options)
      return mapVehicleSearchResult(response.data)
    },
  }
}
```

Adapter maps transport shape Repository exposes domain-oriented operations Feature code MUST NOT call `fetch`, construct URL or parse canonical envelopes

### 2.5 Strategy and Registry

**Use when:** available navigation, dashboard emphasis or presentation varies by permission

```js
const capabilityRegistry = Object.freeze([
  {
    id: 'vehicle-search',
    route: 'vehicle-search',
    label: 'ค้นหายานพาหนะ',
    permissionsAny: ['vehicle.lookup'],
  },
])
```

Registry MUST use permissions returned by GAS A strategy MAY change presentation or workflow selection It MUST NOT manufacture authorization or bypass backend denial

### 2.6 Policy Wrapper

**Use when:** a consistent UI policy surrounds arbitrary content

Examples:

- `PermissionGate`
- `AsyncBoundary`
- `SensitiveValue`
- `FeatureUnavailable`

```vue
<AsyncBoundary :state="searchState" @retry="retrySearch">
  <VehicleSearchResults :items="items" />
</AsyncBoundary>
```

Wrapper MUST expose explicit props/events and accessible fallback Wrapper MUST NOT swallow errors silently or be described as a security boundary

### 2.7 Explicit async state machine

**Use when:** data has multiple meaningful states or a write flow

```js
const phase = ref('idle')

async function run() {
  phase.value = 'loading'
  try {
    const result = await service.execute()
    phase.value = result.items.length ? 'success' : 'empty'
  } catch (error) {
    phase.value = mapErrorPhase(error)
  }
}
```

Allowed transitions SHOULD be tested Write state machines SHOULD include confirmation, submitting, success, rejected and uncertain/timeout states

### 2.8 Pinia Facade

**Use when:** state is shared across unrelated component branches or survives route changes

Store exposes domain actions/getters and hides persistence details

```js
const canSearchVehicles = computed(() => permissions.value.includes('vehicle.lookup'))
```

Store MUST NOT expose raw storage adapters, fetch client or mutable backend response as its public API Feature-local state SHOULD remain local/composable

### 2.9 Dependency Injection with Symbol keys

**Use when:** a stable replaceable service is needed across a descendant tree or tests

```js
export const vehicleRepositoryKey = Symbol('vehicleRepository')
```

Provide/inject MUST use exported Symbol keys. Dependencies MUST be provided at composition root or bounded feature provider. Injection MUST NOT replace clear props for ordinary parent-child data flow.

### 2.10 Faceted component/compound component

**Use when:** a complex component has coordinated subparts such as responsive data table, filter bar or evidence viewer

```text
DataView
├─ DataViewToolbar
├─ DataViewTable
├─ DataViewMobileList
├─ DataViewPagination
└─ DataViewEmpty
```

Subcomponents share a documented context only when props/events would create excessive plumbing The public contract MUST remain explicit and testable

### 2.11 Error Boundary

**Use when:** a subtree failure must not destroy the entire shell

Vue `onErrorCaptured` MAY isolate rendering failures at route/feature boundaries It MUST report a sanitized error category and render a recovery path It MUST NOT expose stack traces or suppress programmer errors from tests/observability

## 3. Role composition model

Do not create inheritance such as:

```text
BaseDashboard
├─ StaffDashboard extends BaseDashboard
├─ AdminDashboard extends BaseDashboard
└─ OwnerDashboard extends BaseDashboard
```

Use capability composition:

```text
DashboardPage
├─ shared operational context
├─ capability registry filtered by GAS permissions
├─ queue summary components available to the user
└─ role-aware ordering/copy strategy
```

One user with multiple roles receives one coherent dashboard and permission union, not multiple competing shells

## 4. Component contract template

Every shared/feature component SHOULD document:

```text
Purpose:
Layer/category:
Props:
Events:
Slots:
Provided/injected dependencies:
States:
Keyboard behavior:
Responsive behavior:
Theme behavior:
Sensitive-data handling:
Tests:
```

## 5. Naming standard

| Artifact | Convention | Example |
|---|---|---|
| Routed page | `<Domain><Job>Page.vue` | `VehicleSearchPage.vue` |
| Shared UI | semantic noun | `EmptyState.vue` |
| Feature component | domain + responsibility | `RegistrationDecisionPanel.vue` |
| Composable | `use` + capability | `useVehicleSearch.js` |
| Pinia store | `use` + domain + `Store` | `useSessionStore.js` |
| Repository | domain + `Repository` | `vehicleRepository.js` |
| Adapter/client | target + responsibility | `gasApiClient.js` |
| Registry | domain + `Registry` | `capabilityRegistry.js` |
| Pure policy | descriptive verb/noun | `canRevealContact.js` |

Avoid generic names such as `Common`, `Helper`, `Util`, `Manager`, `DataComponent` or `BasePage`

## 6. Dependency and import rules

- UI primitives MUST NOT import page, store, router or infrastructure
- Domain MUST NOT import Vue, browser APIs or infrastructure
- Feature components MUST NOT import low-level API client
- Page MAY import feature public entry points but SHOULD NOT reach into feature internals
- Feature-to-feature import requires an explicit shared abstraction or architecture review
- Circular dependencies are prohibited
- Imports SHOULD use stable public entry points when feature folders grow

## 7. Patterns intentionally rejected

| Pattern | Status | Reason |
|---|---|---|
| Vue `extends` | Prohibited | Inheritance coupling and unclear overrides |
| Mixins/global mixins | Prohibited | Hidden dependencies and naming collisions |
| Service locator | Prohibited | Dependencies invisible to tests and callers |
| Event bus for business flow | Prohibited | Untraceable state and lifecycle leaks |
| God component/page | Prohibited | Mixed concerns and untestable states |
| Boolean explosion | Prohibited | Contradictory states such as loading + error + success |
| Copy-per-role pages | Prohibited | Design/behavior drift and multi-role failure |
| Frontend role authorization | Prohibited | Client is not authoritative |
| Arbitrary wrapper nesting | Discouraged | Obscures hierarchy; prefer explicit component contract |

## 8. Enforcement tests

CI SHOULD add static checks for:

- no `extends:` or `mixins:` in application Vue source
- no raw `fetch(` outside approved infrastructure adapter
- no low-level client import from `.vue`
- every route page uses the page-template contract
- protected route declares permission metadata
- capability registry entries declare permissions
- no role equality used as a grant in feature components
- no arbitrary production colors outside approved design-token files
- no circular imports

Contract tests SHOULD verify named slots, required props/events, async states, keyboard behavior and permission fixtures

## 9. Pattern selection decision tree

```text
Need shared visual structure?      → component + slots
Need shared reactive behavior?     → composable
Need shared cross-route state?     → scoped Pinia store
Need external API/storage access?  → port + adapter/repository
Need variation by permission?      → strategy/registry
Need consistent surrounding state? → policy wrapper
Need replaceable deep dependency?  → Symbol provide/inject
Need complex coordinated widget?   → compound component
Need failure isolation?            → route/feature error boundary
```
