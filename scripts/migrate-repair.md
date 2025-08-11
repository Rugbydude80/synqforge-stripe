# Migration repair guide

If Supabase migrations diverge or fail due to older conflicting files, repair them with these steps.

1. Inspect migration status:
   - `pnpm supabase:status | cat`
2. If drift is detected or a migration failed locally, squash or mark as applied:
   - Identify the failing file under `supabase/migrations/*`.
   - If the objects already exist, create a repair migration that uses `create ... if not exists` and `alter table if exists ... add column if not exists`.
3. Use the provided Freelancer Mode migrations for idempotency (they all use `if not exists`).
4. Apply migrations:
   - `pnpm supabase:push`
5. Regenerate types after a successful push:
   - `pnpm supabase:generate-types`

Notes:
- Avoid deleting migration files already pushed to remote projects; add a repair migration instead.
- For local dev, `pnpm supabase:reset` can be used to reset the database to a clean state.

