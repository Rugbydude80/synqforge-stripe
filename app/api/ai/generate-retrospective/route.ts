import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { inngest } from '@/lib/inngest';

export const runtime = 'nodejs';

/**
 * POST /api/ai/generate-retrospective
 *
 * Generate a retrospective summary and notes for a completed sprint.
 * The client should POST JSON with:
 *   - sprintId: string
 *   - organisationId: string
 *   - model?: string (optional)
 *
 * This endpoint fetches all stories in the sprint, compiles a prompt
 * describing the sprint and its tasks, and calls OpenRouter to
 * produce a retrospective.  The result is stored in the
 * `retrospectives` table and returned to the caller.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { sprintId, organisationId, model } = (await req.json()) as {
    sprintId: string;
    organisationId: string;
    model?: string;
  };
  if (!sprintId || !organisationId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  // Check AI credits
  const { data: orgData, error: orgError } = await supabase
    .from('organisations')
    .select('ai_credits')
    .eq('id', organisationId)
    .maybeSingle();
  if (orgError) {
    return NextResponse.json({ error: 'Failed to fetch organisation' }, { status: 500 });
  }
  const aiCredits: number | null | undefined = orgData?.ai_credits;
  if (!aiCredits || aiCredits <= 0) {
    return NextResponse.json({ error: 'Insufficient AI credits' }, { status: 402 });
  }
  // Fetch sprint details
  const { data: sprint, error: sprintError } = await supabase
    .from('sprints')
    .select('*')
    .eq('id', sprintId)
    .maybeSingle();
  if (sprintError || !sprint) {
    return NextResponse.json({ error: 'Sprint not found' }, { status: 404 });
  }
  // Fetch all stories for the sprint
  const { data: stories, error: storiesError } = await supabase
    .from('stories')
    .select('title, description, status')
    .eq('sprint_id', sprintId);
  if (storiesError) {
    return NextResponse.json({ error: 'Failed to fetch stories' }, { status: 500 });
  }
  // Build a prompt describing the sprint and tasks
  const taskDescriptions = (stories || [])
    .map((s) => `- ${s.title}: ${s.description || ''} [${s.status}]`)
    .join('\n');
  const prompt = [
    `Sprint name: ${sprint.name}`,
    `Goal: ${sprint.goal || ''}`,
    `Duration: ${sprint.start_date} to ${sprint.end_date}`,
    '',
    'Completed tasks:',
    taskDescriptions,
    '',
    'Write a concise retrospective for this sprint.',
    'Provide a "summary" (what happened, achievements) and "notes" (what went well, what did not, lessons learned, improvements).',
    'Return the result as JSON with keys "summary" and "notes" only. Do not include any additional keys.'
  ].join('\n');
  try {
    // Call OpenRouter to get the retrospective summary
    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '',
        'X-Title': 'SynqForge Retrospective Generator',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'openai/gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: 'You are an AI assistant that writes agile sprint retrospectives.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.6,
        max_tokens: 2000,
        stream: false
      })
    });
    if (!aiResponse.ok) {
      throw new Error(`OpenRouter error: ${aiResponse.statusText}`);
    }
    const aiData = await aiResponse.json();
    const content: string | undefined = aiData?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty AI response');
    }
    // Parse JSON from the AI response.  The response should be a JSON
    // object with summary and notes fields.  If parsing fails, try
    // extracting the first JSON block.
    let parsed: { summary: string; notes: string };
    try {
      parsed = JSON.parse(content);
    } catch (_err) {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error('Failed to parse retrospective JSON');
      }
      parsed = JSON.parse(match[0]);
    }
    // Insert retrospective into database
    const { data: insertResult, error: insertError } = await supabase
      .from('retrospectives')
      .insert({ sprint_id: sprintId, summary: parsed.summary, notes: parsed.notes })
      .select()
      .maybeSingle();
    if (insertError || !insertResult) {
      return NextResponse.json({ error: 'Failed to save retrospective' }, { status: 500 });
    }
    // Deduct one AI credit for the retrospective
    await inngest.send({ name: 'ai.credits.deduct', data: { organisationId, tokensUsed: 1 } });
    return NextResponse.json({ summary: parsed.summary, notes: parsed.notes });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('Retrospective generation error:', err);
    return NextResponse.json({ error: 'Retrospective generation failed' }, { status: 500 });
  }
}