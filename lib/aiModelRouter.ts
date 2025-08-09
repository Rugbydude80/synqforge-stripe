import crypto from 'crypto';
import { redis } from '@/lib/redis';
import { getEnv } from '@/lib/env';

export type Role = 'system' | 'user' | 'assistant' | 'tool';
export type ChatMessage = { role: Role; content: string };

export type JSONSchema = {
  name: string;
  schema: Record<string, any>;
  strict?: boolean;
};

export type CallAIOptions = {
  modelOverride?: 'gemini-flash-1.5' | 'gpt-4o-mini' | 'deepseek-v3' | 'llama-3.1-70b';
  temperature?: number;
  maxTokens?: number;
  force?: boolean;
};

export type AITaskType = 'stories' | 'epics' | 'retrospective' | 'sprint-planning' | 'analytics' | 'generic';

const MODELS = {
  GEMINI_FLASH: 'google/gemini-flash-1.5',
  GPT_4O_MINI: 'openai/gpt-4o-mini',
  DEEPSEEK_V3: 'deepseek/deepseek-chat',
  LLAMA_31_70B: 'meta-llama/llama-3.1-70b-instruct'
} as const;

function hash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

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

function pickModel(taskType: AITaskType, strictSchema: boolean, override?: CallAIOptions['modelOverride']) {
  if (override) return override;
  if (strictSchema) return 'gpt-4o-mini';
  return 'gemini-flash-1.5';
}

function modelId(name: NonNullable<CallAIOptions['modelOverride']>) {
  switch (name) {
    case 'gemini-flash-1.5':
      return MODELS.GEMINI_FLASH;
    case 'gpt-4o-mini':
      return MODELS.GPT_4O_MINI;
    case 'deepseek-v3':
      return MODELS.DEEPSEEK_V3;
    case 'llama-3.1-70b':
      return MODELS.LLAMA_31_70B;
  }
}

export async function callAI(
  taskType: AITaskType,
  messages: ChatMessage[],
  schema?: JSONSchema,
  options: CallAIOptions = {}
): Promise<{ text: string; json?: any; stream?: ReadableStream<Uint8Array> }>
{
  const strict = Boolean(schema?.schema);
  const chosen = pickModel(taskType, strict, options.modelOverride);
  const model = modelId(chosen);
  const temperature = options.temperature ?? 0.7;
  const max_tokens = options.maxTokens ?? 4000;

  const cacheKey = `ai:${hash(JSON.stringify({ taskType, messages, schema, model, temperature, max_tokens }))}`;
  if (!options.force) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      return parsed;
    }
  }

  // Build base payload
  let body: any = {
    model,
    messages,
    temperature,
    max_tokens
  };

  // Response format for strict JSON via OpenAI
  if (strict && chosen === 'gpt-4o-mini' && schema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: schema.name,
        schema: schema.schema,
        strict: schema.strict ?? true
      }
    };
  }

  const useStreaming = chosen === 'gemini-flash-1.5';
  body.stream = useStreaming;

  async function handleResponse(res: Response): Promise<{ text: string; json?: any; stream?: ReadableStream<Uint8Array> }>
  {
    if (useStreaming) {
      if (!res.ok || !res.body) throw new Error(`AI HTTP error: ${res.status}`);
      // Return raw stream; caller will parse SSE or tokens
      const value = { text: '', stream: res.body as ReadableStream<Uint8Array> };
      // Do not cache streaming partials; caller can cache after aggregation
      return value;
    } else {
      if (!res.ok) throw new Error(`AI HTTP error: ${res.status}`);
      const json = await res.json();
      const text: string = json?.choices?.[0]?.message?.content || '';
      let parsed: any | undefined;
      if (strict) {
        try {
          parsed = JSON.parse(text);
        } catch {
          const m = text.match(/\{[\s\S]*\}/);
          if (m) parsed = JSON.parse(m[0]);
        }
      }
      const value = { text, json: parsed };
      await redis.set(cacheKey, JSON.stringify(value), { ex: 3600 });
      return value;
    }
  }

  // Attempt primary provider
  try {
    const res = await callOpenRouter(body);
    if (res.status === 429 || res.status >= 500) throw new Error('provider error');
    return await handleResponse(res);
  } catch (_primaryErr) {
    // Fallback to DeepSeek
    try {
      const res = await callOpenRouter({ ...body, model: MODELS.DEEPSEEK_V3, stream: false });
      return await handleResponse(res);
    } catch (_dsErr) {
      // Optional Llama fallback
      if (process.env.USE_LLAMACHAIN) {
        const res = await callOpenRouter({ ...body, model: MODELS.LLAMA_31_70B, stream: false });
        return await handleResponse(res);
      }
      throw _dsErr;
    }
  }
}


