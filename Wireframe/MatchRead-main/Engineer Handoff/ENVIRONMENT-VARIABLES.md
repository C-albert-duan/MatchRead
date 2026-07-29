# Environment variables — complete inventory

Every variable read anywhere in the repository, by platform. Gathered by grepping
`process.env.*` and `Deno.env.get(*)` across `apps/`, `packages/`, `supabase/` and
`scripts/`, so it is exhaustive as of migration head `0030` rather than remembered.

**No real values appear in this file and none ever should.** Every value lives in the
platform that consumes it. Placeholders are `<angle-bracketed>`.

**The one rule that matters:** `SUPABASE_SERVICE_ROLE_KEY` is permitted in exactly three
places — Supabase Edge Functions (injected by the platform), the Railway listener, and a
launch engineer's local shell for a one-off migration. **It is never set on Vercel and never
in any file named `.env*` that could be committed.** Every other rule in this document is a
convenience; this one is the security model.

---

## Reading the columns

| Column | Meaning |
|---|---|
| **Visibility** | `public` — shipped to browsers, safe by design. `secret` — never leaves a server |
| **Local / Preview / Prod** | ● required · ○ optional · — not applicable |
| **Breaks** | The actual observed failure when it is missing, not "it won't work" |

---

## 1. Vercel — `apps/web`

Validated by Zod at first use in `apps/web/lib/env.ts`, so a missing variable is a named
startup error rather than `fetch(undefined + '/auth/v1/token')` at 3am.

| Variable | Visibility | Local | Preview | Prod | Breaks if missing |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | ● | ● | ● | Every page. Startup error naming the variable |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | ● | ● | ● | Same |
| `NEXT_PUBLIC_SITE_URL` | public | ○ | **—** | ● | Magic links redirect to `localhost:3000`. Sign-in appears broken to every user |

**Where the founder gets them.** Supabase → Project Settings → API. `NEXT_PUBLIC_SITE_URL`
is `https://matchreadtennis.com` and is chosen, not found.

**Why `NEXT_PUBLIC_SITE_URL` must be absent on Preview.** `siteUrl()` in `lib/env.ts` falls
back to `VERCEL_URL`, which is the *per-deployment* host. Setting an explicit value on
Preview pins every preview's auth callback to production and the sign-in loop silently
leaves the deployment you are testing.

### Read but never set by you

| Variable | Source | Note |
|---|---|---|
| `VERCEL_URL` / `NEXT_PUBLIC_VERCEL_URL` | Vercel | The deployment host. Used by `siteUrl()` for previews |
| `NODE_ENV` | Next.js | Do not set it manually |

### Must NOT be present on Vercel

- [ ] **`SUPABASE_SERVICE_ROLE_KEY`** — nothing in `apps/web` reads it. If it is there,
      delete it and rotate it. The web app's entire security model is that it holds only the
      anon key and RLS decides the rest.
- [ ] Any `RAPIDAPI_*` value. The web app never contacts the provider.

Verify after every deploy: `grep -r "service_role" apps/web/.next/static` must be empty.

**Rotation.** Anon key: Supabase → Settings → API → roll, then update Vercel and redeploy.
The anon key is public by design, so rotating it is a chore rather than an emergency — the
thing that protects the data is RLS, and if the anon key leaking worries you, the real
problem is a policy.

---

## 2. Supabase Edge Functions — `supabase secrets set`

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are **injected by the platform**. Do not set
them; `supabase secrets set` will refuse names beginning `SUPABASE_`.

Every function reads them through `supabase/functions/_shared/supabase.ts`, which also uses
the service-role key as a **shared bearer secret** to authenticate inbound calls
(`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`). That is why the listener needs the key: not to
touch the database, but to prove to `ingest-events` that it is us.

| Variable | Function | Visibility | Beta-critical | Breaks if missing |
|---|---|---|---|---|
| `MATCHREAD_ENGINE_URL` | `ingest-events`, `import-draw` | secret | ● **Yes** | No draws, no results. Silent — the product looks empty rather than broken |
| `MATCHREAD_ENGINE_TOKEN` | same | secret | ● **Yes** | Same |
| `ANTHROPIC_API_KEY` | `ask-matchread` | secret | ○ No | The AI layer 500s. Out of beta scope — do not deploy the function |
| `PUSH_ENDPOINT` | `dispatch-notifications` | secret | ○ No | Nothing sends. Nothing sends anyway |
| `PUSH_API_KEY` | same | secret | ○ No | Same |

```bash
supabase secrets set MATCHREAD_ENGINE_URL=<url> MATCHREAD_ENGINE_TOKEN=<token>
supabase secrets list                       # names only, never values
```

**Verify with a real call, not by reading the dashboard.** A secret that is present and wrong
fails identically to one that is absent.

**Rotation.** Rotate at the engine, `supabase secrets set` the new value, redeploy the two
functions. Ingestion is idempotent — `platform_events` dedupes on content — so a brief
window of rejected calls costs a delay, not data.

---

## 3. Railway — the ingestion listener

> **This component does not exist yet.** `packages/provider-rapidapi` contains the tested
> socket transport; there is no `Dockerfile`, no `apps/listener`, and no host config anywhere
> in the repository. See `ENGINEERING-HANDOFF.md` §3.2 and
> `docs/runbooks/RAILWAY-WORKER.md`. **This table is the specification for what to build,
> not a description of something deployed.**

