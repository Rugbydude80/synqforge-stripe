import { pickModel, fallbackModel, type ModelName, canCallAI } from './router';
import { getEnv } from '../env';

type RunJsonArgs<T> = {
  model?: ModelName;
  prompt: string;
  schema: { name: string; schema: Record<string, any> };
};

async function callOpenRouter(body: any): Promise<Response> {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getEnv('OPENROUTER_API_KEY') || ''}`,
    'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '',
    'X-Title': 'SynqForge AI',
    'Content-Type': 'application/json'
  };
  return fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

/**
 * Run a single-turn JSON extraction with model-specific formatting.
 * Always validates returned JSON and retries once with 4o-mini if invalid.
 */
export async function runJson<T>(args: RunJsonArgs<T>): Promise<T> {
  const chosen: ModelName = args.model ?? pickModel({ strictSchema: true });
  if (!canCallAI()) {
    // Deterministic fixtures for demo
    return [{
      title: 'As a user, I want to reset my password',
      as_a: 'user',
      i_want: 'to reset my password',
      so_that: 'I can access my account',
      acceptance_criteria: ['Reset link via email', 'Token expires in 30 minutes'],
      points: 3,
      priority: 'medium'
    }] as unknown as T;
  }

  const system = { role: 'system', content: 'You are a precise data extractor. Return ONLY valid JSON for the provided schema.' };
  const user = { role: 'user', content: args.prompt };

  async function attempt(model: ModelName): Promise<T> {
    const isOpenAI = model === 'gpt-4o-mini' || model === 'deepseek-v3';
    const isGemini = model === 'gemini-flash-1.5';
    const body: any = {
      model: isGemini ? 'google/gemini-flash-1.5' : (model === 'gpt-4o-mini' ? 'openai/gpt-4o-mini' : 'deepseek/deepseek-chat'),
      messages: [system, user],
      temperature: 0.2,
      max_tokens: 4000
    };

    if (isOpenAI) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: args.schema.name, schema: args.schema.schema, strict: true }
      };
    }
    if (isGemini) {
      body.response_mime_type = 'application/json';
    }

    const res = await callOpenRouter(body);
    if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
    const json = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? '';
    try {
      return JSON.parse(text) as T;
    } catch {
      // try to salvage first JSON object/array in text
      const m = text.match(/[\[{][\s\S]*[\]}]/);
      if (m) return JSON.parse(m[0]) as T;
      throw new Error('Invalid JSON');
    }
  }

  try {
    return await attempt(chosen);
  } catch (_err) {
    try {
      return await attempt('gpt-4o-mini');
    } catch {
      return await attempt(fallbackModel());
    }
  }
}


