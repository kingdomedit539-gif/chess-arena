'use client';

import type { PieceSymbol } from '@/lib/types';
import type { PieceSetId } from '@/lib/chess/themes';
import { cn } from '@/lib/utils';
import { Piece } from '../board/Piece';

export interface CapturedPiecesProps {
  /** Pieces this player has captured (already ordered by value). */
  captured: PieceSymbol[];
  /** Material advantage this player has, e.g. +3. 0 hides the badge. */
  advantage: number;
  pieceSet: PieceSetId;
  className?: string;
}

const ORDER: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p'];

export function CapturedPieces({ captured, advantage, pieceSet, className }: CapturedPiecesProps) {
  const sorted = [...captured].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return (
    <div className={cn('flex min-h-[18px] items-center gap-1', className)}>
      <div className="flex items-center">
        {sorted.map((piece, index) => (
          <span
            key={`${piece}-${index}`}
            className="block h-[18px] w-[18px] shrink-0"
            style={{ marginLeft: index === 0 ? 0 : '-7px' }}
          >
            <Piece type={piece} color="w" set={pieceSet} flat />
          </span>
        ))}
      </div>
      {advantage > 0 && <span className="text-xs font-bold text-arena-muted">+{advantage}</span>}
    </div>
  );
}
