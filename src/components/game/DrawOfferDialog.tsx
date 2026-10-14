'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Handshake, X } from 'lucide-react';
import { Button } from '../ui/Button';

export interface DrawOfferDialogProps {
  open: boolean;
  /** true = offered by the opponent (needs a response), false = ours is pending. */
  incoming: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onCancel?: () => void;
}

/** Sliding toast-style dialog used for the draw offer handshake. */
export function DrawOfferDialog({ open, incoming, onAccept, onDecline, onCancel }: DrawOfferDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.97 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-auto fixed inset-x-0 top-4 z-[150] mx-auto w-[min(94vw,420px)] overflow-hidden rounded-xl border border-accent/40 bg-arena-panel/98 shadow-2xl backdrop-blur"
          role="alertdialog"
        >
          <div className="flex items-center gap-3 border-b border-arena-line/50 bg-accent/10 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-accent">
              <Handshake className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-arena-text">
                {incoming ? 'Draw offer' : 'Draw offered'}
              </p>
              <p className="text-xs text-arena-muted">
                {incoming ? 'Your opponent offers a draw.' : 'Waiting for your opponent…'}
              </p>
            </div>
            {!incoming && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                aria-label="Cancel draw offer"
                className="rounded p-1 text-arena-dim hover:text-arena-text"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex gap-2 p-3">
            {incoming ? (
              <>
                <Button fullWidth onClick={onAccept}>
                  Accept
                </Button>
                <Button variant="secondary" fullWidth onClick={onDecline}>
                  Decline
                </Button>
              </>
            ) : (
              <Button variant="secondary" fullWidth onClick={onCancel}>
                Cancel offer
              </Button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
