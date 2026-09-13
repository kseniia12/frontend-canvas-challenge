import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useCanvas } from '../store';
import { Button } from '../ui/Button';
import { useEditor } from './editor-context';

export function GeneratorNode({ id, selected }: NodeProps) {
  const { generate, remove } = useEditor();
  const { busyId } = useCanvas();
  const pending = busyId === id;
  return (
    <div className={selected ? 'rf-node is-selected' : 'rf-node'}>
      <Handle type="target" position={Position.Left} id="in" />
      <header>Генератор</header>
      <p className="muted">Сохраняет граф, затем запускает тестовую картинку.</p>
      <div className="node-actions nodrag">
        <Button
          pending={pending}
          pendingLabel="Ждём сервер…"
          onClick={() => generate(id, 'success')}
        >
          Сгенерировать
        </Button>
        <Button
          variant="ghost"
          pending={pending}
          pendingLabel="Ждём сервер…"
          onClick={() => generate(id, 'failure')}
        >
          Проверить отказ
        </Button>
        <button type="button" className="linkish" onClick={() => remove(id)}>
          Удалить
        </button>
      </div>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}
