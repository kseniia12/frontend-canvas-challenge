import type { NodeTypes } from '@xyflow/react';
import { GeneratorNode } from './GeneratorNode';
import { PromptNode } from './PromptNode';
import { ResultNode } from './ResultNode';

export const nodeTypes: NodeTypes = {
  prompt: PromptNode,
  generator: GeneratorNode,
  result: ResultNode,
};
