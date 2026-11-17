# Application Structure
All apps belong to `apps/<app-id>/`: `README.md`, `docs/`, `src/presentation/`, `src/application/`, `src/domain/`, `src/infrastructure/`, `tests/`, `public/`, `package.json`, `vite.config.js`. Project documents remain in app `docs/`; global rules live only in `blueprint/`. Shared, app-neutral code goes in `packages/`. Never keep duplicate application source in `docs/`; publish generated artifacts via GitHub Actions Pages. Maintain legacy URL redirects only inside the disposable deploy artifact. Reference blueprint version from app README.

If an app implements GAS backend/API code, it MUST place its canonical source under `apps/<app-id>/backend/gas/` and follow [Master GAS Backend API Blueprint](../MASTER_GAS_BACKEND_API_BLUEPRINT.md); all app-specific API contracts and test evidence belong in `apps/<app-id>/docs/`.

Client-serving GAS backends MUST include `backend/gas/src/api/{routes,controllers,dto,security,responses}/` between `entrypoints/` and `application/` per [GAS Master Blueprint](../MASTER_GAS_BACKEND_API_BLUEPRINT.md). No provider calls inside API controllers; storage and outbound API access belong in infrastructure adapters.
