# Infrastructure index

Runtime, schema, deploy, secrets, and ops — separate from product modules under [`../modules/`](../modules/).

| Doc | Covers |
|-----|--------|
| [supabase.md](./supabase.md) | Migrations, RLS, RPCs, views, cron |
| [edge-functions.md](./edge-functions.md) | `sync-facts`, `settle-leagues`, shared apply-* |
| [ci-and-deploy.md](./ci-and-deploy.md) | Docker Compose, GitHub Actions, migrate |
| [environment.md](./environment.md) | Env files and secret placement |
| [ops-scripts.md](./ops-scripts.md) | Publish, reconcile, probes, trust checks |

Product domain docs stay in [`../`](../) and [`../modules/`](../modules/).
