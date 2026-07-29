# Known Risks

Carried from wireframe / engineering handoff. Update as items close.

## 1. Settlement is not scheduled (blocker for standings)

Until something invokes settlement: no result freezes into a league, `previous_score` stays null, Daily Check stays quiet, season standings never move.

→ [runbooks/SETTLEMENT-SCHEDULING.md](./runbooks/SETTLEMENT-SCHEDULING.md)

## 2. No deployable ingestion listener (deferrable for beta)

Without an always-on socket process, results arrive only via REST reconciliation — scores lag. Acceptable for invited beta; not for public live launch.

→ [runbooks/RAILWAY-WORKER.md](./runbooks/RAILWAY-WORKER.md)

## 3. 72-hour bracket window

Every US Open bracket is entered between draw (~27 Aug) and lock (~11:00 ET 30 Aug). Builder must be proven before draw day. League invites must ship weeks earlier — **Draw pending** is a designed product state.

## 4. Auth never proven until first deployed project

Magic link against real Supabase redirect allow-list + SMTP must be verified early (Phase 1).

## 5. Provider / draw integrity

Provider is trusted for scores and schedule — never for tennis rules or bracket topology. Import must fail closed if reconstruction is unverifiable.

→ [runbooks/TENNIS-PROVIDER.md](./runbooks/TENNIS-PROVIDER.md)

## 6. Email rate limits

Magic link is the only auth method. Invite waves will hit Supabase default sender limits — plan SMTP.
