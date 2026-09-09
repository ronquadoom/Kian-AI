export type ProviderId = 'openrouter' | 'groq' | 'gemini';

export interface WireMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: { mime: string; data: string }[];
}

export interface ChatRequestPayload {
  provider: ProviderId;
  model: string;
  messages: WireMessage[];
  stream?: boolean;
  temperature?: number;
}

export type ProxyErrorCode =
  | 'bad_request'
  | 'provider_not_allowed'
  | 'model_invalid'
  | 'provider_not_configured'
  | 'rate_limited'
  | 'provider_error'
  | 'no_route'
  | 'internal';

export interface ProxyErrorBody {
  error: { code: ProxyErrorCode; message: string; status?: number };
}

export function errorBody(code: ProxyErrorCode, message: string, status?: number): ProxyErrorBody {
  const body: ProxyErrorBody = { error: { code, message } };
  if (status !== undefined) body.error.status = status;
  return body;
}

export function jsonError(code: ProxyErrorCode, message: string, status: number): Response {
  return new Response(JSON.stringify(errorBody(code, message, status)), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
