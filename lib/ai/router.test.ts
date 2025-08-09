import assert from 'node:assert';
import test from 'node:test';
// Use JS shim to bypass TS path alias resolution in Node test runner
import { pickModel as _pick, fallbackModel as _fallback } from './router.testable.js';
const pickModel = _pick;
const fallbackModel = _fallback;

test('pickModel default is gemini', () => {
  assert.strictEqual(pickModel(), 'gemini-flash-1.5');
});

test('pickModel strict schema uses 4o-mini', () => {
  assert.strictEqual(pickModel({ strictSchema: true }), 'gpt-4o-mini');
});

test('fallbackModel is deepseek', () => {
  assert.strictEqual(fallbackModel(), 'deepseek-v3');
});


