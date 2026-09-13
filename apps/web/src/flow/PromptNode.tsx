import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useEditor } from './editor-context';

export function PromptNode({ id, data, selected }: NodeProps) {
  const { setPrompt, remove } = useEditor();
  const text = typeof data.text === 'string' ? data.text : '';
  return (
    <div className={selected ? 'rf-node is-selected' : 'rf-node'}>
      <header>Текст</header>
      <label className="sr-only" htmlFor={`prompt-${id}`}>
        Описание изображения
      </label>
      <textarea
        id={`prompt-${id}`}
        className="nodrag nowheel"
        rows={4}
        maxLength={2000}
        placeholder="Опишите изображение"
        value={text}
        onChange={(event) => setPrompt(id, event.target.value)}
      />
      <button type="button" className="linkish nodrag" onClick={() => remove(id)}>
        Удалить
      </button>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}
