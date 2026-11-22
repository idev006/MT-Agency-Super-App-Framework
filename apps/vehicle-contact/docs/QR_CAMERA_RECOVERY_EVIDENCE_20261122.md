# P6 Vehicle Contact — QR Camera Recovery Evidence

**Date:** 2026-11-22 (Asia/Bangkok)

**Remote base:** `main` @ `ad7630e` (PR #111)

**Delivery:** PR **#112**, source commit **`d92e08c`**

**Scope:** Vue QR-camera adapter, lifecycle cleanup and offline engineering evidence only

## 1. Recovery and implementation

The protected stash documented in the handover was verified before use and applied to a new branch created from the freshly fetched remote `main`. The only conflicts were the historical Frontend `0.6.0` package markers; resolution retained the current **Frontend 0.8.0** marker and added the exact `html5-qrcode` **2.3.8** dependency. The stash remained protected while the recovered source was committed and pushed.

Delivered behavior:

- camera access starts only after an explicit user action and prefers the rear camera;
- the user can stop, switch facing mode, select a discovered camera or use a bounded JPEG/PNG/WebP fallback;
- only a strict 64-character hexadecimal token is forwarded to the existing protected `qr.resolve` flow;
- decoded values are not stored in URL, local storage, session storage or presentational state;
- camera/decoder cleanup runs on success, failure, switch, page hide, visibility loss and component teardown;
- adapter cleanup continues releasing remaining tracks even if an engine or one track reports an error;
- late asynchronous starts are rejected and cleaned instead of reactivating a disposed scanner.

No backend route, Worker allowlist, Sheet schema or retention behavior changed.

## 2. Executed evidence

| Gate | Result | Executed scope |
|---|---|---|
| Focused QR/resolve | **PASS — 16/16** | `vitest` over `qr-scanner.test.js` and `qr-resolve.test.js`; includes direct adapter cleanup, fault and stale-start cases. |
| Frontend regression | **PASS — 192/192** | 34 test files on Frontend 0.8.0. |
| Frontend build | **PASS** | Vite 8.3.8; 175 modules transformed using the Pages base path. |
| Dependency install/audit | **PASS** | Clean `npm ci`; exact decoder pin; `npm audit --audit-level=high` reported 0 vulnerabilities. |
| Repository/use-case SSOT | **PASS** | 0 errors, 0 link warnings; 20 use cases and 56/56 unique v1 operations. |
| Worker regression | **PASS — 31/31** | Offline gateway contract/security tests; no live Worker claim. |
| GAS offline check | **PASS** | Build and offline contract/security/persistence suites; no GAS push or publication. |
| Staged secret review | **PASS** | No credential-like literal found in the staged diff; no environment file committed. |

These are deterministic offline engineering checks. They do not prove physical camera compatibility, production scale, PDPA/security approval or business UAT.

## 3. Deployment and acceptance boundary

- **Source:** delivered through PR #112 from `d92e08c`; CI/merge evidence is recorded on the PR.
- **Deployment:** no GAS push, GAS source version, Web App publication, Worker deployment or manual Pages publication was performed in this slice. Normal Pages publication, if any, remains a separate workflow fact after merge.
- **Live API:** NOT RUN; this camera-only slice did not repeat the completed 97/97 live DEV suite.
- **Physical Android/iOS acceptance:** **OPEN / Owner-device gate**. Test camera permission, rear/front switching, decode, teardown/re-entry, image fallback and real sticker/glare conditions on named devices/browsers.
- **Release:** PDPA, security, browser/business UAT, production approval, applicable ADRs/decisions and credential rotation remain OPEN.

## 4. Residual Owner actions

1. Assign named Android and iOS reviewers/devices and record sanitized physical-camera evidence.
2. Confirm browser/business acceptance of the QR journey after the reviewed Pages deployment.
3. Keep production release and all human sign-offs OPEN until the production-readiness plan is satisfied.
