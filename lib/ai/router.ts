// Avoid TS path alias for node:test runner
import { hasAIKeys } from '../env';

export type PickModelOptions = {
  strictSchema?: boolean;
};

export type ModelName = 'gemini-flash-1.5' | 'gpt-4o-mini' | 'deepseek-v3';

/**
 * Select a model according to policy:
 * - Default: Gemini 1.5 Flash
 * - If strict JSON schema is required: GPT-4o-mini
 * - Fallback: DeepSeek-V3
 */
export function pickModel(opts: PickModelOptions = {}): ModelName {
  if (opts.strictSchema) return 'gpt-4o-mini';
  return 'gemini-flash-1.5';
}

export function fallbackModel(): ModelName {
  return 'deepseek-v3';
}

export function canCallAI(): boolean {
  return hasAIKeys();
}

// Provide a .js extension entry for Node test runner that cannot resolve TS path aliases
export { pickModel as pickModelTest, fallbackModel as fallbackModelTest };



