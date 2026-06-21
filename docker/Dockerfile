# Multi-stage build (architecture §15): build the client + server, then a slim runtime
# image that serves the built client assets and the WebSocket endpoint on one port.
# Build from the repo root:  docker build -f docker/Dockerfile -t primordial-soup .

# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-slim AS build
WORKDIR /app

# Install with the committed lockfile for reproducibility.
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci

# Build the React client (static assets) and bundle the server to a single JS file
# (the workspace TS packages are inlined; no runtime node_modules needed).
RUN npm -w @ps/client run build \
 && npm -w @ps/server run build

# ── Runtime stage ────────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/server/dist ./server
COPY --from=build /app/apps/client/dist ./client

# The server serves these static assets and the WS endpoint on PORT.
ENV CLIENT_DIST=/app/client
ENV PORT=8787
# PUBLIC_BASE_URL builds the join links; override at run time to the externally reachable URL.
ENV PUBLIC_BASE_URL=http://localhost:8787
EXPOSE 8787

CMD ["node", "server/index.js"]
