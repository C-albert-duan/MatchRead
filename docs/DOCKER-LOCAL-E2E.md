# Docker local E2E — step-by-step scenarios

**Purpose:** Practical whole-product walkthrough on **Docker only** (no Vercel, no Preview deploy).  
**App:** [http://localhost:3001](http://localhost:3001)  
**Related sign-off checklist:** [plans/10-owner-e2e-checklist.md](./plans/10-owner-e2e-checklist.md)

Use two browser profiles (or one normal + one Incognito) when a step needs a second member.

Actions below use **buttons and labels you see on screen**, not app routes.

---

## Out of scope (skip until Vercel / Phase 11+)

- Vercel Preview / Production magic-link redirects
- Custom SMTP on a deployed host (local Supabase email / OTP code is enough)
- Always-on Railway socket / ingest cron against production domain
- Private-beta invite wave to real friends on a public URL

---



## Accounts to prepare


| Role                 | How                                             |
| -------------------- | ----------------------------------------------- |
| **A — Commissioner** | Your main email                                 |
| **B — Member**       | Second email (or Incognito + different address) |


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


| Step  | Action                                                                                                                                                              | Pass when                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 0.1.1 | Open [http://localhost:3001](http://localhost:3001) in the browser                                                                                                  | Landing shows **MatchRead** as the big brand title                   |
| 0.1.2 | On the landing page, open the tournament calendar (from the calendar list / **Calendar** in the header after sign-in, or the event rows under the calendar section) | You see Roland Garros, Wimbledon, and US Open (or your seeded names) |




### 0.2 Apply migrations (once per Supabase project)

Prefer SQL Editor paste of `supabase/migrations/0001_*.sql` … `0009_*.sql` **in order**, or:

```bash
docker compose --env-file .env.docker --profile migrate run --rm migrate
```

Migrations `0001`–`0009` are **idempotent** — safe to re-paste in order if unsure. They will not wipe league data, draw seats that already exist, or commissioner-entered match results.

**If settlement only grades the commissioner:** apply `0008_commissioner_read_brackets.sql` (commissioners can read all league brackets), then **Run settlement** again.

**If standings show hex IDs:** apply `0009_display_names.sql`, then each member sets a display name on sign-in or at `/welcome`.


| Step  | Action                             | Pass when                                                                          |
| ----- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| 0.2.1 | Apply migrations through `0007`    | Later bracket / lock / settle steps do not hit missing-table or missing-RPC errors |
| 0.2.2 | Run the math dry-run command below | Terminal prints `Settlement math dry-run passed.`                                  |


```bash
docker compose --env-file .env.docker --profile verify run --rm verify-math
```

- [ ] Phase 0 done

---



## Phase 1 — Sign-in (local auth)



### Scenario 1A — Magic link / verification code


| Step | Action                                                                                                                                         | Pass when                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1.1  | On the landing page, click **Sign in** (header)                                                                                                | You see **Sign in to MatchRead**, email field, and **Stay signed in on this device** |
| 1.2  | Enter Account **A** email → click the send / continue button                                                                                   | Screen changes to **Check your email** / verification code entry                     |
| 1.3  | Prefer typing the **verification code** from the email, then click **Verify code** (use the email link only if your mail app does not burn it) | You land on **My leagues** (or the page you were heading to)                         |
| 1.4  | Confirm header shows **Leagues** and **Signed in as** your email                                                                               | Refresh the page — you stay signed in                                                |
| 1.5  | Click **Sign out**, then click **Leagues** (or **Go to my leagues**)                                                                           | You are sent back to **Sign in to MatchRead**                                        |




### Scenario 1B — Remember device


| Step | Action                                                                                           | Pass when                                                          |
| ---- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1.6  | Sign in again with **Stay signed in on this device** checked                                     | Close the tab, reopen the app, click **Leagues** — still signed in |
| 1.7  | Click **Sign out**, sign in again with **Stay signed in** unchecked, then fully quit the browser | Next open asks you to sign in again                                |


- [x] Phase 1 done

---



## Phase 2 — League create → invite → join

Use fixture tournament **US Open 2026** when the form offers it (16-draw seed). Prefer a **single** league for Daily Check testing.

### Scenario 2A — Commissioner creates league


| Step | Action                                                                                                 | Pass when                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 2.1  | Click **Start a league** (landing header, or **My leagues** page)                                      | **Start a league** form loads with the four decisions                                   |
| 2.2  | Enter a name, choose **single**, pick **US Open 2026** (or season), set visibility **private**, submit | Create succeeds and you leave the form                                                  |
| 2.3  | You arrive on the league home                                                                          | Page title is your league name; **Daily Check** is the first big block under the header |
| 2.4  | Scroll to **Members**                                                                                  | You see **You** as Commissioner; count = 1                                              |




### Scenario 2B — Invite + second member


| Step | Action                                                                               | Pass when                                                 |
| ---- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 2.5  | As commissioner, click **Invite friends** → **Copy invite link**                     | Button shows **Copied** (or you can select the link text) |
| 2.6  | In Incognito / Account **B**: paste the invite link → sign in (and join if prompted) | Auto-join or **Join** succeeds                            |
| 2.7  | Account **B** opens the same league                                                  | **Members** shows 2 people; B is Member                   |
| 2.8  | Back as commissioner: **Revoke and re-issue**, then try the old link as B            | Old link fails; the new link works                        |




### Scenario 2C — Calendar → league tournament


| Step | Action                                                                                    | Pass when                                                                                          |
| ---- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 2.9  | Click **Calendar** in the header → click the **US Open 2026** row (**Open**)              | Tournament page opens inside your league (or you are asked to **Start a league** if you have none) |
| 2.10 | From league home, under **Tournaments**, click the US Open row (**Draw open** / **Open**) | Same tournament hub                                                                                |


- [x] Phase 2 done

---



## Phase 3 — Bracket fill, confidence, submit

Do as Account **A**, then repeat essentials as **B**.

### Scenario 3A — Open bracket


| Step | Action                                                                                  | Pass when                                                                             |
| ---- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 3.1  | On the tournament page, click **Open my bracket** (draw must show as open, not pending) | Bracket tree editor loads                                                             |
| 3.2  | If you only see **Draw pending**                                                        | Finish Phase 0 migrations / fixture seed, then return — US Open should show draw open |




### Scenario 3B — Picks + autosave


| Step | Action                           | Pass when                                  |
| ---- | -------------------------------- | ------------------------------------------ |
| 3.3  | Click winners round by round     | Each pick highlights / updates in the tree |
| 3.4  | Wait about 1 second after a pick | Status shows saved (or no error)           |
| 3.5  | Refresh the browser              | Your picks are still there                 |




### Scenario 3C — Confidence (CEO Tier 1)


| Step | Action                                          | Pass when                                         |
| ---- | ----------------------------------------------- | ------------------------------------------------- |
| 3.6  | Pick a Round-1 winner                           | **1–5** confidence buttons appear on that match   |
| 3.7  | Change a confidence value → wait about 1 second | Status shows **Saved**                            |
| 3.8  | Change an early pick that clears a later path   | Downstream confidence on the cleared path is gone |




### Scenario 3D — Submit


| Step | Action                                                 | Pass when                                                                                     |
| ---- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 3.9  | Fill every match → click **Submit**                    | Bracket is marked submitted                                                                   |
| 3.10 | Click **Tournament** (or back) to the tournament hub   | Primary button becomes **Review my bracket** / **View my bracket**; entry copy says submitted |
| 3.11 | Repeat pick → confidence → **Submit** as Account **B** | Two people have submitted brackets                                                            |


- [x] Phase 3 done

---



## Phase 4 — Lock → results → settlement → standings

Commissioner (Account **A**) unless noted.

### Scenario 4A — Lock


| Step | Action                                                        | Pass when                                                   |
| ---- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| 4.1  | On the bracket page, as commissioner, click **Lock draw now** | Lock succeeds (needs migration `0007` for season leagues)   |
| 4.2  | As Member **B**, open the same bracket (**View my bracket**)  | Picks are read-only; confidence is visible but not editable |




### Scenario 4B — Official results + settle


| Step | Action                                                                             | Pass when                                  |
| ---- | ---------------------------------------------------------------------------------- | ------------------------------------------ |
| 4.3  | On the tournament page (commissioner or founder), fill / save **official results** | Saves without error                        |
| 4.4  | Click **Run settlement**                                                           | Completes; **Event standings** show scores |
| 4.5  | Read the standings table                                                           | A and B have places; your row says **You** |
| 4.6  | Change one official result → **Run settlement** again                              | **Move** chips update (`+N` / `−N` / `—`)  |




### Scenario 4C — Result artifact


| Step | Action                                                       | Pass when                                                                                 |
| ---- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 4.7  | On the tournament page, click **See my result**              | You see final place, score, % of perfect, and champion                                    |
| 4.8  | From league or tournament header, click **Season standings** | Season table shows rows for season leagues; empty/honest state for single leagues is fine |


- [x] Phase 4 done

---



## Phase 5 — Daily Check (product core)

On **league home** (open the league from **My leagues**), **Daily Check** must be the first big block under the header (night scoreboard / pulse).


| Step | Setup                                            | Pass when                                                                 |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| 5.1  | League whose event still says draw pending       | Pulse shows ready / draw-pending style copy                               |
| 5.2  | You submitted; others have not / draw not locked | Awaiting-entries style copy                                               |
| 5.3  | After settlement with a rank change              | Headline / beats mention movement; matches standings Move                 |
| 5.4  | Settlement with no movement                      | Quiet-day style copy                                                      |
| 5.5  | Click the Daily Check action buttons             | They open bracket / invite / result as labelled                           |
| 5.6  | After settle, check the engagement strip         | Health shows Elite / Surviving / Hanging On / In Trouble when data exists |
| 5.7  | Perfect remaining line                           | Shows when snapshots allow                                                |
| 5.8  | Highlights (≥2 members + data)                   | Climber / Collapse / Upset King / Cold Streak when rules fire             |


- [x] Phase 5 done

---



## Phase 6 — Live poll + 128 smoke (local public-window)


| Step | Action                                                            | Pass when                                                       |
| ---- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| 6.1  | Open a tournament with draw open; leave the page open ~45 seconds | Standings soft-refresh without a full navigation                |
| 6.2  | Open **Season standings** with rows; wait ~45 seconds             | Same soft refresh                                               |
| 6.3  | Open a draw-pending tournament or empty season standings          | No useless refresh loop                                         |
| 6.4  | On the landing page, click **See what it looks like**             | **128-draw smoke** page loads; scroll horizontally to **Final** |
| 6.5  | On that showcase, pick an early match and set confidence          | UI responds (local only; may not persist)                       |
| 6.6  | Go back to your real US Open bracket and pick / save again        | Fixture bracket still works                                     |


- [x] Phase 6 done

---



## Phase 7 — Ops, i18n, polish (local)

Set `FOUNDER_EMAILS=you@example.com` in `.env.docker`, then recreate:

```bash
docker compose --env-file .env.docker up --build -d
```

Founder / disruption pages are **ops tools** (not in the main header). Open them the way your team bookmarks local ops, then follow the on-screen titles below.


| Step | Action                                                                           | Pass when                                                      |
| ---- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 7.1  | Sign out, then open **Founder health**                                           | You are sent to **Sign in to MatchRead**                       |
| 7.2  | Sign in as the founder email → open **Founder health**                           | You see health counts (leagues, members, brackets, snapshots…) |
| 7.3  | Click **Draw disruption / void**                                                 | Void form fields are present; preview says void, not miss      |
| 7.4  | Submit a void as commissioner → return to tournament → **Run settlement** again  | Voided picks do not score as misses                            |
| 7.5  | Sign in as a non-founder while `FOUNDER_EMAILS` is set → open **Founder health** | Denied message / error note                                    |
| 7.6  | In the footer, switch locale **en / es / ja**                                    | Landing + nav language change; refresh keeps the locale        |
| 7.7  | DevTools → Offline                                                               | Offline banner appears                                         |
| 7.8  | Go back online                                                                   | Banner clears; app usable                                      |


- [x] Phase 7 done

---



## Phase 8 — Regression smoke (fast pass)

Run after any UI or schema change. ~15 minutes if data already exists.


| #   | Click through                      | Check                                                                        |
| --- | ---------------------------------- | ---------------------------------------------------------------------------- |
| R1  | Landing                            | Brand hero + primary **Start a league** / **Go to my leagues**               |
| R2  | Header **Sign in**                 | Send code / **Verify code** works                                            |
| R3  | Header **Leagues**                 | League rows open; status chips look real (e.g. Bracket open / Awaiting draw) |
| R4  | Open a league                      | Daily Check first; invite; tournaments; members                              |
| R5  | Header **Calendar**                | Rows open a tournament (or send you to start a league)                       |
| R6  | Tournament hub                     | Bracket button + standings + **Run settlement** (commissioner)               |
| R7  | **Open / Review my bracket**       | Pick, confidence, submit / lock states                                       |
| R8  | **See my result**                  | Place / score artifact after settlement                                      |
| R9  | Landing **See what it looks like** | 128-draw smoke                                                               |
| R10 | **Founder health** (ops)           | Gate + counts when configured                                                |


- [x] Phase 8 done

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



### Where things live in the UI


| Goal                      | How to get there                                               |
| ------------------------- | -------------------------------------------------------------- |
| Landing                   | Open the app                                                   |
| Sign in                   | Header **Sign in**                                             |
| My leagues                | Header **Leagues** or landing **Go to my leagues**             |
| Create league             | **Start a league**                                             |
| League home / Daily Check | Click a league row on **My leagues**                           |
| Tournament hub            | League **Tournaments** row, or header **Calendar** → event row |
| Bracket editor            | Tournament **Open my bracket** / **Review my bracket**         |
| Result                    | Tournament **See my result**                                   |
| Season standings          | **Season standings** on league or tournament                   |
| Calendar                  | Header **Calendar**                                            |
| Join via invite           | Paste the copied invite link (from **Invite friends**)         |
| 128 smoke                 | Landing **See what it looks like**                             |
| Founder health            | Ops bookmark (not in main nav) → title **Founder health**      |
| Voids                     | From Founder health → **Draw disruption / void**               |
| Display name              | Sign-in form, or **/welcome**                                  |


---



## Troubleshooting (local)


| Symptom                                    | What to try                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| Magic link “already used”                  | On **Sign in to MatchRead**, enter the **verification code** and click **Verify code** |
| Auth redirect fails                        | Supabase URL config must allow `http://localhost:3001/auth/callback`                   |
| Missing tables / RPC                       | Re-run migrations through `0008`                                                       |
| Lock fails on season league                | Apply `0007_lock_season_commissioner.sql`                                              |
| Settlement only grades commissioner        | Apply `0008_commissioner_read_brackets.sql`, then **Run settlement** again             |
| Standings show hex IDs                     | Apply `0009_display_names.sql`; open **/welcome** (or re-sign-in) to set a display name |
| Calendar rows do nothing                   | Hard refresh or rebuild Docker — rows should be clickable                              |
| Daily Check stuck on draw pending (season) | Prefer a **single** league for US Open when testing the pulse                          |
| Stale UI after CSS/code change             | Hard refresh; or `docker compose --env-file .env.docker up --build`                    |
| Email rate limit                           | Wait; try another inbox; or Supabase custom SMTP later (Phase 11)                      |


