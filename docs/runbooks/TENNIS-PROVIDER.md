# Runbook — Tennis provider (RapidAPI)

External dependency for live calendar, draws, and scores.

**Integration plan:** [plans/15-rapidapi-tennis-provider.md](../plans/15-rapidapi-tennis-provider.md)

## Product (current)

| Field | Value |
|---|---|
| Product | Tennis API - ATP WTA ITF |
| Plan | **Mega** ($99/mo) — WebSocket + premium |
| Host (`RAPIDAPI_HOST`) | `tennis-api-atp-wta-itf.p.rapidapi.com` |
| Auth | `X-RapidAPI-Key` + `X-RapidAPI-Host` |
| Example | `GET https://$RAPIDAPI_HOST/tennis/v2/atp/ranking/singles?race=true` |
| WS token | `GET /tennis/v2/extend/api/ws-token` → Socket.IO `https://live.matchstat.com` |
| Quota (Mega) | 3.8M req/mo · 50 req/s |

**Never commit the key.** Rotate if it was pasted into chat or a screenshot. Store only in local/Railway secrets — **not** on Vercel.

### Provider season ids (2026, from calendar)

| MatchRead ref | Tour | Provider id | Event |
|---|---|---|---|
| `nbo-mtl-2026` | atp | `21346` | National Bank Open Montreal |
| `nbo-tor-2026` | wta | `16739` | National Bank Open Toronto |
| `cin-2026` | atp | `21347` | Cincinnati Open |
| `cin-wta-2026` | wta | `16740` | Cincinnati Open |
| `wsal-2026` | atp | `21348` | Winston-Salem Open |
| `uso-2026` | atp | `21349` | US Open |
| `uso-wta-2026` | wta | `16743` | US Open |

## Trust boundary

| Provider trusted for | Never trusted for |
|---|---|
| Match status, score, winner | Tennis rules / scoring formula |
| Player identity, ranking | Invented slot order from match ids |
| Draw entries / seeds / official slot order | Anything asserted without a published draw sheet |
| Schedule / start times | Odds, predictions, or guessed kickoff clocks |

Import must **fail closed** if draw reconstruction is unverifiable.

## Day-one confirmation

- [x] RapidAPI product name / host recorded (above)
- [x] Mega plan subscribed (WebSocket token + high quota)
- [ ] Terms allow commercial/public use
- [x] Rate limits known (Mega: 3.8M/mo, 50 req/s; RapidAPI may also throttle per IP)
- [x] Key stored in gitignored `.env.provider` (local) or `npx supabase secrets set RAPIDAPI_KEY` (production) — never Vercel / GitHub
- [x] Key rotated after chat exposure (2026-08-12)

### Manual probe

```bash
curl -s -H "X-RapidAPI-Key: $RAPIDAPI_KEY" -H "X-RapidAPI-Host: $RAPIDAPI_HOST" \
  "https://$RAPIDAPI_HOST/tennis/v2/atp/ranking/singles?race=true" | head -c 400
```

## Beta without live socket

Use REST reconciliation sweep on an interval. Scores lag; document that to invitees.

**Real-world results on Vercel:** [SYNC-TENNIS.md](./SYNC-TENNIS.md) — RapidAPI key in Supabase secrets; Edge `sync-tennis` → `ingest-events` / `rebuild-draw` → settle → web.
