'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { Color, PieceSymbol } from '@/lib/types';
import type { PieceSetId } from '@/lib/chess/themes';
import { cn } from '@/lib/utils';
import { Piece } from './Piece';

const PROMOTION_PIECES: PieceSymbol[] = ['q', 'r', 'b', 'n'];

export interface PromotionPickerProps {
  color: Color;
  pieceSet: PieceSetId;
  /** Column index (0-7) of the promotion square, in board space. */
  file: number;
  onSelect: (piece: PieceSymbol) => void;
  onCancel: () => void;
}

/**
 * Floating promotion selector anchored to the promotion square. Rendered in
 * board space so it always appears above the pawn (or below, for black).
 */
export function PromotionPicker({ color, pieceSet, file, onSelect, onCancel }: PromotionPickerProps) {
  return (
    <div
      className="absolute inset-0 z-40"
      onPointerDown={(event) => {
        // Clicking the scrim cancels; clicks inside the picker are handled below.
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="absolute inset-0 bg-black/35" />
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: color === 'w' ? 10 : -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'absolute flex flex-col overflow-hidden rounded-lg border border-white/10 bg-arena-panel shadow-2xl',
            color === 'w' ? 'top-0' : 'bottom-0',
          )}
          style={{
            left: `${Math.min(6, Math.max(0, file)) * 12.5}%`,
            width: '12.5%',
          }}
        >
          {PROMOTION_PIECES.map((piece) => (
            <button
              key={piece}
              type="button"
              onClick={() => onSelect(piece)}
              className="flex aspect-square w-full items-center justify-center p-[8%] transition-colors hover:bg-accent/25 focus:bg-accent/25 focus:outline-none"
              aria-label={`Promote to ${piece}`}
            >
              <Piece type={piece} color={color} set={pieceSet} flat />
            </button>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
