import type { GraphData, NodeData } from '@canvas/contracts';

export type NodeKind = NodeData['type'];

export type ApiNode = GraphData['nodes'][number];
export type ApiEdge = GraphData['edges'][number];

export type FlowNode = {
  id: string;
  type: NodeKind;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
};

const emptyGraph = (): GraphData => ({
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
});

export function blankGraph(): GraphData {
  return emptyGraph();
}

export function nodeDataFor(type: NodeKind): ApiNode['data'] {
  if (type === 'prompt') return { text: '' };
  if (type === 'generator') return { label: 'Генератор' };
  return { label: 'Результат' };
}

export function titleFor(type: NodeKind): string {
  if (type === 'prompt') return 'Текст';
  if (type === 'generator') return 'Генератор';
  return 'Результат';
}

/** One pass: id → node. Rebuilt when the node list identity changes, not on each hover. */
export function indexNodes(nodes: readonly ApiNode[]): Map<string, ApiNode> {
  const map = new Map<string, ApiNode>();
  for (const node of nodes) map.set(node.id, node);
  return map;
}

export function indexEdges(edges: readonly ApiEdge[]): {
  byId: Map<string, ApiEdge>;
  byTarget: Map<string, ApiEdge>;
  generatorOut: Set<string>;
} {
  const byId = new Map<string, ApiEdge>();
  const byTarget = new Map<string, ApiEdge>();
  const generatorOut = new Set<string>();
  for (const edge of edges) {
    byId.set(edge.id, edge);
    byTarget.set(edge.target, edge);
    generatorOut.add(edge.source);
  }
  return { byId, byTarget, generatorOut };
}

export function canConnect(
  sourceType: NodeKind | undefined,
  targetType: NodeKind | undefined,
  targetId: string,
  sourceId: string,
  byTarget: Map<string, ApiEdge>,
  generatorOut: Set<string>,
): boolean {
  if (!sourceType || !targetType || sourceId === targetId) return false;
  if (byTarget.has(targetId)) return false;
  if (sourceType === 'prompt' && targetType === 'generator') return true;
  if (sourceType === 'generator' && targetType === 'result') return !generatorOut.has(sourceId);
  return false;
}

function asKind(value: string | undefined): NodeKind | null {
  if (value === 'prompt' || value === 'generator' || value === 'result') return value;
  return null;
}

/** Strip React Flow internals. One pass, no intermediate filter/map. */
export function toApiGraph(
  nodes: readonly {
    id: string;
    type?: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }[],
  edges: readonly { id: string; source: string; target: string }[],
  viewport: GraphData['viewport'],
): GraphData {
  const apiNodes: ApiNode[] = [];
  for (const node of nodes) {
    const type = asKind(node.type);
    if (!type) continue;
    if (type === 'prompt') {
      const text = typeof node.data.text === 'string' ? node.data.text : '';
      apiNodes.push({
        id: node.id,
        type,
        position: { x: node.position.x, y: node.position.y },
        data: { text },
      });
    } else {
      const label = typeof node.data.label === 'string' ? node.data.label : titleFor(type);
      apiNodes.push({
        id: node.id,
        type,
        position: { x: node.position.x, y: node.position.y },
        data: { label },
      });
    }
  }
  const apiEdges: ApiEdge[] = [];
  for (const edge of edges) {
    apiEdges.push({ id: edge.id, source: edge.source, target: edge.target });
  }
  return {
    nodes: apiNodes,
    edges: apiEdges,
    viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
  };
}

export function toFlowNodes(graph: GraphData): FlowNode[] {
  const nodes: FlowNode[] = [];
  for (const node of graph.nodes) {
    nodes.push({
      id: node.id,
      type: node.type,
      position: node.position,
      data: { ...node.data },
    });
  }
  return nodes;
}

export function toFlowEdges(graph: GraphData): FlowEdge[] {
  const edges: FlowEdge[] = [];
  for (const edge of graph.edges) {
    edges.push({ id: edge.id, source: edge.source, target: edge.target });
  }
  return edges;
}

export function serializeGraph(graph: GraphData): string {
  return JSON.stringify(graph);
}

export function replaceNode<T extends { id: string; data: Record<string, unknown> }>(
  nodes: T[],
  id: string,
  data: Record<string, unknown>,
): T[] {
  let index = -1;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) {
      index = i;
      break;
    }
  }
  if (index === -1) return nodes;
  const current = nodes[index];
  const next = nodes.slice();
  next[index] = { ...current, data: { ...current.data, ...data } };
  return next;
}

export function dropNode<N extends { id: string }, E extends { source: string; target: string }>(
  nodes: N[],
  edges: E[],
  id: string,
): { nodes: N[]; edges: E[] } {
  const nextNodes: N[] = [];
  for (const node of nodes) if (node.id !== id) nextNodes.push(node);
  const nextEdges: E[] = [];
  for (const edge of edges) if (edge.source !== id && edge.target !== id) nextEdges.push(edge);
  return { nodes: nextNodes, edges: nextEdges };
}

export function chainForGenerator(
  generatorId: string,
  nodes: readonly { id: string; data: Record<string, unknown> }[],
  edges: readonly { source: string; target: string }[],
): { promptId: string | null; resultId: string | null; text: string } {
  let promptId: string | null = null;
  let resultId: string | null = null;
  for (const edge of edges) {
    if (edge.target === generatorId) promptId = edge.source;
    else if (edge.source === generatorId) resultId = edge.target;
  }
  let text = '';
  if (promptId) {
    for (const node of nodes) {
      if (node.id === promptId) {
        text = typeof node.data.text === 'string' ? node.data.text : '';
        break;
      }
    }
  }
  return { promptId, resultId, text };
}
