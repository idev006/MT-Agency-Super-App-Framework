# Testing and Deployment Standard
Per app: reproducible install, lint, build, unit tests for use cases/domain, API adapter integration tests and critical-path E2E. CI before merge; deployment to staging before production; environment isolation, approved secrets and rollback. Verify real Android/iOS camera behavior when relevant (permission, decode, switching, cleanup). GitHub Pages is static frontend hosting only. Do not mark tests passed without evidence.


Business-critical workflows MUST use the [Use Case & Sequence Diagram Standard](USE_CASE_SEQUENCE_STANDARD.md) with a traceability/acceptance gate before FE↔BE integration. Source/diagram validation is not a real staging test; attach deployment and actual E2E evidence before signing off.
