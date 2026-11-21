# B4 — Login Constant-Work Negative Path (D-SEQ-11)

**Date:** 2026-11-21 | **Slice:** PM-PLAN WS-B / B4 | **Backend:** `0.9.0` (source)
**Type:** security hardening (timing side-channel). **No contract, permission, DTO, inventory, or Worker change.**

## 1. Bug

`IdentityOperations.login` guarded credentials with a short-circuit OR:

```
if (!user || user.status !== 'ACTIVE' || !security.verifyPassword(p.password, user.password_hash)) { ... INVALID_CREDENTIALS }
```

For an **unknown username** (`!user` true) or an **inactive user**, JavaScript short-circuits and `security.verifyPassword` is **never called**. `verifyPassword` runs PBKDF2-HMAC-SHA256 at **150 000 rounds** (tens of ms); skipping it makes the unknown/inactive path return measurably faster than the known-user-wrong-password path. The existing comment "Never reveal whether username exists" covered only the error **message**, not the **timing**. An attacker can enumerate valid usernames by response latency despite identical `INVALID_CREDENTIALS` messages and the 6-attempt rate limit.

## 2. Fix

Always perform exactly one password verification, against a **real-cost dummy hash** when the user is unknown or inactive:

```
const DUMMY_PASSWORD_HASH = 'pbkdf2-sha256$150000$' + '0'.repeat(32) + '$' + '0'.repeat(64); // module scope
...
const active = !!user && user.status === 'ACTIVE';
const verified = security.verifyPassword(p.password, active ? user.password_hash : DUMMY_PASSWORD_HASH);
if (!active || !verified) { recordAttempt(digest, 'FAILED'); throw new Error('INVALID_CREDENTIALS'); }
```

Design properties:
- The dummy is a **valid-format** hash (`pbkdf2-sha256$<rounds>$<32-hex salt>$<64-hex digest>`) with the **same 150 000 rounds** as `GasSecurity.hashPassword`, so `verifyPassword` performs the full PBKDF2 computation and returns false — equal work for every path.
- **Static module-level string** (no hashing at construction): zero added per-request cost. The controller/use-cases are built per dispatch, so computing a real hash here would have taxed every API call; a literal avoids that.
- Verification is **unconditional** (one call whether the user exists, is inactive, or the password is wrong/right). Rate limiting, audit events, and the uniform `INVALID_CREDENTIALS` message are unchanged.
- **Drift guard:** a test asserts the dummy's round count equals the `iterations=` literal in `GasSecurity.hashPassword`, so a future cost change fails CI rather than silently re-opening the oracle.

## 3. Proof

`tests/login-constant-work.test.mjs` (5 cases; spy counts `verifyPassword` invocations and captures the stored hash):

| Case | Scenario | Expected |
|---|---|---|
| LOGIN-CONST-01 | unknown username | `INVALID_CREDENTIALS`; **1** verify call; stored = real-cost dummy |
| LOGIN-CONST-02 | known user, wrong password | `INVALID_CREDENTIALS`; **1** verify call; stored = user hash |
| LOGIN-CONST-03 | suspended user, correct password | `INVALID_CREDENTIALS`; **1** verify call; stored = dummy |
| LOGIN-CONST-04 | valid credentials | success; **1** verify call |
| LOGIN-CONST-05 | dummy cost vs `GasSecurity` source | rounds equal (drift guard) |

Result: **5/5 pass**. Full GAS suite **123/123 pass, 0 fail**; build green. Wired into `package.json` `test` script (CI).

Note: the acceptance harness uses a comparison-only `verifyPassword` fake, so the test asserts the **call-count invariant** (always exactly one verification) plus the dummy's production cost format, rather than fragile wall-clock timing. In production the real `GasSecurity.verifyPassword` does 150 000 PBKDF2 rounds for both the real and dummy hashes, equalizing latency.

## 4. Best practice (team knowledge)

- **Authentication must be constant-work on the negative path.** Any branch that skips the password hash for unknown/inactive accounts creates a username-enumeration timing oracle, even when error messages are uniform. Always verify against a same-cost dummy.
- **Match the dummy to the real KDF cost and guard the coupling.** A dummy with too-few rounds (or a malformed hash that early-returns) re-opens the oracle. Pin the round count to the hasher and add a CI drift guard.
- **Keep the dummy static.** Build it once at module scope; never call the real hasher per request to fabricate a dummy.
- **Test the invariant, not the clock.** Assert "exactly one verification regardless of account state" with a spy — deterministic across machines, unlike latency assertions.

## 5. Delivery

- Source + tests merged to `main` via PR (CI green). GAS source push **batched** with WS-B slices, gated on owner `PUSH_VEHICLE_GAS`; publication owner action.
- Tracked: [Project management plan](PROJECT_MANAGEMENT_PLAN_20261121.md) WS-B/B4; gap ref D-SEQ-11.