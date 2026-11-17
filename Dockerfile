# Outlier: one container, Node 24 runs the TypeScript server directly; the web app is built by Vite.
# Data (SQLite database, log) lives in /data: mount a volume there.

FROM node:24-slim AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    OUTLIER_HOST=0.0.0.0 \
    OUTLIER_PORT=8080 \
    OUTLIER_DATA=/data
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY bank ./bank
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/me').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server/server.ts"]
