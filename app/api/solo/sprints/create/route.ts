import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json().catch(() => ({}));
  const { clientId, name, start_date, end_date, capacity_points, goal } = body;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // For freelancer mode, we do not attach to a project; allow null project_id
  const { data, error } = await supabase.from('sprints').insert({ project_id: null as any, name, goal: goal ?? null, start_date, end_date, status: 'planning', capacity_points }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sprintId: data.id });
}


