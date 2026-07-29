# Roadmap

Phased build for this repository. Wireframe stays read-only reference.

**Live status:** [STATUS.md](./STATUS.md)

| Phase | Plan | Outcome | Status |
|---|---|---|---|
| **0** | [00-bootstrap](./plans/00-bootstrap.md) | Monorepo, docs, GitHub | **Done** |
| **1** | [01-auth-landing](./plans/01-auth-landing.md) | Magic link + landing + Supabase Auth | **Done** (local) |
| **2** | [02-leagues-invites](./plans/02-leagues-invites.md) | Create → invite → join E2E | **Done** |
| **3** | [03-brackets](./plans/03-brackets.md) | Fill + submit fixture bracket | **Done** |
| **4** | [04-settlement-standings](./plans/04-settlement-standings.md) | Grades freeze; tables move | **Done** |
| **5** | [05-daily-check](./plans/05-daily-check.md) | League home leads with pulse | **Code done — verify** |
| **6** | [06-ceo-tier1-engagement](./plans/06-ceo-tier1-engagement.md) | Confidence, health, highlights | Pending |
| **7** | [07-ops-i18n-polish](./plans/07-ops-i18n-polish.md) | Founder ops, en→es/ja, beta | Pending |
| **8** | Public window | Live listener, proven settlement, 128-draw perf | Pending |

## First-week checkpoint

- [x] Repo on GitHub with `Wireframe/` + `docs/` + app scaffold
- [x] Supabase auth round-trip works locally
- [ ] Supabase auth round-trip on a Vercel preview
- [x] Create league + invite + join works end-to-end
- [x] One fixture tournament bracket can be filled and submitted
- [x] Settlement moves standings on a known fixture
- [ ] Daily Check leads league home with honest numbers

## Calendar note

Bracket builder must be **already proven** when the US Open draw drops (~27 Aug). League creation must ship weeks earlier.
