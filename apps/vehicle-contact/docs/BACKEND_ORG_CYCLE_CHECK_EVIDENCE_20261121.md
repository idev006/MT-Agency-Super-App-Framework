# B1 — Organization Ancestor Cycle Check (D-SEQ-08)

**Date:** 2026-11-21 | **Slice:** PM-PLAN WS-B / B1 | **Backend:** `0.9.0` (source)
**Type:** backend hardening / invariant completion. **No contract, permission, DTO, inventory, or Worker change** (reuses existing `INVALID_ORG_PARENT`).

## 1. Bug

`AdministrationOperations.updateOrg` rejected only two parent cases:
- self-parent (`parentId === organizationId`) → `INVALID_ORG_PARENT`
- missing parent → `PARENT_NOT_FOUND`

It did **not** reject arbitrary ancestor cycles. Example: `A → B → C` (C.parent=B, B.parent=A). Calling `organizations.update{organizationId:A, parentId:C}` was accepted, closing the loop `A → C → B → A`. A cyclic hierarchy breaks ancestor walks, org-scoped reporting, and any future parent-chain traversal (unbounded loop / stack overflow).

`createOrg` needs no cycle check: it allocates a fresh id with no existing children, so it cannot close a loop.

## 2. Fix

In `updateOrg`, when a non-empty `parentId` is supplied and exists, walk **up** the ancestor chain from the proposed parent. If the chain reaches the org being updated, reject `INVALID_ORG_PARENT`.

```
const byId = new Map(store.list('vc_organizations').map(o => [o.organization_id, o]));
const seen = new Set(); let cursor = p.parentId;
while (cursor && !seen.has(cursor)) {
  if (cursor === id) throw new Error('INVALID_ORG_PARENT');
  seen.add(cursor); cursor = byId.get(cursor)?.parent_id || '';
}
```

Design properties:
- **Single bounded snapshot** of `vc_organizations` (one table read, `byId` Map). **No cross-sheet join** — complies with the owner Sheets directive. Cost O(orgs), DEV-scale; flagged for the indexed-store plan (WS-E/E1).
- **`visited` Set** terminates the walk even if pre-existing corrupt data already contains a cycle unrelated to the target org (defensive; never infinite-loops).
- Reuses the existing safe error `INVALID_ORG_PARENT` → no error-catalog / DTO / permission / inventory / Worker allowlist change.
- Self-parent and missing-parent checks preserved (fast paths before the walk).
- `parentId` undefined (name-only update) skips the block entirely; parent unchanged.

Note: clearing a parent via `parentId:''` is rejected at the DTO layer (`'s'` kind requires non-empty string) — a pre-existing API limitation, unchanged by this slice.

## 3. Proof

`tests/org-hierarchy.test.mjs` (7 cases, real Router/Controller/UseCases + Sheets-shaped in-memory store):

| Case | Scenario | Expected |
|---|---|---|
| ORG-CYCLE-01 | self-parent | `INVALID_ORG_PARENT` |
| ORG-CYCLE-02 | 2-node cycle (A↔B) | `INVALID_ORG_PARENT`; parent not mutated |
| ORG-CYCLE-03 | 3-node cycle (A→C→B→A) | `INVALID_ORG_PARENT` |
| ORG-CYCLE-04 | valid re-parent under unrelated root | OK; parent updated |
| ORG-CYCLE-05 | missing parent | `PARENT_NOT_FOUND` |
| ORG-CYCLE-06 | attach below pre-existing unrelated cycle | OK; visited guard terminates |
| ORG-CYCLE-07 | name-only update | OK; parent preserved |

Result: **7/7 pass**. Full GAS suite **118/118 pass, 0 fail**; build green. Wired into `package.json` `test` script (runs in CI).

## 4. Best practice (team knowledge)

- **Hierarchy integrity is a server invariant.** Any parent-pointer table (orgs, categories, threads) must reject ancestor cycles on re-parent, not just self-parent. Client-supplied parent ids are never trusted to be acyclic.
- **Walk with a visited Set + single snapshot.** Bound the traversal; tolerate pre-existing corrupt cycles without hanging. Read one table into a Map — never join across Sheets tabs per row.
- **Complete the invariant, reuse the error.** Extending an existing guard (`INVALID_ORG_PARENT`) avoids contract surface churn (no DTO/inventory/Worker/count-gate edits) and keeps the change small and safe.

## 5. Delivery

- Source + tests merged to `main` via PR (CI green). GAS source push **batched** with other WS-B slices, gated on owner `PUSH_VEHICLE_GAS`; publication owner action; health-probe verifies.
- Tracked: [Project management plan](PROJECT_MANAGEMENT_PLAN_20261121.md) WS-B/B1; gap ref D-SEQ-08.