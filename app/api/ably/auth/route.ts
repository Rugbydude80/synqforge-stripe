import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

type Body = {
  projectId?: string;
};

function parseAblyKey(envKey: string | undefined) {
  if (!envKey) throw new Error('ABLY_API_KEY is not set');
  const parts = envKey.split(':');
  if (parts.length !== 2) throw new Error('ABLY_API_KEY must be in the form keyName:keySecret');
  const [keyName, keySecret] = parts;
  return { keyName, keySecret };
}

async function requestAblyToken({
  keyName,
  keySecret,
  capability,
  ttlMs
}: {
  keyName: string;
  keySecret: string;
  capability: Record<string, string[]>;
  ttlMs: number;
}) {
  const endpoint = `https://rest.ably.io/keys/${encodeURIComponent(keyName)}/requestToken`;
  const basicAuth = Buffer.from(`${keyName}:${keySecret}`).toString('base64');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${basicAuth}`
    },
    body: JSON.stringify({
      ttl: ttlMs,
      capability: JSON.stringify(capability)
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ably token request failed: ${response.status} ${text}`);
  }

  return response.json();
}

export async function POST(req: NextRequest) {
  try {
    // If Ably is not configured, return 204 to indicate presence is disabled
    if (!process.env.ABLY_API_KEY) {
      return NextResponse.json({}, { status: 204 });
    }
    const supabase = createClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const projectId = body.projectId?.trim();
    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    // Check membership in project_members
    const { data: membership, error: membershipError } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      // If table is missing or any other error occurs, avoid leaking details
      return NextResponse.json({ error: 'Access check failed' }, { status: 403 });
    }

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { keyName, keySecret } = parseAblyKey(process.env.ABLY_API_KEY);

    const capability: Record<string, string[]> = {
      [`project:${projectId}`]: ['publish', 'subscribe', 'presence'],
      [`user:${user.id}`]: ['publish', 'subscribe', 'presence']
    };

    const ttlMs = 60 * 60 * 1000; // 1 hour

    const tokenDetails = await requestAblyToken({
      keyName,
      keySecret,
      capability,
      ttlMs
    });

    return NextResponse.json({ token: tokenDetails }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}


