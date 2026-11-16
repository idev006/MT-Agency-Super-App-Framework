# Central Authorization Model — Proposed v0.1

## Concept
**Authentication** answers who the user is. **Application access** answers which apps may open. **Permission + scope** answers what they may do to which resources. Login alone grants no app access.

### Data entities
- auth.users / profiles (immutable platform user ID)
- organizations (hierarchy and organization scope)
- applications (app_id, owner, status, routes, deployment type)
- permissions (app_id, permission_key)
- roles (app_id, role_key)
- role_permissions (role_id, permission_id)
- user_role_assignments (user_id, role_id, scope_type, scope_id, valid_from, valid_until, status, granted_by, approval_id)
- delegated_administrators (app_id, user_id, permitted scopes/actions)
- grant_requests / approvals
- audit_logs (actor, target, action, before/after, timestamp, correlation ID)

Application ownership constraints MUST ensure a role cannot reference permissions of another app. A grant MUST not exceed grantor's delegated app/scope or approval policy.

### Policy decision
allow = authenticated && account_active && app_active && app_access_granted && permission_granted && scope_matches && contextual_policy_allows

Default: DENY.

### Example
- Person U001: vehicle-qr / VIEWER / agency-wide
- Person U001: vehicle-qr / ADMIN / one subunit
- Person U001: meeting-room / USER / same subunit
- Person U001: dashboard-191 / no grant → access denied

### Responsibility
- Platform Admin registers apps, delegates administrators.
- App Admin defines app roles and maps permitted app-owned permissions, subject to governance.
- Delegated App/Unit Admin assigns approved roles only inside delegated scopes.
- Approver signs off sensitive grants where required.
- App API and RLS enforce the decision server-side, not based solely on client claims.
- Every grant, revoke, and privilege modification is logged.

### Security invariants
- No self-elevation; no cross-app assignment by app admins.
- Sensitive actions must check fresh authorization rather than relying only on stale JWT.
- Session termination and access revocation are distinct controls.
- Never trust role/user_id values supplied by the frontend without verifying the authenticated caller.
- Authorization and data scope are tested with negative cases.
