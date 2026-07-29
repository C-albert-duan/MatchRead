# Plan 00 — Bootstrap

## Goal

Monorepo ready to develop and push: `docs/`, `apps/web`, `packages/*`, `supabase/`, root tooling. `Wireframe/` untouched.

## Done when

- [x] `npm install` works
- [x] `apps/web` starts (`npm run dev`)
- [x] `.env.example` documents required vars
- [x] CI stub or local lint/typecheck scripts exist
- [ ] GitHub remote can receive first push

## Work

1. Root `package.json` + workspaces (`apps/*`, `packages/*`)
2. Next.js app in `apps/web` (App Router)
3. Stub `packages/core`, `packages/tokens`, `packages/i18n`
4. `supabase/config.toml` + empty migrations folder (or initial schema stub)
5. `.gitignore`, README pointing at `docs/`

## Out of scope

Auth, leagues, provider, deployment accounts (document only).
