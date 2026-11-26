import { useCallback, useEffect, useRef, useState } from 'react';
import { useUndoRedo } from './useUndoRedo';
import type { SaveStatus } from '../components/ui';

const SAVE_DEBOUNCE_MS = 300;

export interface EditorDocument<T> {
  data: T;
  /** Applies a change. `batch` folds rapid edits (typing) into one undo step. */
  update: (fn: (current: T) => T, options?: { batch?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: SaveStatus;
  flushSave: () => void;
}

/**
 * State plumbing shared by the structured editors: debounced saves through
 * `onSave`, undo/redo history, Ctrl+S / Ctrl+Z / Ctrl+Y (outside text fields),
 * and a final save when the editor unmounts.
 */
export function useEditorDocument<T>(initial: () => T, onSave: (data: T) => void): EditorDocument<T> {
  const [data, setData] = useState<T>(initial);
  const dataRef = useRef(data);
  const history = useUndoRedo<T>(data);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');

  const historyTimer = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const flushSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    onSaveRef.current(dataRef.current);
    setSaveStatus('saved');
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushSave, SAVE_DEBOUNCE_MS);
    setSaveStatus('unsaved');
  }, [flushSave]);

  const update = useCallback((fn: (current: T) => T, { batch = false } = {}) => {
    const next = fn(dataRef.current);
    if (next === dataRef.current) return;
    dataRef.current = next;
    setData(next);
    if (historyTimer.current) window.clearTimeout(historyTimer.current);
    historyTimer.current = window.setTimeout(() => history.pushState(dataRef.current), batch ? 500 : 0);
    scheduleSave();
  }, [history, scheduleSave]);

  const restore = useCallback((next: T | undefined) => {
    if (next === undefined) return;
    if (historyTimer.current) window.clearTimeout(historyTimer.current);
    dataRef.current = next;
    setData(next);
    scheduleSave();
  }, [scheduleSave]);

  const undo = useCallback(() => restore(history.undo()), [history, restore]);
  const redo = useCallback(() => restore(history.redo()), [history, restore]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 's') { e.preventDefault(); flushSave(); return; }
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
      // Dialogs own their own keys.
      if (target.closest('[role="dialog"]')) return;
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flushSave, undo, redo]);

  useEffect(() => () => {
    if (historyTimer.current) window.clearTimeout(historyTimer.current);
    if (saveTimer.current) flushSave();
  }, [flushSave]);

  return { data, update, undo, redo, canUndo: history.canUndo, canRedo: history.canRedo, saveStatus, flushSave };
}
