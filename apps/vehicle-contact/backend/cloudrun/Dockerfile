# Build context: apps/vehicle-contact (the application imports ../../schema/database.schema.json).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY schema/database.schema.json schema/database.schema.json
COPY backend/gas/package.json backend/gas/package.json
COPY backend/gas/src backend/gas/src
COPY backend/cloudrun backend/cloudrun
USER node
EXPOSE 8080
CMD ["node", "backend/cloudrun/server.mjs"]
