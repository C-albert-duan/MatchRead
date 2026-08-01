# Phase 2 test checklist — Leagues + Invites

**Status: complete** (owner confirmed 2026-07-29). Kept for regression re-runs.

Dev: **http://localhost:3001**

## Prerequisites

- [x] `0001_init.sql` applied
- [x] `0002_leagues.sql` applied in Supabase SQL Editor (includes grants + `create_league`)
- [x] Signed in on localhost:3001

## Growth loop

- [x] `/leagues` empty state → **Start a league**
- [x] `/leagues/new` — name, format, visibility, tournament (if single)
- [x] Create → lands on `/leagues/[slug]?invite=1` with invite panel open
- [x] **Copy invite link** works (or manual copy if clipboard blocked)
- [x] Open invite URL signed out → **Sign in and join** preserves `next`
- [x] After magic link → **auto-joined** into `/leagues/[slug]` (no second Join click)
- [x] First account sees updated member count
- [x] Commissioner **Revoke and re-issue** invalidates old link
- [x] Non-member cannot open `/leagues/[slug]` (404)

## Pass

All growth-loop boxes → Phase 2 done. Update [STATUS.md](../STATUS.md).
