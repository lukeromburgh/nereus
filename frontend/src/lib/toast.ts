import { useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

let toastStack: Toast[] = [];
let toastCallback: ((toasts: Toast[]) => void) | null = null;

function emitToasts() {
  if (toastCallback) {
    toastCallback([...toastStack]);
  }
}

function removeToast(id: string) {
  toastStack = toastStack.filter((t) => t.id !== id);
  emitToasts();
}

function addToast(type: ToastType, message: string, duration?: number): Toast {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const toast: Toast = {
    id,
    type,
    message,
    duration,
  };

  // FIFO with newest at bottom and oldest at top.
  toastStack = [...toastStack, toast];
  emitToasts();

  const timeout = duration ?? (type === 'error' ? 3000 : 2000);

  window.setTimeout(() => {
    removeToast(id);
  }, timeout);

  return toast;
}

export const toast = {
  success: (message: string, duration?: number) => addToast('success', message, duration ?? 2000),
  error: (message: string, duration?: number) => addToast('error', message, duration ?? 3000),
  info: (message: string, duration?: number) => addToast('info', message, duration ?? 2000),
};

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    toastCallback = setToasts;
    requestAnimationFrame(() => setToasts([...toastStack]));

    return () => {
      if (toastCallback === setToasts) {
        toastCallback = null;
      }
    };
  }, []);

  return toasts;
}
