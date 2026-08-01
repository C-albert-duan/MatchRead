# Docker local E2E — step-by-step scenarios

**Purpose:** Practical whole-product walkthrough on **Docker only** (no Vercel, no Preview deploy).  
**App:** [http://localhost:3001](http://localhost:3001)  
**Related sign-off checklist:** [plans/10-owner-e2e-checklist.md](./plans/10-owner-e2e-checklist.md)

Use two browser profiles (or one normal + one Incognito) when a step needs a second member.

---

## Out of scope (skip until Vercel / Phase 11+)

- Vercel Preview / Production magic-link redirects
- Custom SMTP on a deployed host (local Supabase email / OTP code is enough)
- Always-on Railway socket / ingest cron against production domain
- Private-beta invite wave to real friends on a public URL

---

## Accounts to prepare

| Role | How |
|---|---|
| **A — Commissioner** | Your main email |
| **B — Member** | Second email (or Incognito + different address) |

Supabase Auth URL allow-list must include:

- `http://localhost:3001/**`
- `http://localhost:3001/auth/callback`

---

## Phase 0 — Boot Docker + schema

### 0.1 Start the app

```bash
cd /path/to/mh-2
# First time only:
cp .env.docker.example .env.docker
# Edit .env.docker: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
# Optional: FOUNDER_EMAILS=you@example.com
# Optional for migrate profile: DATABASE_URL=...

docker compose --env-file .env.docker up --build
```

| Step | Action | Pass when |
|---|---|---|
| 0.1.1 | Open http://localhost:3001 | Landing loads (MatchRead hero / brand) |
| 0.1.2 | Open http://localhost:3001/tournaments | Calendar lists Roland Garros / Wimbledon / US Open (or fixture names you seeded) |

### 0.2 Apply migrations (once per Supabase project)

Prefer SQL Editor paste of `supabase/migrations/0001_*.sql` … `0007_*.sql` **in order**, or:

```bash
docker compose --env-file .env.docker --profile migrate run --rm migrate
```

Migrations `0001`–`0007` are **idempotent** — safe to re-paste in order if unsure. They will not wipe league data, draw seats that already exist, or commissioner-entered match results.

| Step | Action | Pass when |
|---|---|---|
| 0.2.1 | Migrations applied through `0007` | No missing-table / missing-RPC errors later in Phase 3–4 |
| 0.2.2 | Math dry-run | Command below prints `Settlement math dry-run passed.` |

```bash
docker compose --env-file .env.docker --profile verify run --rm verify-math
```

- [ ] Phase 0 done

---

## Phase 1 — Sign-in (local auth)

### Scenario 1A — Magic link / verification code

| Step | Action | Pass when |
|---|---|---|
| 1.1 | Go to `/sign-in` | Form shows email + “Stay signed in” |
| 1.2 | Enter Account **A** email → submit | “Check your email” / code entry appears |
| 1.3 | Prefer **verification code** from the email if the link burns in a mail scanner | You land on `/leagues` (or `next` destination) |
| 1.4 | Header shows **Leagues** + your email chip | Session sticky after refresh |
| 1.5 | Sign out → protected route `/leagues` | Redirects to `/sign-in?next=…` |

### Scenario 1B — Remember device

| Step | Action | Pass when |
|---|---|---|
| 1.6 | Sign in with “Stay signed in” checked | Close tab, reopen `/leagues` → still signed in |
| 1.7 | Sign out, sign in with remember **unchecked**, close browser session | Next open asks for sign-in again |

- [ ] Phase 1 done

---

## Phase 2 — League create → invite → join

Use fixture tournament **US Open** / `uso-2026` when the form offers it (16-draw seed). Prefer **single** league for Daily Check testing.

### Scenario 2A — Commissioner creates league

| Step | Action | Pass when |
|---|---|---|
| 2.1 | `/leagues/new` | Four decisions form loads |
| 2.2 | Name league, format **single**, pick US Open (or season), visibility private | Create succeeds |
| 2.3 | Land on league home `/leagues/[slug]` | Title = league name; **Daily Check** is first focus block under header |
| 2.4 | Members list shows **You** as Commissioner | Count = 1 |

### Scenario 2B — Invite + second member

| Step | Action | Pass when |
|---|---|---|
| 2.5 | Commissioner: **Invite friends** → copy link | URL looks like `/join/[token]` |
| 2.6 | Incognito / Account **B**: open invite → sign in | Auto-join or Join button works |
| 2.7 | Account **B** lands on same league home | Members = 2; B is Member |
| 2.8 | Commissioner: **Revoke and re-issue** | Old link fails; new link works |

### Scenario 2C — Calendar → league tournament

| Step | Action | Pass when |
|---|---|---|
| 2.9 | `/tournaments` → click **US Open** row | Opens `/leagues/[slug]/t/uso-2026` (or prompts Start league if none) |
| 2.10 | League home → Tournaments list → Open | Same tournament hub |

- [ ] Phase 2 done

---

## Phase 3 — Bracket fill, confidence, submit

Do as Account **A**, then repeat essentials as **B**.

### Scenario 3A — Open bracket

| Step | Action | Pass when |
|---|---|---|
| 3.1 | Tournament hub → **Open my bracket** (draw must be published) | `/…/bracket` loads tree |
| 3.2 | If “draw pending” | Publish fixture draw in DB / founder tools before continuing |

### Scenario 3B — Picks + autosave

| Step | Action | Pass when |
|---|---|---|
| 3.3 | Pick winners round by round | UI reflects selection |
| 3.4 | Wait ~1s after a pick | Status shows saved / no error toast |
| 3.5 | Refresh page | Picks persist |

### Scenario 3C — Confidence (CEO Tier 1)

| Step | Action | Pass when |
|---|---|---|
| 3.6 | Pick a Round-1 winner | **1–5** confidence controls appear on that match |
| 3.7 | Change confidence → wait ~1s | **Saved** |
| 3.8 | Change an early pick that clears a later path | Downstream confidence cleared |

### Scenario 3D — Submit

| Step | Action | Pass when |
|---|---|---|
| 3.9 | Complete every match → **Submit** | Bracket marked submitted |
| 3.10 | Return to tournament hub | CTA becomes Review / View; entry copy reflects submitted |
| 3.11 | Repeat 3.3–3.9 for Account **B** | Two submitted brackets in league |

- [ ] Phase 3 done

---

## Phase 4 — Lock → results → settlement → standings

Commissioner (Account **A**) unless noted.

### Scenario 4A — Lock

| Step | Action | Pass when |
|---|---|---|
| 4.1 | On bracket or tournament UI, **Lock** (commissioner) | Lock succeeds (needs migration `0007` for season leagues) |
| 4.2 | As Member **B**, open bracket | Picks read-only; confidence visible, not editable |

### Scenario 4B — Official results + settle

| Step | Action | Pass when |
|---|---|---|
| 4.3 | Tournament page: enter / save **official results** (commissioner or founder) | Results saved without error |
| 4.4 | **Run settlement** | Completes; event standings populate |
| 4.5 | Standings show scores + places for A and B | Your row labelled **You** |
| 4.6 | Change one official result → Run settlement again | Positions / **Move** chips update (`+N` / `−N` / `—`) |

### Scenario 4C — Result artifact

| Step | Action | Pass when |
|---|---|---|
| 4.7 | Tournament → **See my result** | `/…/result` shows place, score, % of perfect, champion |
| 4.8 | Season standings `/leagues/[slug]/season` | Rows present for season leagues; empty/honest for single if unused |

- [ ] Phase 4 done

---

## Phase 5 — Daily Check (product core)

On league home `/leagues/[slug]` — Daily Check must be the **first** big block under the header (night scoreboard / pulse).

| Step | Setup | Pass when |
|---|---|---|
| 5.1 | League with draw pending event | Pulse: ready / draw-pending family copy |
| 5.2 | You submitted; others not / not locked | Awaiting-entries style copy |
| 5.3 | After settlement with rank change | Headline / beats mention movement; matches standings Δ |
| 5.4 | Settlement with no Δ | Quiet-day family copy |
| 5.5 | Pulse CTA buttons | Open bracket / invite / result as labelled |
| 5.6 | Engagement strip (after settle) | Health: Elite / Surviving / Hanging On / In Trouble (when data exists) |
| 5.7 | Perfect remaining | Shows when snapshots allow |
| 5.8 | Highlights (≥2 members + data) | Climber / Collapse / Upset King / Cold Streak when rules fire |

- [ ] Phase 5 done

---

## Phase 6 — Live poll + 128 smoke (local public-window)

| Step | Action | Pass when |
|---|---|---|
| 6.1 | Open tournament hub with draw published; wait ~45s | Soft refresh (standings) without full navigation |
| 6.2 | Season page with rows; wait ~45s | Same soft refresh |
| 6.3 | Draw-pending / empty season | No useless refresh loop |
| 6.4 | `/showcase` | 128-draw smoke loads; horizontal scroll to Final |
| 6.5 | Showcase: pick early match + confidence | UI responds (local only; may not persist to DB) |
| 6.6 | Real `uso-2026` bracket still pick/save after showcase | Fixture path still works |

- [ ] Phase 6 done

---

## Phase 7 — Ops, i18n, polish (local)

Set `FOUNDER_EMAILS=you@example.com` in `.env.docker`, then recreate:

```bash
docker compose --env-file .env.docker up --build -d
```

| Step | Action | Pass when |
|---|---|---|
| 7.1 | Signed out → `/founder` | Redirect sign-in |
| 7.2 | Signed in as founder email → `/founder` | Health counts (leagues, members, brackets, snapshots…) |
| 7.3 | `/founder/disruption` | Void form fields present; preview says void not miss |
| 7.4 | Submit void as commissioner → re-settle | Voided picks do not score as misses |
| 7.5 | Non-founder email with `FOUNDER_EMAILS` set | Denied + error note |
| 7.6 | Footer locale **en / es / ja** | Landing + nav language changes; refresh keeps locale |
| 7.7 | DevTools → Offline | Offline banner appears |
| 7.8 | Back online | Banner clears / app usable |

- [ ] Phase 7 done

---

## Phase 8 — Regression smoke (fast pass)

Run after any UI or schema change. ~15 minutes if data already exists.

| # | Path | Check |
|---|---|---|
| R1 | `/` | Brand hero + primary CTA |
| R2 | `/sign-in` | Send code works |
| R3 | `/leagues` | List clickable; status not fake-only |
| R4 | `/leagues/[slug]` | Daily Check first; invite; tournaments; members |
| R5 | `/tournaments` | **Rows are links** → league tournament or new league |
| R6 | `/leagues/[slug]/t/uso-2026` | Bracket CTA + standings + settle (commissioner) |
| R7 | `…/bracket` | Pick, confidence, submit / lock states |
| R8 | `…/result` | Artifact after settlement |
| R9 | `/showcase` | 128 smoke |
| R10 | `/founder` | Gate + counts when configured |

- [ ] Phase 8 done

---

## Suggested full-day order

```text
0 Boot + migrations + verify-math
1 Auth (A)
2 Create league + invite B
3 Fill brackets A + B (confidence)
4 Lock → official results → settle → standings → result
5 Daily Check states (revisit league home after each settle)
6 Live poll + showcase
7 Founder / locale / offline
8 Fast regression smoke
```

When **0–7** pass, mark Phase 10 complete in [STATUS.md](./STATUS.md).

---

## Command card

```bash
# Dev
docker compose --env-file .env.docker up --build

# Background
docker compose --env-file .env.docker up --build -d

# Logs
docker compose --env-file .env.docker logs -f web

# Stop
docker compose --env-file .env.docker down

# Migrations (needs DATABASE_URL)
docker compose --env-file .env.docker --profile migrate run --rm migrate

# Settlement math (no DB)
docker compose --env-file .env.docker --profile verify run --rm verify-math
```

| URL | Why |
|---|---|
| `/` | Landing |
| `/sign-in` | Auth |
| `/leagues` | League list |
| `/leagues/new` | Create |
| `/leagues/[slug]` | Daily Check |
| `/leagues/[slug]/t/uso-2026` | Tournament hub |
| `/leagues/[slug]/t/uso-2026/bracket` | Bracket editor |
| `/leagues/[slug]/t/uso-2026/result` | Result artifact |
| `/leagues/[slug]/season` | Season standings |
| `/tournaments` | Calendar |
| `/join/[token]` | Invite |
| `/showcase` | 128 smoke |
| `/founder` | Ops health |
| `/founder/disruption` | Voids |

---

## Troubleshooting (local)

| Symptom | What to try |
|---|---|
| Magic link “already used” | Use the **verification code** on `/sign-in` instead of the URL |
| Auth redirect fails | Supabase URL config must allow `http://localhost:3001/auth/callback` |
| Missing tables / RPC | Re-run migrations through `0007` |
| Lock fails on season league | Apply `0007_lock_season_commissioner.sql` |
| Calendar rows do nothing | Rebuild/refresh — rows must be `<Link>`s (not static divs) |
| Daily Check stuck on draw pending (season) | Prefer a **single** league bound to `uso-2026` for pulse tests |
| Stale UI after CSS/code change | Hard refresh; or `docker compose --env-file .env.docker up --build` |
| Email rate limit | Wait; try another inbox; or Supabase custom SMTP later (Phase 11) |
