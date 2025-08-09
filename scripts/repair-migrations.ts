#!/usr/bin/env tsx
/**
 * Repairs Supabase migration status to mark the initial core schema as applied
 * before pushing new migrations. This avoids duplicate policy conflicts during
 * db push.
 *
 * Usage: pnpm tsx scripts/repair-migrations.ts
 */
import { spawn } from 'node:child_process';

function run(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env: process.env });
    child.on('close', (code) => resolve(code ?? 0));
  });
}

async function main() {
  const MIGRATION = '20240501_create_core_schema.sql';
  // Mark core schema migration as applied if not already
  const code1 = await run('npx', ['-y', 'supabase', 'migration', 'repair', '--status', 'applied', '--migrations', MIGRATION]);
  if (code1 !== 0) {
    console.error('Failed to repair migration status.');
    process.exit(code1);
  }
  // Push pending migrations
  const code2 = await run('pnpm', ['supabase:push']);
  if (code2 !== 0) {
    console.error('Failed to push migrations.');
    process.exit(code2);
  }
  // Regenerate types
  const code3 = await run('pnpm', ['supabase:generate-types']);
  if (code3 !== 0) {
    console.error('Failed to generate types.');
    process.exit(code3);
  }
}

void main();


