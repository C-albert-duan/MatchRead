# Known Risks

Carried from wireframe / engineering handoff. Update as items close.

## 1. Settlement cron is armed on production

`settle-leagues` + `pg_cron` (`15,45 * * * *`) grades submitted brackets after official results. Vault names `project_url` + `ingest_secret`. First live POST returned 200 (no submitted brackets yet to grade).

→ [runbooks/SETTLEMENT-SCHEDULING.md](./runbooks/SETTLEMENT-SCHEDULING.md)

## 2. Tennis API sync is armed — provider 522 can still stall a tick

`pg_cron` every 5 minutes POSTs `sync-tennis`. Edge `RAPIDAPI_KEY`, Vault, and cron jobs are live on `opugihofwvunwkpcmboq`. A tick still depends on Tennis API (Cloudflare 522 was seen 13 Aug). Mega quota is required for 5-minute polling.

→ [runbooks/SYNC-TENNIS.md](./runbooks/SYNC-TENNIS.md)

## 3. 72-hour bracket window

Every US Open bracket is entered between draw (~27 Aug) and lock (~11:00 ET 30 Aug). Builder must be proven before draw day. League invites must ship weeks earlier — **Draw pending** is a designed product state.

## 4. Auth never proven until first deployed project

Magic link against real Supabase redirect allow-list + SMTP must be verified early (Phase 1).

## 5. Provider / draw integrity

Provider is trusted for scores and schedule — never for tennis rules or bracket topology. Import must fail closed if reconstruction is unverifiable.

→ [runbooks/TENNIS-PROVIDER.md](./runbooks/TENNIS-PROVIDER.md)

## 6. Email rate limits

Magic link is the only auth method. Invite waves will hit Supabase default sender limits — plan SMTP.

## 7. Showcase removed on purpose

`/showcase` (128 fictional `Player47` rows) was a compile-time shape check. Cincinnati cleanup deleted it: a real `/tournaments/[ref]` is the public draw. Old links redirect to `/tournaments`. The type-canary warning is gone; that is accepted.

## 8. First-party ops capture is the live error tool

Sentry/PostHog keys are optional. Errors and the nine launch events write to `ops_events` (visible on `/founder`). Provider failures also insert from `sync-tennis`.
