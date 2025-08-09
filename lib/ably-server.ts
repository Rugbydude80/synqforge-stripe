import Ably from 'ably';
import { validateEnv } from '@/lib/env';

let restClient: Ably.Rest | null = null;

function getRest(): Ably.Rest {
  if (!restClient) {
    validateEnv();
    const key = process.env.ABLY_API_KEY;
    if (!key) throw new Error('ABLY_API_KEY not set');
    restClient = new Ably.Rest(key);
  }
  return restClient;
}

export async function publishToUser(userId: string, event: string, data: Record<string, any>) {
  const rest = getRest();
  const channel = rest.channels.get(`user:${userId}`);
  await channel.publish(event, data);
}

export async function publishToProject(projectId: string, event: string, data: Record<string, any>) {
  const rest = getRest();
  const channel = rest.channels.get(`project:${projectId}`);
  await channel.publish(event, data);
}


