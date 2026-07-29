# Runbook — Tennis provider (RapidAPI)

External dependency for live calendar, draws, and scores.

## Trust boundary

| Provider trusted for | Never trusted for |
|---|---|
| Match status, score, winner | Tennis rules / scoring formula |
| Player identity, ranking | Bracket topology (verify reconstruction) |
| Schedule / start times | What retirement means for a pick |
| Draw entries / seeds | Anything asserted without core verification |

Import must **fail closed** if draw reconstruction is unverifiable.

## Day-one confirmation

- [ ] RapidAPI product name / URL recorded
- [ ] Tier and monthly quota
- [ ] Terms allow commercial/public use
- [ ] Rate limits known
- [ ] Key stored only in listener / edge secrets — never Vercel web env

## Beta without live socket

Use REST reconciliation sweep on an interval. Scores lag; document that to invitees. Live listener is [RAILWAY-WORKER.md](./RAILWAY-WORKER.md).
