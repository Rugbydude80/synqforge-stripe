import { inngest } from '@/lib/inngest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/extended-db';
import { isBillingEnabled } from '@/lib/env';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase admin env');
  return createClient<Database>(url, key);
}

export const userSignupCompleted = inngest.createFunction(
  { id: 'user-signup-completed' },
  { event: 'user.signup.completed' },
  async ({ event, step }) => {
    const supabase = getAdminClient();
    const userId: string = (event.data as any)?.userId;
    const email: string | undefined = (event.data as any)?.email;
    if (!userId) return;

    // 1) Ensure Stripe customer exists and is mapped
    const stripeCustomerId = await step.run('ensure-stripe-customer', async () => {
      if (!isBillingEnabled()) return undefined as unknown as string;
      // Try existing mapping
      const { data: existing } = await supabase
        .from('customers')
        .select('stripe_customer_id')
        .eq('id', userId)
        .maybeSingle();
      if (existing?.stripe_customer_id) return existing.stripe_customer_id;

      // Try find by email, else create
      let customerId: string | undefined;
      if (email) {
        const { getServerStripe } = await import('@/utils/stripe/config');
        const stripe = getServerStripe();
        const list = await stripe.customers.list({ email });
        customerId = list.data[0]?.id;
      }
      if (!customerId) {
        const { getServerStripe } = await import('@/utils/stripe/config');
        const stripe = getServerStripe();
        const created = await stripe.customers.create({
          email: email,
          metadata: { supabaseUUID: userId }
        });
        customerId = created.id;
      }
      await supabase
        .from('customers')
        .upsert([{ id: userId, stripe_customer_id: customerId }]);
      return customerId;
    });

    // 2) Create default organisation and project
    await step.run('create-default-organisation-and-project', async () => {
      // Derive a default org name
      const orgName = email ? email.split('@')[0] : `org-${userId.slice(0, 8)}`;
      const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      // Create organisation
      const { data: org, error: orgErr } = await supabase
        .from('organisations')
        .insert({
          name: orgName,
          slug,
          owner_id: userId,
          stripe_customer_id: stripeCustomerId
        })
        .select('id')
        .maybeSingle();
      if (orgErr) throw orgErr;
      const orgId = org?.id as string;

      // Link user profile as owner if missing
      await supabase
        .from('user_profiles')
        .upsert([{ user_id: userId, organisation_id: orgId, role: 'owner' }]);

      // Create a default project
      await supabase
        .from('projects')
        .insert([{ organisation_id: orgId, name: 'Default Project' }]);
    });
  }
);

export const aiCreditsDeduct = inngest.createFunction(
  { id: 'ai-credits-deduct' },
  { event: 'ai.credits.deduct' },
  async ({ event, step }) => {
    const supabase = getAdminClient();
    const organisationId: string = (event.data as any)?.organisationId;
    const userId: string | undefined = (event.data as any)?.userId;
    const tokensUsed: number = Number((event.data as any)?.tokensUsed ?? 0);
    if (!organisationId || !Number.isFinite(tokensUsed) || tokensUsed <= 0) return;

    // 1) Deduct credits (1 token == 1 credit for simplicity, adjust as needed)
    await step.run('deduct-credits', async () => {
      await (supabase as any).rpc('decrement_ai_credits', {
        org_id: organisationId,
        amount: tokensUsed
      });
    });

    // 2) Log usage (lightweight example; adjust to your schema)
    await step.run('log-usage', async () => {
      await supabase
        .from('ai_operations')
        .insert([{ organisation_id: organisationId, user_id: userId || organisationId, operation_type: 'ai', model: 'n/a', tokens_used: tokensUsed, credits_used: tokensUsed } as any]);
    });
  }
);

export const analyticsExportRequested = inngest.createFunction(
  { id: 'analytics-export-requested' },
  { event: 'analytics.export.requested' },
  async ({ event, step }) => {
    const supabase = getAdminClient();
    const userId: string = (event.data as any)?.userId;
    const organisationId: string | undefined = (event.data as any)?.organisationId;
    if (!userId) return;

    // 1) Build a CSV string; here we export simple project counts as an example
    const csv = await step.run('build-csv', async () => {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name, created_at')
        .order('created_at', { ascending: false })
        .throwOnError();
      const rows = [
        'project_id,project_name,created_at',
        ...(projects ?? []).map((p) => `${p.id},${JSON.stringify(p.name)},${p.created_at}`)
      ];
      return rows.join('\n');
    });

    // 2) Upload to Supabase Storage (bucket: exports)
    const publicUrl = await step.run('upload-to-storage', async () => {
      const fileName = `analytics/${userId}/${Date.now()}.csv`;
      const arrayBuffer = Buffer.from(csv, 'utf-8');
      // Ensure bucket exists in your Supabase project: "exports"
      const { data, error } = await supabase.storage
        .from('exports')
        .upload(fileName, arrayBuffer, {
          contentType: 'text/csv',
          upsert: true
        });
      if (error) throw error;
      const { data: pub } = supabase.storage.from('exports').getPublicUrl(fileName);
      return pub.publicUrl;
    });

    // 3) Send notification (placeholder: write a row or log)
    await step.run('notify-user', async () => {
      console.log('Analytics export ready:', { userId, organisationId, url: publicUrl });
    });
  }
);

export const allInngestFunctions = [
  userSignupCompleted,
  aiCreditsDeduct,
  analyticsExportRequested
];


