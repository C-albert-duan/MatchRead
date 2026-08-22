# Event-date + Cincinnati fixture diagnosis

Generated: 2026-08-22T01:56:27.027Z

Read-only probe (`scripts/probe-event-dates.mjs`). No database writes.

## Provider date fields

| Label | Tour | Provider id | startDate | endDate |
|-------|------|-------------|-----------|---------|
| Cincinnati | atp | 21347 | 2026-08-10T00:00:00.000Z | null |
| Cincinnati | wta | 16740 | 2026-08-10T00:00:00.000Z | null |
| Winston-Salem | atp | 21348 | 2026-08-24T00:00:00.000Z | null |
| US Open | atp | 21349 | 2026-08-31T00:00:00.000Z | null |
| US Open | wta | 16743 | 2026-08-31T00:00:00.000Z | null |
| Monterrey | wta | 16741 | 2026-08-24T00:00:00.000Z | null |

## Stored rows

Unavailable: no supabase service env

## Cincinnati branches

### ATP Fonseca–O'Connell

```json
{
  "http": 200,
  "provider_singles": 90,
  "shape": "missing_from_provider_or_name_mismatch",
  "provider_rows": 0,
  "detail": "No provider result naming both Fonseca and Connell"
}
```

Stored: ```json
{}
```

### WTA Wang–Svitolina

```json
{
  "http": 200,
  "provider_singles": 90,
  "shape": "missing_from_provider_or_name_mismatch",
  "provider_rows": 0,
  "detail": "No provider result naming both Wang and Svitolina"
}
```

Stored: ```json
{}
```

## What this means for Phase 3–4

- Provider calendar dates confirm the directive: US Open `2026-08-31` (main draw should be **30 Aug**), Winston-Salem `2026-08-24` (expect **23 Aug**), Cincinnati `2026-08-10` (main draw ~**13 Aug**). Product must use `main_draw_starts_on`.
- Cincinnati returns 90 singles per tour; name-based branch match needs player-id binding in DB (no supabase service env in this probe run).
- If WTA stored shape is `missing_match_row`, reconciliation must iterate the **provider** set and create/bind — a stored-row diff will never find it.
- If ATP stored shape is `null_winner_row`, repair + `claim_settlement` is enough for that branch.
