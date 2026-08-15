# Scenario — Upload real tennis results with RapidAPI

**Goal:** A finished ATP/WTA match from RapidAPI appears as the official winner on **https://www.matchreadtennis.com**, then standings move after you settle.

**You do not paste the RapidAPI key into Vercel or GitHub.** The key is a Supabase secret. The public site only reads Postgres.

**Related:** [SYNC-TENNIS.md](./SYNC-TENNIS.md) · [RECONCILE-RESULTS.md](./RECONCILE-RESULTS.md) · [INGEST.md](./INGEST.md) · [GO-LIVE-MATCHREADTENNIS.md](./GO-LIVE-MATCHREADTENNIS.md)

---

## The story (one sentence)

RapidAPI knows who won → your reconcile job maps that to MatchRead’s bracket seats → Supabase stores it → you Settle on the website → members see the result.

```text
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────┐     ┌──────────────────────┐
│  RapidAPI   │────▶│  sync-tennis         │────▶│  ingest-events  │────▶│  match_results (DB)  │
│  (winners)  │ GET │  (RAPIDAPI_KEY here) │ POST│  (Edge Function)│     │                      │
└─────────────┘     └──────────────────────┘     └─────────────────┘     └──────────┬───────────┘
                                                                                     │
                                                              Settle (in browser)     │
                                                                                     ▼
                                                                            standings / Daily Check
                                                                                     │
                                                                                     ▼
                                                                    www.matchreadtennis.com
```

---

## Actors & IDs (what must line up)

| World | Example | Role |
|---|---|---|
| RapidAPI tournament id | `21346` (Montreal 2026) | `provider_tournament_id` in the map |
| RapidAPI match id | `1244910` | key in `matches` |
| RapidAPI player id (winner) | `28170` (Rinderknech) | key in `players` |
| MatchRead tournament UUID | from Supabase `tournaments.id` | `tournament_id` in the map |
| MatchRead seat | `atp-28170` | value in `players` (`atp-{providerPlayerId}`) |
| MatchRead bracket slot | `r0-m0` … `r5-m0` | value in `matches` (64-draw: R64→Final) |

If any link is missing, reconcile **skips** that match (fail closed).

**Live event:** National Bank Open week runs **two** MatchRead tournaments:

| Tour | City | Ref | Provider id |
|---|---|---|---|
| ATP | Montreal | `nbo-mtl-2026` | `21346` |
| WTA | Toronto | `nbo-tor-2026` | `16739` |
| ATP | Cincinnati | `cin-2026` | `21347` |
| WTA | Cincinnati | `cin-wta-2026` | `16740` |
| ATP | Winston-Salem | `wsal-2026` | `21348` |
| ATP | US Open | `uso-2026` | `21349` |
| WTA | US Open | `uso-wta-2026` | `16743` |

Pure-fact seats + maps: `node scripts/import-nbo-draw.mjs` (or `--tour atp` / `--tour wta`). Toronto stays draw-pending until WTA import writes `provider_player_id` seats (migration `0016` strips placeholders). Verify both calendars: `node scripts/probe-rapidapi.mjs calendar 2026`. RG/Wim fixtures were removed.

---

## Prerequisites checklist

Before the scenario:

- [ ] Site live: https://www.matchreadtennis.com shows MatchRead  
- [ ] RapidAPI Basic (or Pro) subscribed; key works (`npm run probe:rapidapi`)  
- [ ] Repo has `scripts/reconcile-results.mjs` + `packages/provider-rapidapi`  
- [ ] Migration `supabase/migrations/0010_provider_refs.sql` applied on Supabase  
- [ ] Edge Function `ingest-events` deployed; `INGEST_SECRET` set in Supabase  
- [ ] You can sign in as commissioner/founder on the live site  

---

## Scenario A — First real result (laptop)

### Step 1 — Prove the key

```powershell
cd E:\Projs\mh-2
npm run probe:rapidapi
```

Expect: `status=200` and `OK — Basic plan auth works.`

Key lives in gitignored `.env.provider`:

```
RAPIDAPI_KEY=...
RAPIDAPI_HOST=tennis-api-atp-wta-itf.p.rapidapi.com
```

### Step 2 — Pick a real RapidAPI tournament

Example already probed: Montreal Masters **`21346`**.

List / confirm:

```powershell
# Uses your .env.provider — one request
node -e "
const fs=require('fs');
const env=Object.fromEntries(fs.readFileSync('.env.provider','utf8').split(/\r?\n/).filter(Boolean).map(l=>l.split('=')));
fetch('https://'+env.RAPIDAPI_HOST+'/tennis/v2/atp/tournament/results/'+21346,{headers:{'X-RapidAPI-Key':env.RAPIDAPI_KEY,'X-RapidAPI-Host':env.RAPIDAPI_HOST}})
  .then(r=>r.json()).then(d=>{
    const s=d.data.singles.slice(0,3);
    console.log(JSON.stringify(s.map(m=>({id:m.id,winner:m.match_winner,p1:m.player1?.name,p2:m.player2?.name,result:m.result})),null,2));
  });
"
```

Note one finished row: `id`, `match_winner`, player names.

### Step 3 — Create (or choose) a MatchRead tournament + seats

On https://www.matchreadtennis.com (or Supabase Table Editor):

1. Have a league and a tournament with a **draw** whose seats you control.  
2. For a **pilot**, seats should be the **real** players you care about (or map fictional `p-0` only for a smoke test of ingest plumbing — grades will look wrong until seats match reality).  
3. Copy `tournaments.id` (UUID) from Supabase.

Optional SQL after `0010`:

```sql
update public.tournaments
set provider_tournament_id = '21346'
where id = '<your-uuid>';

-- If you store provider ids on seats:
-- update draw_seats set provider_player_id = '28170' where player_ref = 'p-0' and ...
```

