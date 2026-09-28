import { create } from 'zustand';
import { uid } from '../utils/id';

// Program-wide UI feedback: promise-based confirm/prompt dialogs and
// non-blocking toasts, so no component ever needs window.alert/confirm/prompt.

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** Render the confirm button as destructive. */
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  /** HTML input type, e.g. 'password'. Defaults to text. */
  inputType?: string;
  /** When true, an empty submission resolves '' instead of being treated as cancel. */
  allowEmpty?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface PromptRequest extends PromptOptions {
  resolve: (value: string | null) => void;
}

const TOAST_DURATION_MS = 4500;

interface UiStoreState {
  toasts: Toast[];
  confirmRequest: ConfirmRequest | null;
  promptRequest: PromptRequest | null;
  pushToast: (kind: ToastKind, message: string) => void;
  dismissToast: (id: string) => void;
  requestConfirm: (options: ConfirmOptions) => Promise<boolean>;
  requestPrompt: (options: PromptOptions) => Promise<string | null>;
  resolveConfirm: (value: boolean) => void;
  resolvePrompt: (value: string | null) => void;
}

export const useUiStore = create<UiStoreState>((set, get) => ({
  toasts: [],
  confirmRequest: null,
  promptRequest: null,

  pushToast: (kind, message) => {
    const id = uid();
    set(state => ({ toasts: [...state.toasts, { id, kind, message }] }));
    window.setTimeout(() => get().dismissToast(id), TOAST_DURATION_MS);
  },

  dismissToast: (id) => {
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }));
  },

  // Only one dialog at a time; a second request cancels the pending one so the
  // promise never hangs.
  requestConfirm: (options) => {
    get().confirmRequest?.resolve(false);
    return new Promise<boolean>((resolve) => {
      set({ confirmRequest: { ...options, resolve } });
    });
  },

  requestPrompt: (options) => {
    get().promptRequest?.resolve(null);
    return new Promise<string | null>((resolve) => {
      set({ promptRequest: { ...options, resolve } });
    });
  },

  resolveConfirm: (value) => {
    get().confirmRequest?.resolve(value);
    set({ confirmRequest: null });
  },

  resolvePrompt: (value) => {
    get().promptRequest?.resolve(value);
    set({ promptRequest: null });
  },
}));

// Function-style helpers for use outside React components.
export const toast = {
  info: (message: string) => useUiStore.getState().pushToast('info', message),
  success: (message: string) => useUiStore.getState().pushToast('success', message),
  error: (message: string) => useUiStore.getState().pushToast('error', message),
};

export const confirmDialog = (options: ConfirmOptions) => useUiStore.getState().requestConfirm(options);
export const promptDialog = (options: PromptOptions) => useUiStore.getState().requestPrompt(options);
