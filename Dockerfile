FROM node:20-slim AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Build with standalone Node adapter (not Vercel)
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Install node adapter for build
RUN npm install @astrojs/node
# Use Docker-specific astro config that uses node() standalone adapter
RUN cp astro.config.docker.mjs astro.config.mjs
RUN npm run build

# Production
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 pounce
RUN adduser --system --uid 1001 pounce

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Data volume for config
RUN mkdir -p /data && chown pounce:pounce /data
VOLUME /data

USER pounce
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "dist/server.js"]