# Runbook — Tennis provider (RapidAPI)

External dependency for live calendar, draws, and scores.

**Integration plan:** [plans/15-rapidapi-tennis-provider.md](../plans/15-rapidapi-tennis-provider.md)

## Product (current)

| Field | Value |
|---|---|
| Product | Tennis API - ATP WTA ITF |
| Host (`RAPIDAPI_HOST`) | `tennis-api-atp-wta-itf.p.rapidapi.com` |
| Auth | `X-RapidAPI-Key` + `X-RapidAPI-Host` |
| Example | `GET https://$RAPIDAPI_HOST/tennis/v2/atp/ranking/singles?race=true` |

**Never commit the key.** Rotate if it was pasted into chat or a screenshot. Store only in local/Railway secrets — **not** on Vercel.

## Trust boundary

| Provider trusted for | Never trusted for |
|---|---|
| Match status, score, winner | Tennis rules / scoring formula |
| Player identity, ranking | Bracket topology (verify reconstruction) |
| Schedule / start times | What retirement means for a pick |
| Draw entries / seeds | Anything asserted without core verification |

Import must **fail closed** if draw reconstruction is unverifiable.

## Day-one confirmation

- [x] RapidAPI product name / host recorded (above)
- [x] Basic plan subscribed (50 req/day) — upgrade before production sweep
- [ ] Terms allow commercial/public use
- [ ] Rate limits known (Basic: hard 50/day; check Pricing for RPS)
- [x] Key stored in gitignored `.env.provider` — never Vercel web env
- [ ] Key rotated after any chat/screenshot exposure

### Manual probe

```bash
curl -s -H "X-RapidAPI-Key: $RAPIDAPI_KEY" -H "X-RapidAPI-Host: $RAPIDAPI_HOST" \
  "https://$RAPIDAPI_HOST/tennis/v2/atp/ranking/singles?race=true" | head -c 400
```

## Beta without live socket

Use REST reconciliation sweep on an interval. Scores lag; document that to invitees.

**Real-world results on Vercel:** [plans/16-rapidapi-reconcile.md](../plans/16-rapidapi-reconcile.md) — RapidAPI stays off Vercel; worker → `ingest-events` → settle → web.

Live listener is [RAILWAY-WORKER.md](./RAILWAY-WORKER.md).
