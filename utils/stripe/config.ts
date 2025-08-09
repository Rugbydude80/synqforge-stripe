import Stripe from 'stripe';

let cachedStripe: Stripe | null = null;

export function getServerStripe(): Stripe {
  if (cachedStripe) return cachedStripe;
  const key = process.env.STRIPE_SECRET_KEY_LIVE ?? process.env.STRIPE_SECRET_KEY ?? '';
  cachedStripe = new Stripe(key, {
    // @ts-ignore
    apiVersion: null,
    appInfo: {
      name: 'Next.js Subscription Starter',
      version: '0.0.0',
      url: 'https://github.com/vercel/nextjs-subscription-payments'
    }
  });
  return cachedStripe;
}
