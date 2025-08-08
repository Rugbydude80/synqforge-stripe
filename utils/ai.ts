import { inngest } from '@/lib/inngest';

export async function emitAICreditsDeduct(organisationId: string, tokensUsed: number) {
  await inngest.send({
    name: 'ai.credits.deduct',
    data: { organisationId, tokensUsed }
  });
}


