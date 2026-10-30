# Project Charter — Proposed v0.1

## Problem
Separate applications create fragmented login experiences and inconsistent authorization. Supervisors need fast vehicle identification and parking authorization, while future agency applications need shared platform services.

## Mission
Build a modular, mobile-first agency portal where users sign in once within the supported session context and access only applications and operations explicitly granted to them.

## Users and governance
- Platform administrator: register apps and delegate app administrators; not automatically authorized to approve operational actions.
- App administrator: manage roles and assignments within delegated application and scope.
- Unit administrator: manage delegated organizational scope only.
- End user: access only authorized functions.
- Appropriate organizational approver: approve sensitive or privileged grants as defined by policy.

## MVP
1. Identity + login + user onboarding.
2. App registry and My Apps portal.
3. Roles, permissions, scopes, assignments, revocation and auditing.
4. Vehicle QR reference application with mobile scanner and manual plate lookup.
5. Second app onboarding test without rewriting authentication.

## Non-goals for MVP
- Full automated CCTV/ANPR deployment.
- Automatically integrating arbitrary untrusted apps.
- Guaranteeing shared sessions between LINE in-app browser and external browsers.
- Using QR possession alone as authorization.

## Success criteria
- Unauthorized applications and API calls are denied server-side.
- User can have distinct roles in distinct applications and multiple scoped roles per application.
- Role revocation is enforced for sensitive operations without relying only on stale JWT claims.
- Adding a compatible new internal app does not change the identity core.
- Vehicle QR works on tested Android/iOS devices with fallback lookup.
