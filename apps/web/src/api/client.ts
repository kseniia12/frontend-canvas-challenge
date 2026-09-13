import { AppError } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type RequestSpec = {
  method: HttpMethod;
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  ifMatch?: string | null;
  ifNoneMatch?: string | null;
  signal?: AbortSignal;
};

export type RequestResult<T> = {
  data: T;
  status: number;
  headers: Headers;
};

const baseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

function headersFor(spec: RequestSpec): Headers {
  const headers = new Headers();
  if (spec.body !== undefined) headers.set('Content-Type', 'application/json');
  if (spec.idempotencyKey) headers.set('Idempotency-Key', spec.idempotencyKey);
  if (spec.ifMatch) headers.set('If-Match', spec.ifMatch);
  if (spec.ifNoneMatch) headers.set('If-None-Match', spec.ifNoneMatch);
  return headers;
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 304) return undefined;
  const raw = await response.text();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw AppError.parse();
  }
}

export async function send<T>(spec: RequestSpec): Promise<RequestResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${spec.path}`, {
      method: spec.method,
      headers: headersFor(spec),
      body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
      signal: spec.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw AppError.network();
  }

  const requestId = response.headers.get('X-Request-Id');
  const body = await readBody(response);
  if (!response.ok) throw AppError.fromResponse(response.status, body, requestId);

  return { data: body as T, status: response.status, headers: response.headers };
}

export async function request<T>(spec: RequestSpec): Promise<T> {
  const result = await send<T>(spec);
  return result.data;
}
