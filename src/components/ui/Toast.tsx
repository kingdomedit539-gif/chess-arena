'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { create } from 'zustand';
import { uid } from '@/lib/utils';

export type ToastLevel = 'info' | 'success' | 'warn' | 'error';

export interface Toast {
  id: string;
  level: ToastLevel;
  title: string;
  description?: string;
  /** Milliseconds on screen; 0 keeps it until dismissed. */
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  push(toast: Omit<Toast, 'id'>): string;
  dismiss(id: string): void;
  clear(): void;
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (toast) => {
    const id = uid('t_');
    set((state) => ({ toasts: [...state.toasts.slice(-4), { id, duration: 4200, ...toast }] }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Imperative helper so non-React code (socket handlers) can raise toasts. */
export function toast(input: Omit<Toast, 'id'>) {
  return useToastStore.getState().push(input);
}

export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[min(92vw,360px)] flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

const ICONS: Record<ToastLevel, React.ReactNode> = {
  info: <Info className="h-4 w-4 text-info" />,
  success: <CheckCircle2 className="h-4 w-4 text-accent" />,
  warn: <AlertTriangle className="h-4 w-4 text-warn" />,
  error: <AlertTriangle className="h-4 w-4 text-danger" />,
};

function ToastCard({ toast: t, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 30, scale: 0.96 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      onAnimationComplete={() => {
        if (t.duration) window.setTimeout(onDismiss, t.duration);
      }}
      className="pointer-events-auto flex items-start gap-3 rounded-lg border border-white/10 bg-arena-panel/95 p-3 shadow-panel backdrop-blur"
    >
      <div className="mt-0.5">{ICONS[t.level]}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-arena-text">{t.title}</p>
        {t.description && <p className="mt-0.5 text-xs text-arena-muted">{t.description}</p>}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded p-0.5 text-arena-dim transition-colors hover:text-arena-text"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}
