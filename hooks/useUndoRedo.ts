import { useRef, useState, useCallback } from 'react';

const MAX_HISTORY = 50;

export interface UndoRedoControls<T> {
  pushState: (state: T) => void;
  undo: () => T | undefined;
  redo: () => T | undefined;
  canUndo: boolean;
  canRedo: boolean;
  reset: (initial: T) => void;
}

export function useUndoRedo<T>(initial: T): UndoRedoControls<T> {
  const historyRef = useRef<T[]>([initial]);
  const indexRef = useRef(0);
  const [revision, setRevision] = useState(0);

  const bump = useCallback(() => setRevision(r => r + 1), []);

  const pushState = useCallback((state: T) => {
    const history = historyRef.current;
    const trimmed = history.slice(0, indexRef.current + 1);
    trimmed.push(state);
    if (trimmed.length > MAX_HISTORY) trimmed.shift();
    historyRef.current = trimmed;
    indexRef.current = trimmed.length - 1;
    bump();
  }, [bump]);

  const undo = useCallback((): T | undefined => {
    if (indexRef.current <= 0) return undefined;
    indexRef.current -= 1;
    bump();
    return historyRef.current[indexRef.current];
  }, [bump]);

  const redo = useCallback((): T | undefined => {
    if (indexRef.current >= historyRef.current.length - 1) return undefined;
    indexRef.current += 1;
    bump();
    return historyRef.current[indexRef.current];
  }, [bump]);

  const reset = useCallback((state: T) => {
    historyRef.current = [state];
    indexRef.current = 0;
    bump();
  }, [bump]);

  const canUndo = indexRef.current > 0;
  const canRedo = indexRef.current < historyRef.current.length - 1;

  return { pushState, undo, redo, canUndo, canRedo, reset };
}
