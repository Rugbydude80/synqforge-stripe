// Ably Realtime client factory for browser usage only
// Uses token auth via /api/ably/auth and sets clientId from caller

let ablyPromiseByClientId: Record<string, Promise<any>> = {};

export async function getAblyRealtime(clientId: string) {
  if (!clientId) throw new Error('getAblyRealtime requires a clientId');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    // Ensure envs are loaded in Next runtime; this avoids silent failures
  }

  if (!ablyPromiseByClientId[clientId]) {
    ablyPromiseByClientId[clientId] = (async () => {
      if (typeof window === 'undefined') {
        // Avoid instantiating Ably on the server
        return null;
      }
      // Graceful opt-out when no Ably API key present
      if (!process.env.ABLY_API_KEY) {
        return null;
      }
      const Ably = await import('ably');
      const client = new Ably.Realtime({
        clientId,
        authUrl: '/api/ably/auth',
        echoMessages: true,
        recover: 'connection',
        closeOnUnload: true,
        transportParams: { remainPresentFor: 60_000 }
      });
      return client;
    })();
  }

  return ablyPromiseByClientId[clientId];
}


