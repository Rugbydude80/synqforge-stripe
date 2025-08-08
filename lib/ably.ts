export type AblyRealtime = unknown;

export async function getAblyRealtime(): Promise<AblyRealtime> {
  if (!process.env.ABLY_API_KEY) {
    throw new Error('Missing ABLY_API_KEY in environment.');
  }
  throw new Error(
    'Ably client not installed. Add the "ably" SDK and implement getAblyRealtime().' 
  );
}


