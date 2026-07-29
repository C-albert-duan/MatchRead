# Analytics plan

> **Specification, not documentation.** `apps/web` sends no events today. PostHog exists only in
> `apps/mobile`. This is the taxonomy to build, once, before the beta opens — a beta you cannot
> measure teaches you less than it costs.

**Platform: PostHog, EU region.** One product, chosen because the mobile app already uses it, so
event names are shared rather than translated later. Follow `EXPO_PUBLIC_POSTHOG_*` naming.
**Session replay: off.** It records bracket picks, which are secret until lock by design and
enforced in the database — recording them into a third party would defeat a guarantee the schema
exists to make. Retention: 12 months.

## The rule for what to track

The product's own test questions are *"does this make the user care more about tomorrow's
matches?"* and *"does this help the user understand themselves better?"* Track what answers those.
**Not every click.** An event that no dashboard in §4 consumes should not be sent.

## 1. Never send these

| Never | Why |
|---|---|
| Email addresses | Identify by `distinct_id` = user UUID. PostHog does not need the address |
| **Raw invite tokens** | A credential. It appears in `/join/{token}`, so **URL capture must be configured to strip the path segment** — the commonest way this leaks is autocapture of a pathname |
| Bracket pick contents | Secret until lock, enforced by RLS. Send *counts*, never *who* |
| Private league names | Send the slug hash or nothing. A private league's name is something the league chose not to publish |
| Any service-role value | |
| Free-text | Especially the operator's disruption reason, which is an audit record |

Autocapture **off**. It captures text content and pathnames, and both of the first two rules die
to it.

## 2. The event taxonomy

Every event carries `locale` and `viewport` (`mobile` \| `desktop`). Identity required unless
noted.

### Acquisition — anonymous until sign-in completes

| Event | Trigger | Properties |
|---|---|---|
| `landing_viewed` | `/` render | `referrer_host` |
| `showcase_opened` | `/showcase` render | |
| `invite_opened` | `/join/{token}` render | `valid` (bool). **No token** |
| `signin_started` | Link requested | |
| `signin_completed` | Callback succeeds | `is_new_user` |

`signin_started` → `signin_completed` is the conversion that tells you whether email delivery
works. **It is the single most important ratio in the beta**, because a silent SMTP problem looks
like disinterest.

### League activation

`league_created` (`format`, `tournament_count`) · `invite_generated` ·
`invite_accepted` (`member_count_after`) · `member_joined`

`league_created` → a second `member_joined` is the number that separates a product from a demo. A
league of one is a spreadsheet.

### Bracket activation — the funnel that matters most

| Event | Properties |
|---|---|
| `bracket_started` | `draw_size` |
| `bracket_first_pick` | `seconds_since_started` |
| `bracket_autosaved` | `picks_made` |
| `bracket_resumed` | `picks_made`, `hours_since_last` |
| `bracket_completed` | `draw_size`, `minutes_elapsed` |
| `bracket_submitted` | `hours_before_lock` |
| `bracket_unsubmitted` | |
| `bracket_locked_unsubmitted` | `picks_made`, `draw_size` |

**`bracket_completed` without `bracket_submitted` is the event to build a dashboard around.** An
unsubmitted bracket scores zero, the rule is deliberate, and the cost is real: with no
notifications the only nag is a page the member has to choose to open. `bracket_locked_unsubmitted`
counts the people that rule cost.

`COMPETITIVE_REVIEW.md` records that onboarding is slower than the category leader —
sign in, create or join, choose a tournament, fill 31 slots, submit. This funnel is how you find
out where.

### Engagement

`league_viewed` (`days_since_last`) · `tournament_viewed` · `standings_viewed` ·
`between_state_viewed` · `artifact_viewed` (`tone`) · `artifact_shared` (`method`)

| Event | Properties | Note |
|---|---|---|
| `daily_check_shown` | `check_kind`, `lead_beat_key`, `beat_count`, `reason_to_return` | **The core retention instrument** |

`lead_beat_key` is locale-independent by design, so it is comparable across languages — that
property exists so `daily_check_log` keeps working across a language change, and it makes this
event analysable for free.

**`reason_to_return: false` is the most valuable boolean in this taxonomy.** `reasonToReturn`
exists in core precisely so "this day left nothing to come back for" is detectable in code, and
today nothing measures it. `daily_check_log` persists only the *leading* beat, so the Founder
Dashboard reports proxies; this event is how that stops being a proxy.

### Operational quality

`autosave_failed` (`attempt`) · `invite_copy_failed` (`reason`) · `page_error` (`route`,
`digest`) · `auth_failed` (`stage`) · `settlement_stale` (`minutes`) · `provider_stale`
(`minutes`)

Overlaps Sentry deliberately. Sentry tells you an exception happened; these tell you **how many
members it happened to**, which is the number that decides whether to roll back.

## 3. Beta dashboards

| Dashboard | Answers |
|---|---|
| **Activation** | `landing_viewed` → `signin_completed` → `league_created`/`invite_accepted` → `bracket_submitted` |
| **Bracket completion** | Started → first pick → completed → submitted, split by `draw_size`. Where do people stop? |
| **Retention** | Return rate D1/D3/D7, split by `reason_to_return` on the last check |
| **Daily Check engagement** | `lead_beat_key` distribution; return rate per beat kind. **Which beats actually bring people back** |
| **League growth** | Leagues with > 1 member; median size; invite accept rate |
| **Commissioner behaviour** | Invites per league, weight changes, promotions to season |
| **Sharing** | `artifact_viewed` → `artifact_shared` by `tone`. Does the *eleventh-place* card get sent? |

The last one tests the artifact's whole design argument: four tones exist because an artifact that
only works for the winner is a feature for one person in fourteen. If only `won` is ever shared,
that argument is wrong and the product should know.

**Retention split by `reason_to_return` is the experiment the product was built to run.** The
Constitution's seventh criterion — *feel excited to return tomorrow* — has a mechanism that is
designed, implemented, tested against fixtures, and **has never run against a real fortnight of
tennis.** This dashboard is how that stops being true.

## 4. Implementation notes

Identify on `signin_completed` with the user UUID and never the email. Alias the anonymous id so
pre-sign-in acquisition events join to the member.

Send server-side from Server Actions and Server Components where the event is a *fact* — a
submission, a settlement — and client-side only where it is an *interaction*. A client-side
`bracket_submitted` is a claim the member's browser makes; a server-side one is what happened.

Gate on `MATCHREAD_ENV`. A staging project pointed at the production PostHog is how a beta's
numbers stop meaning anything, and it is the same failure `MATCHREAD_ENV` exists to prevent for the
listener.
