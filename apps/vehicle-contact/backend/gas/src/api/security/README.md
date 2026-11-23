# api/security (Blueprint layer)

Kept as a Blueprint-required location (`scripts/validate-ssot.mjs`). The former
`Policy.js` here was unreachable dead code and was removed in R1 (VC-ADR-028).

Where API security actually lives today:

- Per-call authorization: `api/controllers/OperationController.js` → `dispatch()` calls
  `sessions.authorize(token, permissions[op])` for every non-public operation (VC-ADR-023).
- Sessions, revocation and the role → permission catalog:
  `application/security/SessionService.js`.

The build only bundles `*.js`, so this file is not deployed to GAS.
