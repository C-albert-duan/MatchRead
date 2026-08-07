# Go live — matchreadtennis.com + RapidAPI test

Owner runbook: put MatchRead on **https://matchreadtennis.com** (Porkbun DNS → Vercel), then prove real results via RapidAPI **off** Vercel.

**Related:** [FIRST-PRODUCTION.md](./FIRST-PRODUCTION.md) · [SMTP.md](./SMTP.md) · [RECONCILE-RESULTS.md](./RECONCILE-RESULTS.md) · [SCENARIO-RAPIDAPI-RESULTS.md](./SCENARIO-RAPIDAPI-RESULTS.md) · [16-rapidapi-reconcile-checklist.md](../plans/16-rapidapi-reconcile-checklist.md)

---

## What “live” means

| Layer | Host | Holds RapidAPI key? |
|---|---|---|
| Public website | Vercel → `matchreadtennis.com` | **No** |
| Database / Auth | Supabase `opugihofwvunwkpcmboq` | No |
| Tennis results feed | Your laptop / GitHub Action / Railway | **Yes** |

Users only open the domain. RapidAPI runs in the background → `ingest-events` → settle → domain shows winners.

---

## Part A — Unblock Vercel deploys (do first)

Earlier blockers: wrong commit (`05de3bc`), Root Directory, commit author not on Vercel team.

1. Log into Vercel as the **MatchRead project owner** (`matchreads-projects` / `business@matchreadtennis.com`).
2. Confirm Git repo is **`MatchRead/MatchRead`**, Production branch **`main`**.
3. Root Directory = **`apps/web`** (exact; not doubled).
4. Accept team invite for the GitHub identity that authors commits (**brailofrag**), **or** push a commit whose Git email matches the Vercel owner’s linked GitHub.
5. Deployments → ensure latest `main` builds **Ready** (not Blocked). Open the `*.vercel.app` URL — landing loads.

Do **not** continue to DNS until a `main` deploy is green.

---

## Part B — Vercel env (Production)

**Settings → Environment Variables** — Production:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://opugihofwvunwkpcmboq.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key |
| `NEXT_PUBLIC_SITE_URL` | `https://matchreadtennis.com` |
| `FOUNDER_EMAILS` | Optional: your founder email(s) |

**Never add:** `RAPIDAPI_*`, `SUPABASE_SERVICE_ROLE_KEY`, `INGEST_SECRET`, SMTP passwords.

Preview: same Supabase URL + anon only; **omit** `NEXT_PUBLIC_SITE_URL`.

Redeploy Production after saving env.

---

## Part C — Point Porkbun DNS at Vercel

1. Vercel → Project → **Settings → Domains** → Add **`matchreadtennis.com`** (and `www` if you want).
2. Vercel shows required DNS records (usually):
   - **A** `@` → `76.76.21.21` (confirm in Vercel UI — use whatever Vercel displays), **or**
   - Their recommended **CNAME** / nameserver instructions
3. Porkbun → Domain → **DNS** for `matchreadtennis.com`:
   - Remove Porkbun **parking / URL forwarding** that conflicts
   - Add the records Vercel shows
   - Optional: `www` CNAME → `cname.vercel-dns.com` (or value Vercel shows)
4. Wait for DNS (often minutes; can be up to 48h).
5. Vercel Domains: status **Valid** + HTTPS certificate issued.
6. Open **https://matchreadtennis.com** — MatchRead landing (not Porkbun parking).

---

## Part D — Supabase Auth for the domain

Supabase → **Authentication → URL configuration**:

| Field | Value |
|---|---|
| Site URL | `https://matchreadtennis.com` |
| Redirect allow list | `https://matchreadtennis.com/**` |
| | `https://matchreadtennis.com/auth/callback` |
| Keep for local | `http://localhost:3001/**`, `http://localhost:3001/auth/callback` |
| Keep for Preview | `https://*-*.vercel.app/**` (match your project pattern) |

Remove `0.0.0.0`, `*.l.ink`, and Porkbun parking URLs.

---

## Part E — Magic-link email (SMTP)

Without SMTP, sign-in on the public domain will fail or rate-limit.

1. Follow [SMTP.md](./SMTP.md) (Resend recommended).
2. Verify sending domain **`matchreadtennis.com`** in Resend (DNS TXT/CNAME at Porkbun).
3. Enable custom SMTP in Supabase with Resend credentials.
4. On **https://matchreadtennis.com/sign-in** → request magic link → open email → land on **same domain** → session → `/leagues`.

