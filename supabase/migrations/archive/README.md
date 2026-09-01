# Archive migrations

**Do not apply these files on production or new environments.**

This directory holds the **pre-consolidation** migration chain from early MatchRead development. The live schema is defined only by sibling files:

```text
supabase/migrations/0001_profiles.sql … 0020_clear_misclassified_uso_wta_draw.sql
```

## Why these exist

- Historical reference (Montreal/USO slug confusion, old `sync-tennis` cron, seed data experiments)
- Some filenames overlap live numbers (e.g. archive `0011_*`) but content differs — **always use the non-archive path**

## Rule

If you need schema changes, add **`00NN_description.sql`** next to `0020_*`, not here.

See [architecture/infrastructure/supabase.md](../../architecture/infrastructure/supabase.md) and [architecture/infrastructure/ci-and-deploy.md](../../architecture/infrastructure/ci-and-deploy.md).
