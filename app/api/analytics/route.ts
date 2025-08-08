import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';
import { redis } from '@/lib/redis';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * GET /api/analytics
 *
 * This endpoint returns a collection of analytics metrics for the current
 * organisation.  Metrics include the distribution of stories by status,
 * a simple velocity measure (stories completed in the period), and basic
 * AI usage statistics. Results are cached in Upstash Redis for 5 minutes
 * per organisation and date range.
 */
export async function GET(request: Request) {
  const supabase = createSupabaseServerClient();
  // Authenticate the user
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Look up the organisation id from the user profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('organisation_id')
    .eq('user_id', user.id)
    .single();
  const organisationId = profile?.organisation_id;
  if (!organisationId) {
    return NextResponse.json({ error: 'No organisation' }, { status: 400 });
  }
  // Parse query parameters or use defaults (last 30 days)
  const url = new URL(request.url);
  const startParam = url.searchParams.get('startDate');
  const endParam = url.searchParams.get('endDate');
  const endDate = endParam ?? new Date().toISOString();
  const startDate = startParam ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cacheKey = `analytics:${organisationId}:${startDate}:${endDate}`;
  // Try to read from Redis cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached as any);
  }
  // Fetch all projects for this organisation
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id')
    .eq('organisation_id', organisationId);
  if (projectsError) {
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
  const projectIds = (projects ?? []).map((p) => p.id);
  if (projectIds.length === 0) {
    return NextResponse.json({ error: 'No projects' }, { status: 400 });
  }
  // Distribution of story points by status
  async function sumPoints(status: 'backlog' | 'in_progress' | 'review' | 'done') {
    const { data } = await supabase
      .from('stories')
      .select('points')
      .in('project_id', projectIds)
      .eq('status', status);
    return (data ?? []).reduce((sum, s) => sum + (s.points ?? 0), 0);
  }
  const backlogCount = await sumPoints('backlog');
  const inProgressCount = await sumPoints('in_progress');
  const reviewCount = await sumPoints('review');
  const doneCount = await sumPoints('done');
  // Velocity per sprint: points completed divided by sprint duration (days)
  const { data: sprints } = await supabase
    .from('sprints')
    .select('id, start_date, end_date, story_points_completed, velocity')
    .in('project_id', projectIds)
    .gte('start_date', startDate.substring(0, 10))
    .lte('end_date', endDate.substring(0, 10));
  const velocityPerSprint = (sprints ?? []).map((s) => {
    const start = new Date(s.start_date);
    const end = new Date(s.end_date);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const points = (s as any).story_points_completed ?? 0;
    const vel = points / days;
    return { sprintId: s.id, velocity: vel };
  });
  const velocityPoints = velocityPerSprint.reduce((sum, v) => sum + v.velocity, 0);
  // AI usage: sum tokens used per day (simple measure)
  const { data: aiOps } = await supabase
    .from('ai_operations')
    .select('tokens_used, created_at')
    .eq('organisation_id', organisationId)
    .gte('created_at', startDate)
    .lte('created_at', endDate);
  const totalTokens = (aiOps ?? []).reduce((sum, op) => sum + (op.tokens_used ?? 0), 0);
  // Burndown per active sprint: compute daily remaining points based on story points and completion timestamps
  const { data: activeSprint } = await supabase
    .from('sprints')
    .select('id, start_date, end_date')
    .in('project_id', projectIds)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  let burndown: Array<{ date: string; remaining: number }>= [];
  if (activeSprint) {
    const { data: sprintStories } = await supabase
      .from('stories')
      .select('points, status, completed_at')
      .in('project_id', projectIds)
      .eq('sprint_id', activeSprint.id);
    const start = new Date(activeSprint.start_date);
    const end = new Date(activeSprint.end_date);
    const totalPoints = (sprintStories ?? []).reduce((sum, s) => sum + (s.points ?? 0), 0);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    for (let i = 0; i <= days; i++) {
      const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const dayStr = day.toISOString().substring(0, 10);
      const completedByDay = (sprintStories ?? []).reduce((sum, s) => {
        const completedAt = s.completed_at ? new Date(s.completed_at).getTime() : undefined;
        if (s.status === 'done' && completedAt && completedAt <= day.getTime()) {
          return sum + (s.points ?? 0);
        }
        return sum;
      }, 0);
      const remaining = Math.max(totalPoints - completedByDay, 0);
      burndown.push({ date: dayStr, remaining });
    }
  }
  const analytics = {
    distribution: {
      backlog: backlogCount,
      in_progress: inProgressCount,
      review: reviewCount,
      done: doneCount
    },
    velocityPerSprint,
    aiUsage: {
      totalTokens
    },
    burndown
  };
  // Cache analytics for 5 minutes (300 seconds)
  await redis.setex(cacheKey, 300, analytics);
  return NextResponse.json(analytics);
}