| Variable | Visibility | Required | Purpose |
|---|---|---|---|
| `RAPIDAPI_KEY` | secret | ● | Provider auth. Sent as `X-RapidAPI-Key` |
| `RAPIDAPI_HOST` | secret | ● | Sent as `X-RapidAPI-Host`. Provider-specific — read it from the RapidAPI endpoint page |
| `MATCHREAD_INGEST_URL` | secret | ● | `https://<ref>.functions.supabase.co/ingest-events` |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | ● | The bearer secret `_shared/supabase.ts` expects. **Not used for database access** |
| `MATCHREAD_ENV` | public | ● | `production` \| `staging`. Tags logs and heartbeats so a staging listener is never mistaken for production |
| `LOG_LEVEL` | public | ○ | `info` default |

`RAPIDAPI_KEY` is also read by the capture and verification scripts
(`scripts/lib/strict-provider.mjs`) when you run a capture locally.

**Where the founder gets them.** RapidAPI → the tennis API product → Endpoints → the code
snippet panel carries both the key and the host header.

**Rotation.** RapidAPI → regenerate → update the Railway variable → restart. The listener is
stateless and restart costs seconds; the `reconcile-results` sweep closes the gap. That
property is why ADR-0018 argues for one instance rather than a hot spare.

**Quota is the scarce resource, not availability.** A rotated key with a fresh quota is fine;
an exhausted quota is an outage. See `docs/runbooks/TENNIS-PROVIDER.md`.

---

## 4. GitHub Actions

| Secret | Job | Required |
|---|---|---|
| `EXPO_TOKEN` | EAS preview build | ○ No — unrelated to a web beta; the job skips without it |

**Nothing else.** The database job builds PostgreSQL from migration zero in a service
container and needs no credential, which is the property that makes it trustworthy: it
cannot pass because of a permission it was granted.

Do not add deployment secrets. Vercel deploys from its own GitHub integration.

---

## 5. Local development — `.env`

`cp .env.example .env`. `.env` is gitignored; confirm with `git check-ignore -v .env`.

| Variable | Value locally |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` from `supabase start` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Printed by `supabase start` |
| `NEXT_PUBLIC_SITE_URL` | Omit — defaults to `http://localhost:3000` |
| `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | Mobile only. Not needed for a web beta |
| `EXPO_PUBLIC_POSTHOG_KEY` / `_HOST` / `EXPO_PUBLIC_ENV` | Mobile analytics. **The only analytics wiring that exists anywhere in this repository** |

### Read by scripts, not by the app

| Variable | Consumer | Note |
|---|---|---|
| `PGHOST` `PGPORT` `PGUSER` `PGDATABASE` | `scripts/db-run.sh`, `packages/settlement` integration tests | Standard libpq. Defaults suit `supabase start` |
| `MATCHREAD_SCALE` | `settlement-scale.test.ts` | Raises the synthetic field size. Slow; leave unset |
| `PROVIDER_TOURNAMENT_ID`, `PROVIDER_RECORDS` | Capture scripts | Which tournament to capture and where to write it |

**`scripts/preflight.mjs` reads only the three public web variables and must never be given a
service-role key.** Every check runs as `anon` — the identity a signed-out visitor has — so
what it verifies is what the public can actually see. A preflight with elevated privileges
would pass against a project whose RLS is broken, which is precisely backwards.

---

## 6. Analytics, error tracking, email — not yet wired

**None of these are read anywhere in `apps/web` today.** Listed so the names are decided once
rather than three times. See `docs/ANALYTICS-PLAN.md` and `docs/MONITORING.md`.

| Variable | Platform | Visibility | Note |
|---|---|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | Vercel | public | Project API key. Public by design |
| `NEXT_PUBLIC_POSTHOG_HOST` | Vercel | public | `https://eu.i.posthog.com` — EU region, chosen for GDPR |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel | public | A DSN is public; it accepts events and reads nothing |
| `SENTRY_AUTH_TOKEN` | Vercel (build only) | **secret** | Source-map upload at build time. Not available at runtime |
| `SENTRY_ORG` / `SENTRY_PROJECT` | Vercel (build only) | public | |
| `RESEND_API_KEY` | Supabase SMTP config | **secret** | Only if custom SMTP is via API rather than SMTP credentials |

Follow `EXPO_PUBLIC_POSTHOG_*` in `apps/mobile` for naming. Two names for one key across two
apps is how an analytics migration becomes a week.

---

## 7. Preflight

Before the first deploy and after any auth change:

```bash
NEXT_PUBLIC_SUPABASE_URL=<url> \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon> \
NEXT_PUBLIC_SITE_URL=https://matchreadtennis.com \
node scripts/preflight.mjs
```

Reads from the environment and never from arguments, so a key cannot end up in shell
history. Every check corresponds to a failure that is **silent or misleading** in production:
a missing table returns an empty page rather than an error, RLS configured too loosely
returns *more* data so the happy path looks fine, and an unconfigured redirect URL fails only
when a real user clicks a real magic link.

---

## 8. Audit checklist

Run before opening the beta.

- [ ] `grep -r "service_role" apps/web/.next/static` → empty
- [ ] Vercel Production has exactly three variables; Preview has two
- [ ] No `SUPABASE_SERVICE_ROLE_KEY` on Vercel in any environment
- [ ] `git log --all -p -- .env .env.local` → empty
- [ ] `supabase secrets list` shows only `MATCHREAD_ENGINE_*` (plus platform-injected)
- [ ] Every Railway variable set, and `MATCHREAD_ENV=production`
- [ ] No secret has ever been pasted into a chat window. **If one has, rotate it** — assume
      compromise rather than arguing about it
- [ ] `node scripts/preflight.mjs` passes against production
- [ ] Every value above is recorded in the founder's password manager, because the failure
      this prevents is not a breach but a bus
