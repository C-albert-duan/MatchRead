# Runbook — Railway ingestion worker

Always-on process that holds the provider socket and forwards events.

## Status

**Not required for invited beta** if REST sweep is acceptable. **Required for public launch** live scores.

## What it must do

1. Connect to provider socket with provider credentials.
2. On each event, `POST` raw payload to `supabase/functions/ingest-events`.
3. Authenticate with service-role bearer (or dedicated ingest secret).
4. Parse nothing domain-critical; write nothing to DB directly.

## What it must not do

- Hold broad database credentials beyond the ingest call.
- Live inside the Next.js / Vercel app.
- Be given to the browser.

## Deploy sketch

- One Railway service, one instance.
- Env: provider key, Supabase URL, ingest auth secret.
- Health check / restart on socket drop.

## Alternative hosts

Railway is the planned default for this rebuild. One container; reversible.
