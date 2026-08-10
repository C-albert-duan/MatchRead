# Solo brackets — E2E checklist

Apply `supabase/migrations/0013_solo_brackets.sql` before testing.

## Solo start

- [ ] Signed-out: landing primary CTA is **Fill a bracket** → sign-in → `/tournaments`
- [ ] Signed-in with no leagues: calendar row → `/enter/{ref}` → personal league created → bracket editor
- [ ] Second visit to same tournament reuses the same solo league (no duplicate)
- [ ] `/leagues` lists the solo entry as a personal bracket (not a named social league)

## Fill / submit / lock

- [ ] Save and submit work the same as a social league
- [ ] After submit (still alone, unlocked): **Compare it with someone** invite CTA on bracket
- [ ] Same `lock_at` / admin lock closes edits

## Upgrade (invite)

- [ ] League home invite panel open by default for `is_solo`
- [ ] Second account joins via `/join/{token}`
- [ ] After join: `is_solo` is false; list/home show normal league chrome; standings section appears

## Score while alone

- [ ] Tournament hub hides standings table; shows score / empty score copy
- [ ] Result page shows score without “Nth of N” place while alone
- [ ] Commissioner can still settle; snapshot score visible on result

## Social leagues unchanged

- [ ] **Start a league** still creates `is_solo = false`
- [ ] Existing multi-member leagues still show standings and highlights
