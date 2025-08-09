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
  // AI providers (we call via OpenRouter by default)
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

// Immediately validate on import for server runtimes only
if (typeof window === 'undefined') {
  validateEnv();
}

export type ModelOverride =
  | 'gemini-flash-1.5'
  | 'gpt-4o-mini'
  | 'deepseek-v3'
  | 'llama-3.1-70b';

/** Whether Freelancer mode UI should be enabled. */
export function isFreelancerMode(): boolean {
  return (process.env.NEXT_PUBLIC_FREELANCER_MODE || '').toLowerCase() === 'true';
}

/** Demo mode when Supabase public URL or anon key is missing. */
export function isDemoMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return !url || !anon;
}

/** Whether we can call external AI providers. */
export function hasAIKeys(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/**
 * Billing feature flag helper.
 * When DISABLE_BILLING === 'true', billing is OFF.
 * Default to disabled in non-production if not set.
 */
// Set default only when not explicitly provided and not in production
if (typeof window === 'undefined' && typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
  if (process.env.DISABLE_BILLING === undefined) {
    process.env.DISABLE_BILLING = 'true';
  }
}

export function isBillingEnabled(): boolean {
  return process.env.DISABLE_BILLING !== 'true';
}

// Client-safe billing flag; uses NEXT_PUBLIC_* which is defined at build time
export const billingOn: boolean = (process.env.NEXT_PUBLIC_DISABLE_BILLING || 'true') !== 'true';


