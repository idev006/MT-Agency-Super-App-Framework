# API Integration Standard
Client flow: **View → use case → domain port → adapter → HTTP client / provider SDK**. Standardize timeouts, AbortSignal, request IDs, typed errors, DTO mapping and auth transport. Support authorized REST, GraphQL, GAS, Supabase, FastAPI and other providers through independent adapters. Retry only safe/idempotent requests with bounded backoff. Secrets and prohibited CORS paths require trusted server gateway; never expose privileged keys in frontend. Each adapter needs contract/integration tests.

GAS backend implementations MUST follow the [Master GAS Backend API Blueprint](../MASTER_GAS_BACKEND_API_BLUEPRINT.md). Browser adapters are not substitutes for trusted server-side authentication and authorization.

Backend persistence selection is per application: GAS may access Google Sheets, SQL/NoSQL services or file/object storage through validated, supported adapters and authenticated interfaces. The GAS blueprint forbids coupling business logic to a storage provider; network/runtime support must be verified rather than assumed.

For client-serving GAS backends, the GAS Master Blueprint v1.2.0 requires a dedicated API Layer between `doGet/doPost` and Application Use Cases, with versioned routing, controllers, DTO validation, verified authorization and response/error mapping. GAS entrypoints are thin runtime bridges, not API controllers or business services.
