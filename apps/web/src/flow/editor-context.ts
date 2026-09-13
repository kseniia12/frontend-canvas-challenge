import { createContext, useContext } from 'react';

export type EditorApi = {
  setPrompt: (id: string, text: string) => void;
  generate: (id: string, scenario: 'success' | 'failure') => void;
  remove: (id: string) => void;
};

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const value = useContext(EditorContext);
  if (!value) throw new Error('EditorContext missing');
  return value;
}
