import type { GenerationData, GenerationRequest, GraphData, SpaceData } from '@canvas/contracts';
import { request, send } from './client';

export type Config = {
  debounceMs: number;
  pollIntervalMs: number;
  generationDelayMs: number;
  maxNodes: number;
  maxEdges: number;
  nodeTypes: string[];
};

export type GraphResponse = {
  graph: GraphData;
  etag: string | null;
};

function etagOf(headers: Headers): string | null {
  return headers.get('etag') ?? headers.get('ETag');
}

export const api = {
  config: {
    get: () => request<Config>({ method: 'GET', path: '/api/config' }),
  },
  spaces: {
    list: () => request<SpaceData[]>({ method: 'GET', path: '/api/spaces' }),
    create: (title: string) =>
      request<SpaceData>({ method: 'POST', path: '/api/spaces', body: { title } }),
    get: (id: string) => request<SpaceData>({ method: 'GET', path: `/api/spaces/${id}` }),
  },
  graph: {
    get: async (spaceId: string): Promise<GraphResponse> => {
      const result = await send<GraphData>({
        method: 'GET',
        path: `/api/spaces/${spaceId}/graph`,
      });
      return { graph: result.data, etag: etagOf(result.headers) };
    },
    put: async (spaceId: string, graph: GraphData, ifMatch: string): Promise<GraphResponse> => {
      const result = await send<GraphData>({
        method: 'PUT',
        path: `/api/spaces/${spaceId}/graph`,
        body: graph,
        ifMatch,
      });
      return { graph: result.data, etag: etagOf(result.headers) };
    },
  },
  generations: {
    list: (spaceId: string) =>
      request<GenerationData[]>({
        method: 'GET',
        path: `/api/spaces/${spaceId}/generations`,
      }),
    get: (spaceId: string, generationId: string, signal?: AbortSignal) =>
      request<GenerationData>({
        method: 'GET',
        path: `/api/spaces/${spaceId}/generations/${generationId}`,
        signal,
      }),
    create: async (spaceId: string, body: GenerationRequest, idempotencyKey: string) => {
      const result = await send<GenerationData>({
        method: 'POST',
        path: `/api/spaces/${spaceId}/generations`,
        body,
        idempotencyKey,
      });
      const retryAfter = Number(result.headers.get('Retry-After'));
      return {
        generation: result.data,
        retryAfterMs: result.status === 202 ? (retryAfter > 0 ? retryAfter * 1000 : 1000) : 0,
      };
    },
  },
};
