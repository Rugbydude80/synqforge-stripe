import Ably from 'ably';

const key = process.env.ABLY_API_KEY;
export const ably = key ? new Ably.Rest.Promise({ key }) : null;

export async function publish(channel: string, name: string, data: any) {
  if (!ably) return;
  const ch = ably.channels.get(channel);
  await ch.publish(name, data);
}

