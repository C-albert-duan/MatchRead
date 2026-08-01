# Phase 3 test checklist — Brackets

**Status: complete** (owner confirmed 2026-07-29). Kept for regression re-runs.

Dev: **http://localhost:3001**

## Prerequisites

- [x] `0003_brackets.sql` applied in Supabase SQL Editor
- [x] Signed in on localhost:3001
- [x] Have (or create) a **single** league for **US Open 2026**

## Entry path

- [x] League home shows **Open tournament** (draw published)
- [x] `/leagues/[slug]/t/uso-2026` → **Open my bracket**
- [x] Bracket shows 16-draw columns (Round of 16 → Final)
- [x] Empty later-round slots show **—** (em dash) until feeders are picked
- [x] Unpicked ready matches show dashed slot + **Unpicked** note

## Save / submit

- [x] Picking a winner advances the name; status → saving → saved
- [x] Progress reads **n of 15 picks made**
- [x] Submit disabled until complete; then **Submit my bracket** succeeds
- [x] After submit, confirmation on the same screen

## Lock

- [x] Commissioner **Lock draw now** → UI read-only (server refuses further saves)
- [x] **Unlock (fixture)** restores editing (fixture only)

## Draw pending

- [x] Create/open a league for **Wimbledon 2026** → league + tournament show **Draw pending** (no bracket link)

## Layout

- [x] Round headers do not overlap first match
- [x] Later rounds vertically centre on their feeder matches

## Pass

All boxes → Phase 3 done. Update [STATUS.md](../STATUS.md).
