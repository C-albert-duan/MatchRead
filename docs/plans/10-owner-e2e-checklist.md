# Phase 10 — Owner E2E checklist

**Goal:** Sign off build phases **5–8** and CEO **Tier 1** on a running Docker app.  
**Plan:** [09-completion-to-launch § Phase 10](./09-completion-to-launch.md#phase-10--owner-e2e-sign-off)

This is the **single walkthrough** for Phase 10. Legacy detail lists are in [archive/](./archive/); check boxes **here** when you pass.

**App:** [http://localhost:3001](http://localhost:3001)

---

## 0. Start here (once)

```bash
cp .env.docker.example .env.docker   # if missing — real anon key required
docker compose --env-file .env.docker up --build
```


| #   | Check        | How                                                                                                                                                                       |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | App loads    | Open `/` → landing renders                                                                                                                                                |
| 0.2 | Signed in    | Magic link from `/sign-in` → land on `/leagues` (SMTP/quota permitting)                                                                                                   |
| 0.3 | Schema       | Migrations `0001`–`0009` on project `opugihofwvunwkpcmboq` (SQL Editor or `docker compose --env-file .env.docker --profile migrate run --rm migrate` with `DATABASE_URL`) |
| 0.4 | Math dry-run | `docker compose --env-file .env.docker --profile verify run --rm verify-math` → prints `Settlement math dry-run passed.`                                                  |


- [x] 0.1–0.4 done

---



## A. Fixture loop (prereq for Daily Check + Tier 1)

Use a **season or single** league with fixture tournament `uso-2026` (16-draw seed).


| #   | Check                                              | How                                                                                 |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A.1 | Create / open league                               | `/leagues/new` or existing league home                                              |
| A.2 | Second member (optional but needed for Highlights) | Invite link → join as another account/incognito                                     |
| A.3 | Fill + submit brackets                             | Open US Open bracket → pick winners → Submit                                        |
| A.4 | Lock (commissioner)                                | Lock on tournament / bracket if available                                           |
| A.5 | Run settlement                                     | Commissioner **Run settlement** on tournament page                                  |
| A.6 | Standings moved                                    | Event standings show scores; Move chips appear after a **second** settlement with Δ |


- [ ] A.1–A.6 done (or reused from prior local E2E)

---



## B. Phase 5 — Daily Check


| #   | Check           | How                                                                              |
| --- | --------------- | -------------------------------------------------------------------------------- |
| B.1 | Pulse first     | League home: Daily Check is the **first** block under the title                  |
| B.2 | Draw pending    | League with Wimbledon / no-draw tourney → “Your league is ready” (or equivalent) |
| B.3 | Awaiting        | After you submit, before others / lock → awaiting-entries style copy             |
| B.4 | Movement        | After settlement with rank change → headline Δ matches standings Move            |
| B.5 | Quiet           | No Δ → “A quiet day in your league” (or quiet family)                            |
| B.6 | CTAs            | Pulse buttons open bracket / invite / result as labelled                         |
| B.7 | Result artifact | `/leagues/[slug]/t/uso-2026/result` — place, score, % of perfect, champion       |
| B.8 | See my result   | Tournament page link **See my result** works after snapshots exist               |


- [ ] Section B pass

---



## C. Phase 6 — CEO Tier 1


| #   | Check             | How                                                                                                    |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| C.1 | Confidence UI     | Pick a R1 winner → **1–5** buttons appear on that match                                                |
| C.2 | Save              | Change confidence → wait ~1s → status **Saved**                                                        |
| C.3 | Downstream clear  | Change an early pick → later confidence for cleared path is gone                                       |
| C.4 | Locked            | After lock: confidence visible, not editable                                                           |
| C.5 | Health            | After settlement: Elite / Surviving / Hanging On / In Trouble on league home                           |
| C.6 | Perfect remaining | Perfect picks left + league perfect count when snapshots exist                                         |
| C.7 | Highlights        | With **≥2** members + settlement data: Climber / Collapse / Upset King / Cold Streak (when rules fire) |
| C.8 | Beats             | Daily Check can mention health and/or biggest miss                                                     |
| C.9 | Move chips        | Event standings Move column: `+N` / `−N` / `—`                                                         |


- [ ] Section C pass

---



## D. Phase 7 — Ops · i18n · Polish

Optional: set `FOUNDER_EMAILS=your@email.com` in `.env.docker`, recreate web container.


| #    | Check             | How                                                                                    |
| ---- | ----------------- | -------------------------------------------------------------------------------------- |
| D.1  | Auth gate         | Signed out → `/founder` redirects to sign-in                                           |
| D.2  | Health counts     | Signed in → leagues, members, submitted brackets, snapshots, results, last `ranked_at` |
| D.3  | Service-role note | Founder page shows no-service-role-in-browser note                                     |
| D.4  | Disruption link   | Opens `/founder/disruption`                                                            |
| D.5  | Email deny        | With `FOUNDER_EMAILS` set to someone else → denied + ErrorNote                         |
| D.6  | Void form         | Fields: tournament, player_ref, from_round, reason                                     |
| D.7  | Preview           | Copy says void (lose pick), not miss                                                   |
| D.8  | Submit void       | Creates `pick_voids` (you must be commissioner on that tournament)                     |
| D.9  | Re-settle         | Prompt to re-run settlement; voided picks do not score as misses                       |
| D.10 | Locale            | Footer **en / es / ja** changes landing + nav; refresh keeps locale                    |
| D.11 | Translations      | es/ja are real (not English) for landing / nav / founder / offline                     |
| D.12 | Offline           | DevTools → Offline → banner appears                                                    |
| D.13 | Errors            | Denied founder shows ErrorNote                                                         |


- [ ] Section D pass

---



## E. Phase 8 — Public window (local)


| #   | Check                | How                                                                                                                       |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| E.1 | Math                 | Same as **0.4** — verify-math exits 0                                                                                     |
| E.2 | Live poll tournament | Open `/leagues/[slug]/t/uso-2026` with draw → wait ~45s without full navigation; network/refresh soft-updates (standings) |
| E.3 | Live poll season     | Season page with rows → same ~45s refresh                                                                                 |
| E.4 | No poll when idle    | Draw-pending tournament / empty season → no useless refresh loop                                                          |
| E.5 | Settlement Δ         | Re-run settlement → Move chips / positions update                                                                         |
| E.6 | 128 smoke            | Open **/showcase** → scroll horizontally to **Final**; pick an early-round match + confidence (local only)                |
| E.7 | Fixture pick/save    | On real `uso-2026` bracket, pick + save still works                                                                       |
| E.8 | Showcase loads       | `/showcase` page title + 128 smoke visible                                                                                |


- [ ] Section E pass

---



## Pass criteria


| Result                           | Action                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------- |
| **All sections 0 + A–E checked** | Update [STATUS.md](../STATUS.md): phases 5–8 → **Done**; Phase 10 → **Done** |
| Gaps found                       | File issues / fix code; leave STATUS as “E2E in progress”                    |
| Production / Vercel / SMTP       | **Out of scope** for Phase 10 → Phase 11                                     |


---



## Quick command card

```bash
# Dev app
docker compose --env-file .env.docker up --build

# Settlement math (no DB)
docker compose --env-file .env.docker --profile verify run --rm verify-math

# Migrations (needs DATABASE_URL in .env.docker)
docker compose --env-file .env.docker --profile migrate run --rm migrate
```


| URL                                  | Why                               |
| ------------------------------------ | --------------------------------- |
| `/sign-in`                           | Auth                              |
| `/leagues`                           | Home list                         |
| `/leagues/[slug]`                    | Daily Check + Tier 1 strip        |
| `/leagues/[slug]/t/uso-2026`         | Tournament + settle + LiveRefresh |
| `/leagues/[slug]/t/uso-2026/bracket` | Confidence + picks                |
| `/leagues/[slug]/t/uso-2026/result`  | Result artifact                   |
| `/founder` · `/founder/disruption`   | Ops                               |
| `/showcase`                          | 128-draw H-scroll smoke           |


---



## What Phase 10 implemented in-repo (engineering assist)

Code/docs shipped so this checklist is runnable without host Node:

- `/showcase` **128-draw smoke** (`ShowcaseBracket128`) — no DB seed required for H-scroll / early picks
- Compose profile `verify` → `verify-math` runs `scripts/verify-settlement-math.mjs`
- `scripts/` bind-mounted into `web` for in-container `node scripts/…`
- This checklist document

