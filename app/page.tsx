import Pricing from '@/components/ui/Pricing/Pricing';
import { createClient } from '@/utils/supabase/server';
import { isBillingEnabled } from '@/lib/env';
import {
  getProducts,
  getSubscription,
  getUser
} from '@/utils/supabase/queries';

export default async function PricingPage() {
  if (!isBillingEnabled()) {
    return (
      <div className="bg-black min-h-screen">
        <div className="max-w-4xl px-4 py-16 mx-auto text-white">
          <h1 className="text-4xl font-extrabold">Billing is disabled</h1>
          <p className="mt-4 text-zinc-300">This environment has billing disabled. Explore the app features without payments.</p>
        </div>
      </div>
    );
  }
  const supabase = createClient();
  const [user, products, subscription] = await Promise.all([
    getUser(supabase),
    getProducts(supabase),
    getSubscription(supabase)
  ]);

  return (
    <Pricing
      user={user}
      products={products ?? []}
      subscription={subscription}
    />
  );
}
