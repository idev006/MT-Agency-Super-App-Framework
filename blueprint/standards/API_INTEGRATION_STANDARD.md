# API Integration Standard
Client flow: **View → use case → domain port → adapter → HTTP client / provider SDK**. Standardize timeouts, AbortSignal, request IDs, typed errors, DTO mapping and auth transport. Support authorized REST, GraphQL, GAS, Supabase, FastAPI and other providers through independent adapters. Retry only safe/idempotent requests with bounded backoff. Secrets and prohibited CORS paths require trusted server gateway; never expose privileged keys in frontend. Each adapter needs contract/integration tests.

GAS backend implementations MUST follow the [Master GAS Backend API Blueprint](../MASTER_GAS_BACKEND_API_BLUEPRINT.md). Browser adapters are not substitutes for trusted server-side authentication and authorization.
