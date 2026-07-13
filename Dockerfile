# --- Client build ---
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# --- Server build (needs sibling shared/) ---
FROM node:20-alpine AS server-build
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
WORKDIR /app/server
RUN npm ci
WORKDIR /app
COPY server/ ./server/
COPY shared/ ./shared/
WORKDIR /app/server
RUN npm run build

# --- Production image ---
FROM node:20-alpine AS production
WORKDIR /app/server

RUN apk add --no-cache wget

ENV NODE_ENV=production
# Docker Compose sets PORT=3001 at runtime.
ENV FHIR_WAIT=false

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=server-build /app/server/dist ./dist
COPY --from=client-build /app/client/dist ../client/dist
COPY server/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD sh -c 'wget -qO- "http://127.0.0.1:${PORT:-8080}/" > /dev/null || exit 1'

CMD ["./docker-entrypoint.sh"]
