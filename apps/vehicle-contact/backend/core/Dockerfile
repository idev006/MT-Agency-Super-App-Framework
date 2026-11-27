# p6vc-core (VC-ADR-046). Build context: apps/vehicle-contact (same as the legacy image).
# Needs the shared HTTP handler (backend/cloudrun), the backend code it imports (backend/gas/src: DTO, flows, store rules)
# and its own dependencies (@google-cloud/firestore), installed from the lock file.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY schema/database.schema.json schema/database.schema.json
COPY contracts contracts
COPY backend/gas/package.json backend/gas/package.json
COPY backend/gas/src backend/gas/src
COPY backend/cloudrun backend/cloudrun
COPY backend/core/package.json backend/core/package-lock.json backend/core/
RUN cd backend/core && npm ci --omit=dev --no-audit --no-fund
COPY backend/core/src backend/core/src
USER node
EXPOSE 8080
CMD ["node", "backend/core/src/main.mjs"]
