# One-shot SQL migrator against any Postgres (hosted Supabase pooler or local).
# Usage: docker compose --profile migrate run --rm migrate

FROM node:22-alpine
WORKDIR /app
RUN npm install --omit=dev pg@8.13.1
COPY scripts/docker-migrate.mjs ./docker-migrate.mjs
COPY supabase/migrations ./migrations
ENV MIGRATIONS_DIR=/app/migrations
USER node
CMD ["node", "docker-migrate.mjs"]
