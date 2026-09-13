import { useSyncExternalStore } from 'react';
import type { GenerationData, GraphData, SpaceData } from '@canvas/contracts';
import { isAbort, isAppError, toAppError } from './api/errors';
import { isTerminalStatus, pollUntil, sleep } from './api/poll';
import { api, type Config } from './api/resources';
import { blankGraph, chainForGenerator, serializeGraph } from './lib/graph';
import { persist } from './lib/persist';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
export type Notice = { tone: 'error' | 'info'; text: string };

export type CanvasState = {
  ready: boolean;
  spaces: SpaceData[];
  space: SpaceData | null;
  config: Config | null;
  etag: string | null;
  save: SaveStatus;
  notice: Notice | null;
  results: Map<string, GenerationData>;
  busyId: string | null;
};

type Intent = { hash: string; key: string };

const listeners = new Set<() => void>();

let state: CanvasState = {
  ready: false,
  spaces: [],
  space: null,
  config: null,
  etag: null,
  save: 'saved',
  notice: null,
  results: new Map(),
  busyId: null,
};

let getGraph: () => GraphData = blankGraph;
let putGraph: ((graph: GraphData) => void) | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saving = false;
let queued = false;
let lastSavedRaw = '';
let inFlight: Promise<void> | null = null;
const watches = new Map<string, AbortController>();

function emit(): void {
  for (const listener of listeners) listener();
}

function patch(next: Partial<CanvasState>): void {
  state = { ...state, ...next };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCanvasState(): CanvasState {
  return state;
}

export function useCanvas(): CanvasState {
  return useSyncExternalStore(subscribe, getCanvasState);
}

function noticeFrom(error: unknown): Notice {
  return { tone: 'error', text: toAppError(error).userMessage };
}

export function bindEditor(read: () => GraphData, write: (graph: GraphData) => void): void {
  getGraph = read;
  putGraph = write;
}

function intentKey(hash: string, rotate: boolean): string {
  const saved = persist.get<Intent>('genIntent');
  if (!rotate && saved && saved.hash === hash) return saved.key;
  const key = crypto.randomUUID();
  persist.set('genIntent', { hash, key });
  return key;
}

function indexResults(list: GenerationData[]): Map<string, GenerationData> {
  const map = new Map<string, GenerationData>();
  for (const item of list) {
    if (!map.has(item.resultNodeId)) map.set(item.resultNodeId, item);
  }
  return map;
}

function stopPoll(): void {
  for (const controller of watches.values()) controller.abort();
  watches.clear();
}

async function watchGeneration(job: GenerationData, delayMs: number): Promise<void> {
  if (watches.has(job.id)) return;
  const controller = new AbortController();
  watches.set(job.id, controller);
  const { signal } = controller;
  const spaceId = job.spaceId;
  try {
    let latest = job;
    if (!isTerminalStatus(latest.status)) {
      if (delayMs > 0) await sleep(delayMs, signal);
      latest = await pollUntil({
        read: (inner) => api.generations.get(spaceId, job.id, inner),
        done: (value) => isTerminalStatus(value.status),
        intervalMs: state.config?.pollIntervalMs ?? 500,
        signal,
        isCurrent: () => watches.get(job.id) === controller,
      });
    }
    if (watches.get(job.id) !== controller) return;
    applyFinished(latest);
  } catch (error) {
    if (isAbort(error) || watches.get(job.id) !== controller) return;
    patch({ notice: noticeFrom(error) });
  } finally {
    if (watches.get(job.id) === controller) watches.delete(job.id);
  }
}

function applyFinished(job: GenerationData): void {
  const graph = getGraph();
  let resultExists = false;
  let stillLinked = false;
  for (const node of graph.nodes) {
    if (node.id === job.resultNodeId) resultExists = true;
  }
  for (const edge of graph.edges) {
    if (edge.source === job.nodeId && edge.target === job.resultNodeId) stillLinked = true;
  }
  const current = state.results.get(job.resultNodeId);
  if (current && current.id !== job.id && current.createdAt > job.createdAt) return;
  if (!resultExists || !stillLinked) return;

  const results = new Map(state.results);
  results.set(job.resultNodeId, job);
  persist.remove('genIntent');
  patch({
    results,
    busyId: state.busyId === job.nodeId ? null : state.busyId,
  });
}

async function loadHome(): Promise<void> {
  try {
    const [spaces, config] = await Promise.all([api.spaces.list(), api.config.get()]);
    patch({ spaces, config, ready: true, notice: null });
  } catch (error) {
    if (isAbort(error)) return;
    patch({ ready: true, notice: noticeFrom(error) });
  }
}

export function boot(): Promise<void> {
  return loadHome();
}

export async function createSpace(title: string): Promise<SpaceData | null> {
  const name = title.trim();
  if (name.length < 1) {
    patch({ notice: { tone: 'error', text: 'Укажите название пространства.' } });
    return null;
  }
  try {
    const space = await api.spaces.create(name);
    persist.set('spaceId', space.id);
    const spaces = [space, ...state.spaces];
    patch({ space, spaces, notice: null });
    return space;
  } catch (error) {
    if (isAbort(error)) return null;
    patch({ notice: noticeFrom(error) });
    return null;
  }
}

export async function openSpace(spaceId: string): Promise<GraphData | null> {
  stopPoll();
  patch({ notice: null, save: 'saved', busyId: null });
  try {
    const [space, graphRes, generations, config] = await Promise.all([
      api.spaces.get(spaceId),
      api.graph.get(spaceId),
      api.generations.list(spaceId),
      state.config ? Promise.resolve(state.config) : api.config.get(),
    ]);
    persist.set('spaceId', spaceId);
    lastSavedRaw = serializeGraph(graphRes.graph);
    const results = indexResults(generations);
    patch({
      space,
      config,
      etag: graphRes.etag,
      results,
      save: 'saved',
      ready: true,
    });
    putGraph?.(graphRes.graph);
    for (const job of generations) {
      if (job.status === 'processing') void watchGeneration(job, 0);
    }
    return graphRes.graph;
  } catch (error) {
    if (isAbort(error)) return null;
    patch({ notice: noticeFrom(error) });
    return null;
  }
}

export function lastSpaceId(): string | null {
  return persist.get<string>('spaceId');
}

export function markDirty(): void {
  if (state.save !== 'conflict') patch({ save: 'dirty' });
  scheduleSave();
}

function scheduleSave(): void {
  if (!state.space || state.save === 'conflict') return;
  const wait = state.config?.debounceMs ?? 500;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushSave();
  }, wait);
}