---

## Part F — Product smoke on the domain

Signed in on `matchreadtennis.com`:

1. Create or open a league; invite/join if needed.
2. Open a tournament with a draw (fixture `uso-2026` is fine for UI smoke).
3. Fill/submit bracket if testing picks.
4. **Official results** → save one winner manually → **Settle** → standings / Daily Check update.

This proves the **live domain** without RapidAPI.

---

## Part G — RapidAPI → live domain (background feed)

RapidAPI never goes on Vercel. Results still appear on `matchreadtennis.com` after ingest + settle.

### G1 — Secrets (local only)

`.env.provider` (gitignored):

```
RAPIDAPI_KEY=...
RAPIDAPI_HOST=tennis-api-atp-wta-itf.p.rapidapi.com
MATCHREAD_INGEST_URL=https://opugihofwvunwkpcmboq.supabase.co/functions/v1/ingest-events
INGEST_SECRET=<same as Supabase secret>
```

Upgrade RapidAPI off **Basic** before frequent polling (50 req/day).

### G2 — Supabase machine path

```bash
# Apply provider columns (SQL editor or migrate profile)
# File: supabase/migrations/0010_provider_refs.sql

supabase functions deploy ingest-events
supabase secrets set INGEST_SECRET=<long-random>
```

Smoke ingest with manual JSON once ([INGEST.md](./INGEST.md)).

### G3 — Map a pilot tournament

1. Copy `.provider-map.example.json` → `.provider-map.json`.
2. Set `tournament_id` to your MatchRead tournament UUID (from Supabase).
3. Set `provider_tournament_id` (e.g. Montreal `21346` or US Open when live).
4. Map `players` (RapidAPI player id → `player_ref`) and `matches` (RapidAPI match id → `r0-m0`).
5. Prefer a **pilot** tournament whose seats use real names + provider ids — fictional `uso-2026` alone cannot grade real ATP winners until remapped.

### G4 — Reconcile then settle

```powershell
cd E:\Projs\mh-2
npm run reconcile:results -- --dry-run --map .provider-map.json
npm run reconcile:results -- --map .provider-map.json
```

On **https://matchreadtennis.com**: open that tournament → confirm Official results → **Settle** → check standings / result page.

### G5 — GitHub Action (recommended vs laptop)

Workflow: `.github/workflows/reconcile-results.yml` — see [RECONCILE-RESULTS.md](./RECONCILE-RESULTS.md#github-action-scheduled).

1. Add GitHub Actions secrets: `RAPIDAPI_KEY`, `MATCHREAD_INGEST_URL`, `INGEST_SECRET`, `PROVIDER_MAP_JSON`.
2. Push/merge to `main`.
3. Actions → **Reconcile RapidAPI results** → Run workflow (**dry_run** first).
4. Schedule runs every 6 hours; Settle still happens in the app (or later cron).

Still **not** Vercel. Optional settle cron: [SETTLEMENT-SCHEDULING.md](./SETTLEMENT-SCHEDULING.md).

---

## Checklist (print / tick)

### Domain live
- [ ] Green Production deploy from current `main`
- [ ] `matchreadtennis.com` Valid on Vercel + HTTPS
- [ ] `NEXT_PUBLIC_SITE_URL=https://matchreadtennis.com` (Production only)
- [ ] Supabase Auth Site URL + redirects include the domain
- [ ] Magic link works on the domain
- [ ] League / bracket / manual settle works on the domain

### RapidAPI on that live app
- [ ] `0010` applied; `ingest-events` + secret
- [ ] `.provider-map.json` filled for a pilot
- [ ] Dry-run maps ≥1 finished match
- [ ] Live reconcile upserts; Settle on domain updates UI
- [ ] Vercel env still has **no** `RAPIDAPI_*`

---

## Failure modes

| Symptom | Fix |
|---|---|
| Porkbun parking page | DNS not pointing at Vercel; remove forwarding |
| Vercel “Blocked” author | Accept brailofrag on team / commit as linked GitHub |
| Root Directory does not exist | Deploy latest `main`, not old placeholder commit |
| Magic link → wrong host | Fix Auth allow-list + Site URL; no SITE_URL on Preview |
| Reconcile maps 0 rows | Expand `matches` / `players` in map file |
| Domain works, no “live” tennis | Normal until reconcile + settle; manual Official results still works |
