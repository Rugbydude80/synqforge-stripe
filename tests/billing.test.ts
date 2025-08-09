import assert from 'node:assert';
import test from 'node:test';

test('isBillingEnabled false when DISABLE_BILLING=true', async () => {
  process.env.DISABLE_BILLING = 'true';
  const { isBillingEnabled } = await import('@/lib/env');
  assert.strictEqual(isBillingEnabled(), false);
});

test('webhook route returns 204 when billing disabled', async () => {
  process.env.DISABLE_BILLING = 'true';
  const { POST } = await import('@/app/api/webhooks/route');
  const res = await POST(new Request('http://localhost/api/webhooks', { method: 'POST', body: '' }));
  assert.strictEqual(res.status, 204);
});


