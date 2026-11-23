# Vehicle Contact — GAS Phase 1 Security & Privacy Release Gate

**Last updated (git):** 2026-11-17 · **Current state:** [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md)

**Status:** BLOCKED FOR PROTECTED DATA OPERATIONS.

- Phase 1 sign-in is Username/Password; MT-I-AM deferred. Authentication must be server-side with approved password hashing/session handling and action-level authorization.
- The first GAS scaffold exposes only a non-sensitive health response; protected business operations deliberately return unavailable/no route.
- **Critical:** A gateway alone does not protect an owner-executed publicly callable GAS Web App if callers can invoke the URL directly. Require verified non-bypassable control or choose another service architecture; explicit negative test required.
- No plaintext passwords, API keys, service credentials, private data, phone numbers, QR identifiers or operational tokens in public GitHub, sheet names or diagnostic responses.
- The Drive spreadsheet must stay private and least privileged. Anyone-link access and guest editor roles require separate security review.
- Owner, role policy, data retention, privacy notice, lawful basis, incident/audit access and secure photo storage are not approved. See project PDPA files and unresolved decisions in [Decision Log](DECISION_LOG.md).
- Production/real-person-data release requires evidence for anonymous/direct-URL bypass, account lockout/rate limit, unauthorized resource enumeration, secret protection, audit redaction and data deletion.

**No security certification or PII processing authorization has been issued by creating this source or spreadsheet.**
