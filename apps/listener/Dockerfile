# Listener image. Build context is the repository root.
# Railway reads RAILWAY_DOCKERFILE_PATH=apps/listener/Dockerfile.
# The root Dockerfile remains the web app.
#
# RAPIDAPI_KEY, INGEST_SECRET, and any Sentry token are runtime variables.
# This file has no build argument for them, and it does not copy env files.

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/listener/package.json ./apps/listener/
COPY packages/core/package.json ./packages/core/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/tokens/package.json ./packages/tokens/
COPY packages/provider-rapidapi/package.json ./packages/provider-rapidapi/
RUN npm ci --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/apps/web/package.json ./apps/web/
COPY --from=deps /app/apps/listener/package.json ./apps/listener/
COPY --from=deps /app/packages/core/package.json ./packages/core/
COPY --from=deps /app/packages/i18n/package.json ./packages/i18n/
COPY --from=deps /app/packages/tokens/package.json ./packages/tokens/
COPY --from=deps /app/packages/provider-rapidapi/package.json ./packages/provider-rapidapi/
COPY apps/listener ./apps/listener
COPY packages/provider-rapidapi ./packages/provider-rapidapi
COPY packages/core ./packages/core
COPY scripts/register-ts-ext.mjs scripts/ts-ext-hooks.mjs ./scripts/
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "start", "-w", "@matchread/listener"]
