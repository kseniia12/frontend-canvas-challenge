import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useCanvas } from '../store';
import { useEditor } from './editor-context';

export function ResultNode({ id, selected }: NodeProps) {
  const { remove } = useEditor();
  const { results } = useCanvas();
  const job = results.get(id);
  return (
    <div className={selected ? 'rf-node is-selected' : 'rf-node'}>
      <Handle type="target" position={Position.Left} id="in" />
      <header>Результат</header>
      {!job || job.status === 'processing' ? (
        <p className="muted" role="status">
          {job ? 'Генерация идёт…' : 'Картинки пока нет'}
        </p>
      ) : null}
      {job?.status === 'failed' ? (
        <p className="field-error" role="alert">
          Отказ генерации. Можно запустить снова с генератора.
        </p>
      ) : null}
      {job?.status === 'succeeded' && job.imageUrl ? (
        <img src={job.imageUrl} alt="Сгенерированное изображение" width={220} height={165} />
      ) : null}
      <button type="button" className="linkish nodrag" onClick={() => remove(id)}>
        Удалить
      </button>
    </div>
  );
}