### Step 4 — Build the map file

```powershell
copy .provider-map.example.json .provider-map.json
```

Edit `.provider-map.json` (gitignored):

```json
{
  "tournament_id": "YOUR-MATCHREAD-TOURNAMENT-UUID",
  "provider_tournament_id": "21346",
  "tour": "atp",
  "players": {
    "28170": "p-0",
    "29939": "p-1"
  },
  "matches": {
    "1244910": "r0-m0"
  }
}
```

Meaning: “RapidAPI match `1244910` is our bracket slot `r0-m0`; if winner is player `28170`, write seat `p-0`.”

Expand `players` / `matches` as you cover more of the draw. Unmapped matches are skipped.

### Step 5 — Dry-run (no database write)

```powershell
npm run reconcile:results -- --dry-run --map .provider-map.json
```

Expect something like:

```text
Mapped 1 ingest row(s); skipped …
Payload:
{
  "tournament_id": "…",
  "results": [
    { "match_key": "r0-m0", "winner_ref": "p-0", "voided": false }
  ]
}
Dry-run complete — no ingest POST.
```

If `Mapped 0`: fix the map (wrong match ids / player ids / tournament id).

### Step 6 — Arm ingest + live push

Add to `.env.provider`:

```
MATCHREAD_INGEST_URL=https://opugihofwvunwkpcmboq.supabase.co/functions/v1/ingest-events
INGEST_SECRET=<same secret you set in Supabase>
```

Deploy once (if not done):

```bash
supabase functions deploy ingest-events
supabase secrets set INGEST_SECRET=<long-random>
```

Live upload:

```powershell
npm run reconcile:results -- --map .provider-map.json
```

Expect: `Ingest status=200` and `ok: true, upserted: N`.

This **writes** `match_results`. It does **not** move standings yet.

### Step 7 — Settle on the public site

1. Open https://www.matchreadtennis.com  
2. Sign in as commissioner (or founder)  
3. Open the league → that tournament  
4. Confirm **Official results** shows the winner for `r0-m0`  
5. Click **Run settlement** (or founder **Settle all leagues**)  
6. Check standings / Daily Check / result page  

**Done:** real RapidAPI outcome is now visible to members on the domain.

---

## Scenario B — Same thing via GitHub Actions (no laptop each time)

Use when the map + ingest path already works once.

### B1 — Secrets

GitHub → **MatchRead/MatchRead** → **Settings → Secrets and variables → Actions**:

| Secret | Contents |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `INGEST_SECRET` | Same as Supabase |

`RAPIDAPI_KEY` stays in Supabase secrets. Do **not** put it on Vercel or GitHub.

### B2 — Push workflow

Ensure `.github/workflows/sync-tennis.yml` is on `main`. Deploy `sync-tennis` first ([SYNC-TENNIS.md](./SYNC-TENNIS.md)).

### B3 — Manual dry-run then live

1. **Actions → Sync tennis facts → Run workflow**  
2. `dry_run = true` → check logs  
3. Run again with `dry_run = false` → ingest  
4. Settle on https://www.matchreadtennis.com  

### B4 — Schedule

Cron runs every **6 hours** (UTC) with **live** ingest. Basic plan = 50 requests/day — leave at 6h until you upgrade to Pro.

After each scheduled ingest, **Settle** is still manual in v1 (or add a settle cron later).

---

## Scenario C — US Open (or any slam) week

Same pipeline; bigger map.

1. Find RapidAPI `provider_tournament_id` for that event (`/tennis/v2/atp/tournament/calendar/2026` or tournament info).  
2. Import / seed MatchRead draw seats with **real** names and `provider_player_id`.  
3. Build `matches` map: every RapidAPI result `id` → correct `r{round}-m{slot}` (this is the hard part — wrong slot = wrong grades).  
4. Upgrade RapidAPI to **Pro** if polling often.  
5. Run GitHub Action on a tighter schedule only after Pro.  
6. Commissioners still Settle (or automate settle off-Vercel).

Until the full draw map exists, use **Official results** UI on the site as fallback for individual matches.

---

## What “upload” is not

| Wrong idea | Reality |
|---|---|
| Paste key into Vercel env | Never — key not on the public app |
| Browser calls RapidAPI | Never — only reconcile/worker does |
| Reconcile alone updates standings | No — must **Settle** after ingest |
| Fixtures endpoint = winners | No — fixtures are upcoming only; use **tournament/results** |

---

## Failure cheatsheet

| Symptom | Fix |
|---|---|
| Probe 401/403 | Resubscribe / rotate key; check host |
| Dry-run Mapped 0 | Fix `matches` / `players` / provider tournament id |
| Ingest 401 | `INGEST_SECRET` mismatch |
| Ingest 200 but site empty | Wrong `tournament_id` UUID; refresh tournament page |
| Winner wrong seat | Bad player map; fix `players` and re-ingest |
| Standings unchanged | You forgot **Settle** |
| Grades nonsense vs ATP | Pilot seats still fictional; remap or new tournament |

---

## Quick command card

```powershell
cd E:\Projs\mh-2

# Key works?
npm run probe:rapidapi

# Preview payload
npm run reconcile:results -- --dry-run --map .provider-map.json

# Write to Supabase
npm run reconcile:results -- --map .provider-map.json

# Then: Settle on https://www.matchreadtennis.com
```

---

## Sign-off

| Check | Done |
|---|---|
| Probe 200 | [ ] |
| Dry-run maps ≥1 row | [ ] |
| Live ingest 200 | [ ] |
| Official results on domain | [ ] |
| Settle → standings move | [ ] |
| No `RAPIDAPI_*` on Vercel | [ ] |
