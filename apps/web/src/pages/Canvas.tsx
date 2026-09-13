import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  bindEditor,
  clearNotice,
  leaveSpace,
  markDirty,
  openSpace,
  reloadFromServer,
  startGeneration,
  useCanvas,
} from '../store';
import {
  canConnect,
  dropNode,
  indexEdges,
  nodeDataFor,
  replaceNode,
  titleFor,
  toApiGraph,
  toFlowEdges,
  toFlowNodes,
  type NodeKind,
} from '../lib/graph';
import { EditorContext, type EditorApi } from '../flow/editor-context';
import { nodeTypes } from '../flow/nodeTypes';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';

function isKind(value: string | undefined): value is NodeKind {
  return value === 'prompt' || value === 'generator' || value === 'result';
}

function persistChanges(changes: { type: string; dragging?: boolean }[]): boolean {
  for (const change of changes) {
    if (change.type === 'select') continue;
    if (change.type === 'dimensions') continue;
    if (change.type === 'position' && change.dragging) continue;
    return true;
  }
  return false;
}

function SaveBar() {
  const { save, notice, space } = useCanvas();
  const label =
    save === 'saving'
      ? 'Сохраняем…'
      : save === 'dirty'
        ? 'Есть несохранённые правки'
        : save === 'conflict'
          ? 'Конфликт версии'
          : save === 'error'
            ? 'Ошибка сохранения'
            : 'Сохранено';
  return (
    <div className="savebar">
      <span className={`save save-${save}`}>{label}</span>
      {space ? <span className="muted">{space.title}</span> : null}
      {save === 'conflict' ? (
        <Button variant="ghost" onClick={() => void reloadFromServer()}>
          Загрузить граф с сервера
        </Button>
      ) : null}
      <Notice notice={notice} />
      {notice ? (
        <button type="button" className="linkish" onClick={clearNotice}>
          Скрыть
        </button>
      ) : null}
    </div>
  );
}

export function CanvasPage() {
  const { spaceId = '' } = useParams();
  const { config } = useCanvas();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [loaded, setLoaded] = useState(false);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const viewportRef = useRef(viewport);
  const typesRef = useRef(new Map<string, NodeKind>());
  const edgeIndexRef = useRef(indexEdges([]));

  nodesRef.current = nodes;
  edgesRef.current = edges;
  viewportRef.current = viewport;

  const syncIndex = (nextNodes: Node[], nextEdges: Edge[]) => {
    const types = new Map<string, NodeKind>();
    for (const node of nextNodes) {
      if (isKind(node.type)) types.set(node.id, node.type);
    }
    typesRef.current = types;
    const apiEdges = [];
    for (const edge of nextEdges)
      apiEdges.push({ id: edge.id, source: edge.source, target: edge.target });
    edgeIndexRef.current = indexEdges(apiEdges);
  };

  useEffect(() => {
    bindEditor(
      () => toApiGraph(nodesRef.current, edgesRef.current, viewportRef.current),
      (graph) => {
        const nextNodes = toFlowNodes(graph) as Node[];
        const nextEdges = toFlowEdges(graph) as Edge[];
        setNodes(nextNodes);
        setEdges(nextEdges);
        setViewport(graph.viewport);
        syncIndex(nextNodes, nextEdges);
      },
    );
    setLoaded(false);
    void openSpace(spaceId).then((graph) => {
      if (graph) setLoaded(true);
    });
    return () => leaveSpace();
  }, [spaceId]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const removed: string[] = [];
    let structure = false;
    for (const change of changes) {
      if (change.type === 'remove') {
        removed.push(change.id);
        structure = true;
      } else if (change.type === 'add' || change.type === 'replace') structure = true;
    }
    setNodes((current) => {
      const next = applyNodeChanges(changes, current);
      if (structure) syncIndex(next, edgesRef.current);
      return next;
    });
    if (removed.length) {
      const drop = new Set(removed);
      setEdges((current) => {
        const next: Edge[] = [];
        for (const edge of current) {
          if (!drop.has(edge.source) && !drop.has(edge.target)) next.push(edge);
        }
        syncIndex(nodesRef.current, next);
        return next;
      });
    }
    if (persistChanges(changes)) markDirty();
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => {
      const next = applyEdgeChanges(changes, current);
      syncIndex(nodesRef.current, next);
      return next;
    });
    if (persistChanges(changes)) markDirty();
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    if (edgesRef.current.length >= (config?.maxEdges ?? 20)) return;
    const idx = edgeIndexRef.current;
    const allowed = canConnect(
      typesRef.current.get(connection.source),
      typesRef.current.get(connection.target),
      connection.target,
      connection.source,
      idx.byTarget,
      idx.generatorOut,
    );
    if (!allowed) return;
    setEdges((current) => {
      const next = addEdge({ ...connection, id: crypto.randomUUID() }, current);
      syncIndex(nodesRef.current, next);
      return next;
    });
    markDirty();
  }, []);

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    if (!connection.source || !connection.target) return false;
    const idx = edgeIndexRef.current;
    return canConnect(
      typesRef.current.get(connection.source),
      typesRef.current.get(connection.target),
      connection.target,
      connection.source,
      idx.byTarget,
      idx.generatorOut,
    );
  }, []);

  const addNode = (type: NodeKind) => {
    const max = config?.maxNodes ?? 20;
    if (nodesRef.current.length >= max) return;
    const count = nodesRef.current.length;
    const node: Node = {
      id: crypto.randomUUID(),
      type,
      position: { x: 48 + count * 36, y: 80 + (count % 5) * 28 },
      data: { ...nodeDataFor(type) },
    };
    setNodes((current) => {
      const next = current.concat(node);
      syncIndex(next, edgesRef.current);
      return next;
    });
    markDirty();
  };

  const editorApi = useMemo<EditorApi>(
    () => ({
      setPrompt: (id, text) => {
        setNodes((current) => replaceNode(current, id, { text }));
        markDirty();
      },
      generate: (id, scenario) => {
        void startGeneration(id, scenario, nodesRef.current, edgesRef.current);
      },
      remove: (id) => {
        setNodes((current) => {
          const dropped = dropNode(current, edgesRef.current, id);
          setEdges(dropped.edges);
          syncIndex(dropped.nodes, dropped.edges);
          return dropped.nodes;
        });
        markDirty();
      },
    }),
    [],
  );

  return (
    <EditorContext.Provider value={editorApi}>
      <div className="canvas-shell">
        <header className="canvas-top">
          <Link to="/">Все пространства</Link>
          <div className="adders">
            {(['prompt', 'generator', 'result'] as const).map((type) => (
              <Button key={type} variant="ghost" onClick={() => addNode(type)}>
                + {titleFor(type)}
              </Button>
            ))}
          </div>
          <SaveBar />
        </header>
        <div className="canvas-flow">
          {!loaded ? <p className="page muted">Открываем канвас…</p> : null}
          {loaded ? (
            <ReactFlow
              key={spaceId}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              defaultViewport={viewport}
              onMoveEnd={(_event, next) => {
                viewportRef.current = next;
                setViewport(next);
                markDirty();
              }}
              deleteKeyCode={['Backspace', 'Delete']}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          ) : null}
        </div>
      </div>
    </EditorContext.Provider>
  );
}
