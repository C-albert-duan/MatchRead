# MatchRead tennis-facts worker — Railway / Compose. Never deploy to Vercel.
FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/core/package.json ./packages/core/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/tokens/package.json ./packages/tokens/
COPY packages/provider-rapidapi/package.json ./packages/provider-rapidapi/
RUN npm ci --omit=dev

COPY packages/provider-rapidapi ./packages/provider-rapidapi
COPY apps/worker ./apps/worker

ENV NODE_ENV=production \
    PORT=8080
EXPOSE 8080
CMD ["npm", "run", "start", "-w", "@matchread/worker"]
