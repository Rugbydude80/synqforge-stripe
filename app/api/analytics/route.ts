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
  // Helper to count stories by status
  async function countStories(status: 'backlog' | 'in_progress' | 'review' | 'done') {
    const { count } = await supabase
      .from('stories')
      .select('*', { count: 'exact', head: true })
      .in('project_id', projectIds)
      .eq('status', status);
    return count ?? 0;
  }
  // Compute distribution
  const backlogCount = await countStories('backlog');
  const inProgressCount = await countStories('in_progress');
  const reviewCount = await countStories('review');
  const doneCount = await countStories('done');
  // Velocity: total points completed in the period
  const { data: doneStories } = await supabase
    .from('stories')
    .select('points, updated_at')
    .in('project_id', projectIds)
    .eq('status', 'done')
    .gte('updated_at', startDate)
    .lte('updated_at', endDate);
  const velocityPoints = (doneStories ?? []).reduce((sum, s) => sum + (s.points ?? 0), 0);
  // AI usage: sum tokens used per day (simple measure)
  const { data: aiOps } = await supabase
    .from('ai_operations')
    .select('tokens_used, created_at')
    .eq('organisation_id', organisationId)
    .gte('created_at', startDate)
    .lte('created_at', endDate);
  const totalTokens = (aiOps ?? []).reduce((sum, op) => sum + (op.tokens_used ?? 0), 0);
  // Burndown: remaining points per day (simplified calculation)
  const totalOpenPointsQuery = await supabase
    .from('stories')
    .select('points')
    .in('project_id', projectIds)
    .in('status', ['backlog', 'in_progress', 'review']);
  const totalOpenPoints = (totalOpenPointsQuery.data ?? []).reduce((sum, s) => sum + (s.points ?? 0), 0);
  const totalDonePoints = velocityPoints;
  const days = 7;
  const burndown = Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000);
    const dayStr = date.toISOString().substring(0, 10);
    // naive linear interpolation from total to 0 across the period
    const remaining = Math.max(totalOpenPoints - Math.round((totalDonePoints / days) * i), 0);
    return { date: dayStr, remaining };
  });
  const analytics = {
    distribution: {
      backlog: backlogCount,
      in_progress: inProgressCount,
      review: reviewCount,
      done: doneCount
    },
    velocity: velocityPoints,
    aiUsage: {
      totalTokens
    },
    burndown
  };
  // Cache analytics for 5 minutes (300 seconds)
  await redis.setex(cacheKey, 300, analytics);
  return NextResponse.json(analytics);
}