# Environment variables

Adapted from `Wireframe/MatchRead-main/Engineer Handoff/ENVIRONMENT-VARIABLES.md`.

**No real values in this file.** Placeholders are `<angle-bracketed>`.

## The one rule that matters

`SUPABASE_SERVICE_ROLE_KEY` is permitted in:

1. Supabase Edge Functions (platform-injected)
2. Railway listener (when built)
3. A launch engineer's local shell for one-off ops

**Never on Vercel. Never in committed `.env*` files. Never in the browser or any `NEXT_PUBLIC_*` variable.**

## Vercel / `apps/web`

| Variable | Visibility | Local | Preview | Prod |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | ● | ● | ● |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | ● | ● | ● |
| `NEXT_PUBLIC_SITE_URL` | public | ○ | — | ● |
| `FOUNDER_EMAILS` | server-only | ○ | ○ | ● |

`FOUNDER_EMAILS` — comma-separated emails allowed to open `/founder` and `/founder/disruption`. If unset or empty, any signed-in user is allowed (private beta) and founder pages show a clear beta banner.

Must **not** be present on Vercel: `SUPABASE_SERVICE_ROLE_KEY`, any `RAPIDAPI_*`.

## Local `.env` (gitignored)

Copy from repo root `.env.example`.

Optional in `apps/web/.env.local`:

```
FOUNDER_EMAILS=you@example.com,ops@example.com
```

## Edge functions / listener (later)

| Variable | Where |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Injected in Edge Functions |
| `RAPIDAPI_KEY` / provider host | Listener only |

## Deferred: PostHog / Sentry

Not required for invited beta. Do **not** add SDKs until chosen. When ready:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` / host | Client analytics — only if product opts in |
| `SENTRY_DSN` (server) / `NEXT_PUBLIC_SENTRY_DSN` | Error reporting — only if product opts in |

Leave unset until then; no stubs beyond this note.

## Rotation

Anon key leak is not an emergency if RLS is correct — rotate in Supabase → update Vercel → redeploy.
