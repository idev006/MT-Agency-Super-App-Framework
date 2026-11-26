# p6vc-core (VC-ADR-046). Build context: apps/vehicle-contact (same as the legacy image).
# Phase 1 needs the shared HTTP handler (backend/cloudrun) and the backend DTO/contract code it imports (backend/gas/src).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY schema/database.schema.json schema/database.schema.json
COPY contracts contracts
COPY backend/gas/package.json backend/gas/package.json
COPY backend/gas/src backend/gas/src
COPY backend/cloudrun backend/cloudrun
COPY backend/core backend/core
USER node
EXPOSE 8080
CMD ["node", "backend/core/src/main.mjs"]