async function flushSave(): Promise<boolean> {
  if (!state.space) return false;
  if (state.save === 'conflict') return false;
  if (saving) {
    queued = true;
    return false;
  }
  const graph = getGraph();
  const raw = serializeGraph(graph);
  if (raw === lastSavedRaw && state.etag) {
    patch({ save: 'saved' });
    return true;
  }
  if (!state.etag) {
    patch({
      save: 'error',
      notice: { tone: 'error', text: 'Нет ETag. Перечитайте граф.' },
    });
    return false;
  }
  saving = true;
  patch({ save: 'saving' });
  const run = (async () => {
    try {
      const saved = await api.graph.put(state.space!.id, graph, state.etag!);
      lastSavedRaw = serializeGraph(saved.graph);
      patch({ etag: saved.etag, save: queued ? 'dirty' : 'saved', notice: null });
      return true;
    } catch (error) {
      if (isAbort(error)) return false;
      if (isAppError(error) && error.status === 412) {
        queued = false;
        patch({
          save: 'conflict',
          notice: {
            tone: 'error',
            text: 'Конфликт версии. Черновик на канвасе сохранён. Можно загрузить граф с сервера.',
          },
        });
        return false;
      }
      patch({ save: 'error', notice: noticeFrom(error) });
      return false;
    } finally {
      saving = false;
      inFlight = null;
      if (queued && state.save !== 'conflict') {
        queued = false;
        await flushSave();
      }
    }
  })();
  inFlight = run.then(() => undefined);
  return run;
}

export async function saveNow(): Promise<boolean> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (inFlight) await inFlight;
  if (state.save === 'conflict') return false;
  const raw = serializeGraph(getGraph());
  if (raw === lastSavedRaw && state.etag) return true;
  return flushSave();
}

export async function reloadFromServer(): Promise<void> {
  if (!state.space) return;
  queued = false;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const graph = await openSpace(state.space.id);
  if (graph)
    patch({
      notice: { tone: 'info', text: 'Загружен граф с сервера. Локальный черновик заменён.' },
    });
}

export async function startGeneration(
  nodeId: string,
  scenario: 'success' | 'failure',
  nodes: { id: string; data: Record<string, unknown> }[],
  edges: { source: string; target: string }[],
): Promise<void> {
  if (!state.space) return;
  if (state.busyId === nodeId) return;
  const chain = chainForGenerator(nodeId, nodes, edges);
  if (!chain.promptId || !chain.resultId || !chain.text.trim()) {
    patch({
      notice: { tone: 'error', text: 'Соедините непустой текст, генератор и результат.' },
    });
    return;
  }
  patch({ busyId: nodeId, notice: null });
  const ok = await saveNow();
  if (!ok || !state.etag) {
    patch({
      busyId: null,
      notice: {
        tone: 'error',
        text:
          state.save === 'conflict'
            ? 'Сначала разберите конфликт сохранения.'
            : 'Не удалось сохранить граф. Генерация не запущена.',
      },
    });
    return;
  }
  const body = { nodeId, graphETag: state.etag, scenario };
  const hash = JSON.stringify(body);
  const fresh = Boolean(
    state.results.get(chain.resultId) &&
    isTerminalStatus(state.results.get(chain.resultId)!.status),
  );
  try {
    const { generation, retryAfterMs } = await api.generations.create(
      state.space.id,
      body,
      intentKey(hash, fresh),
    );
    const results = new Map(state.results);
    results.set(generation.resultNodeId, generation);
    patch({ results });
    if (isTerminalStatus(generation.status)) applyFinished(generation);
    else void watchGeneration(generation, retryAfterMs);
  } catch (error) {
    if (isAbort(error)) return;
    patch({ busyId: null, notice: noticeFrom(error) });
  }
}

export function leaveSpace(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  stopPoll();
}

export function clearNotice(): void {
  if (state.notice) patch({ notice: null });
}
