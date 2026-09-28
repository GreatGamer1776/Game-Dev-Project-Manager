import React, { useEffect, useState } from 'react';
import { CheckCircle2, Info, XCircle, X } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input, Field } from './Input';
import { useUiStore, ToastKind } from '../../stores/useUiStore';
import { cn } from './cn';

/** Renders the pending confirm() dialog from useUiStore. Mount once at root. */
export const ConfirmHost: React.FC = () => {
  const request = useUiStore(s => s.confirmRequest);
  const resolveConfirm = useUiStore(s => s.resolveConfirm);

  if (!request) return null;
  return (
    <Modal
      open
      size="sm"
      title={request.title}
      onClose={() => resolveConfirm(false)}
      footer={
        <>
          <Button variant="ghost" onClick={() => resolveConfirm(false)}>
            {request.cancelText || 'Cancel'}
          </Button>
          <Button
            variant={request.danger ? 'danger' : 'primary'}
            autoFocus
            onClick={() => resolveConfirm(true)}
          >
            {request.confirmText || 'Confirm'}
          </Button>
        </>
      }
    >
      {request.message ? (
        <p className="text-sm text-muted leading-relaxed whitespace-pre-line">{request.message}</p>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          resolveConfirm(true);
        }}
      />
    </Modal>
  );
};

/** Renders the pending prompt() dialog from useUiStore. Mount once at root. */
export const PromptHost: React.FC = () => {
  const request = useUiStore(s => s.promptRequest);
  const resolvePrompt = useUiStore(s => s.resolvePrompt);
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(request?.defaultValue || '');
  }, [request]);

  if (!request) return null;
  const submit = () => resolvePrompt(value.trim() || (request.allowEmpty ? '' : null));

  return (
    <Modal
      open
      size="sm"
      title={request.title}
      onClose={() => resolvePrompt(null)}
      footer={
        <>
          <Button variant="ghost" onClick={() => resolvePrompt(null)}>
            {request.cancelText || 'Cancel'}
          </Button>
          <Button variant="primary" type="submit" form="ui-prompt-form" disabled={!value.trim() && !request.allowEmpty}>
            {request.confirmText || 'OK'}
          </Button>
        </>
      }
    >
      <form
        id="ui-prompt-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={request.label || ''} htmlFor="ui-prompt-input">
          <Input
            id="ui-prompt-input"
            autoFocus
            type={request.inputType || 'text'}
            value={value}
            placeholder={request.placeholder}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
};

const toastStyles: Record<ToastKind, { icon: React.ElementType; classes: string }> = {
  info: { icon: Info, classes: 'border-border-strong text-content' },
  success: { icon: CheckCircle2, classes: 'border-success/40 text-content [&_svg]:text-success' },
  error: { icon: XCircle, classes: 'border-danger/40 text-content [&_svg]:text-danger' },
};

/** Fixed toast stack. Mount once at root. */
export const ToastHost: React.FC = () => {
  const toasts = useUiStore(s => s.toasts);
  const dismissToast = useUiStore(s => s.dismissToast);

  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[80] flex w-80 flex-col gap-2">
      {toasts.map(t => {
        const { icon: Icon, classes } = toastStyles[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              'flex items-start gap-2.5 rounded-xl border bg-surface px-3.5 py-3 shadow-pop animate-scale-in',
              classes
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="flex-1 text-sm leading-snug">{t.message}</p>
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss"
              className="shrink-0 rounded p-0.5 text-faint hover:text-content hover:bg-surface-hover"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

/** One mount point for all app-level UI feedback. */
export const UiFeedback: React.FC = () => (
  <>
    <ConfirmHost />
    <PromptHost />
    <ToastHost />
  </>
);
