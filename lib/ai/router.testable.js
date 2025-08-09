// Lightweight JS versions for node:test runner (avoids TS imports)
export function pickModel(opts = {}) {
  return opts.strictSchema ? 'gpt-4o-mini' : 'gemini-flash-1.5';
}

export function fallbackModel() {
  return 'deepseek-v3';
}



