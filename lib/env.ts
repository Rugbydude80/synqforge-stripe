/**
 * Centralized environment validation and helpers.
 *
 * Logs clear errors if required environment variables are missing.
 * Does not throw by default to avoid silent failures; callers may still
 * choose to enforce presence by checking return values.
 */

const REQUIRED_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ABLY_API_KEY',
  // AI providers
  'OPENROUTER_API_KEY'
];

let validated = false;

export function validateEnv(): void {
  if (validated) return;
  validated = true;
  for (const key of REQUIRED_KEYS) {
    const value = process.env[key];
    if (!value || /<.*>/.test(value) || value.endsWith('...')) {
      // eslint-disable-next-line no-console
      console.error(`[env] Missing or invalid value for ${key}. Check your .env.local.`);
    }
  }
}

export function getEnv(key: string, fallback: string | undefined = undefined): string | undefined {
  const value = process.env[key];
  if (!value) {
    // eslint-disable-next-line no-console
    console.error(`[env] ${key} is not set.`);
    return fallback;
  }
  return value;
}

// Immediately validate on import for server runtimes
validateEnv();

export type ModelOverride =
  | 'gemini-flash-1.5'
  | 'gpt-4o-mini'
  | 'deepseek-v3'
  | 'llama-3.1-70b';


