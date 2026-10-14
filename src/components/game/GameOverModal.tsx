'use client';

import { motion } from 'framer-motion';
import { BarChart3, Clock, Handshake, RotateCcw, Trophy, Users, X } from 'lucide-react';
import type { Color, GameResult, PlayerPublic, RatingSnapshot } from '@/lib/types';
import { avatarGradient, cn, initials } from '@/lib/utils';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export interface GameOverModalProps {
  open: boolean;
  result: GameResult | null;
  myColor: Color | null;
  white: PlayerPublic | null;
  black: PlayerPublic | null;
  ratings: { white: RatingSnapshot; black: RatingSnapshot } | null;
  onRematch: () => void;
  onReview: () => void;
  onClose: () => void;
  rematchOfferedByMe: boolean;
  rematchOfferedByOpponent: boolean;
  onAcceptRematch?: () => void;
}

const REASON_LABEL: Record<string, string> = {
  checkmate: 'by checkmate',
  timeout: 'on time',
  resignation: 'by resignation',
  stalemate: 'by stalemate',
  'insufficient-material': 'by insufficient material',
  'threefold-repetition': 'by threefold repetition',
  'fifty-move-rule': 'by the fifty-move rule',
  agreement: 'by agreement',
  abandoned: 'by abandonment',
  aborted: 'aborted',
};

function outcomeFor(result: GameResult, myColor: Color | null): 'win' | 'loss' | 'draw' {
  if (!result.winner) return 'draw';
  if (!myColor) return 'draw';
  return result.winner === myColor ? 'win' : 'loss';
}

export function GameOverModal({
  open,
  result,
  myColor,
  white,
  black,
  ratings,
  onRematch,
  onReview,
  onClose,
  rematchOfferedByMe,
  rematchOfferedByOpponent,
  onAcceptRematch,
}: GameOverModalProps) {
  const outcome = result ? outcomeFor(result, myColor) : 'draw';
  const headline = outcome === 'win' ? 'You won!' : outcome === 'loss' ? 'You lost' : 'Draw';
  const subtitle = result ? REASON_LABEL[result.reason] ?? '' : '';
  const myRating = myColor ? (myColor === 'w' ? ratings?.white : ratings?.black) : undefined;
  const delta = myRating?.delta ?? 0;

  return (
    <Modal open={open} onClose={onClose} size="md" hideClose className="overflow-visible">
      <div className="flex flex-col items-center pb-1 pt-2 text-center">
        <motion.div
          initial={{ scale: 0.7, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 16 }}
          className={cn(
            'mb-3 flex h-16 w-16 items-center justify-center rounded-full',
            outcome === 'win' ? 'bg-accent/20 text-accent' : outcome === 'loss' ? 'bg-danger/20 text-danger' : 'bg-arena-raised text-arena-muted',
          )}
        >
          {outcome === 'win' ? <Trophy className="h-8 w-8" /> : outcome === 'draw' ? <Handshake className="h-8 w-8" /> : <X className="h-8 w-8" />}
        </motion.div>
        <h2 className="text-2xl font-black tracking-tight text-arena-text">{headline}</h2>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-arena-muted">
          {result?.reason === 'timeout' && <Clock className="h-3.5 w-3.5" />}
          {white?.username ?? 'White'} vs {black?.username ?? 'Black'} {subtitle}
        </p>
        {typeof myRating?.after === 'number' && (
          <p className="mt-2 text-sm font-bold text-arena-text">
            New rating <span className="tabular-nums">{myRating.after}</span>{' '}
            <span className={cn('tabular-nums', delta >= 0 ? 'text-accent' : 'text-danger')}>
              ({delta >= 0 ? '+' : ''}
              {delta})
            </span>
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-2">
        <ResultRow player={white} color="w" rating={ratings?.white} isMe={myColor === 'w'} result={result} />
        <ResultRow player={black} color="b" rating={ratings?.black} isMe={myColor === 'b'} result={result} />
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button fullWidth onClick={rematchOfferedByOpponent && onAcceptRematch ? onAcceptRematch : onRematch} disabled={rematchOfferedByMe}>
          <RotateCcw className="h-4 w-4" />
          {rematchOfferedByOpponent ? 'Accept rematch' : rematchOfferedByMe ? 'Rematch offered…' : 'Rematch'}
        </Button>
        <Button variant="secondary" fullWidth onClick={onReview}>
          <BarChart3 className="h-4 w-4" />
          Match review
        </Button>
        <Button variant="ghost" fullWidth onClick={onClose}>
          <Users className="h-4 w-4" />
          Keep looking
        </Button>
      </div>
      {rematchOfferedByOpponent && !rematchOfferedByMe && (
        <p className="mt-2 text-center text-xs text-accent">Your opponent wants a rematch.</p>
      )}
    </Modal>
  );
}

function ResultRow({
  player,
  color,
  rating,
  isMe,
  result,
}: {
  player: PlayerPublic | null;
  color: Color;
  rating?: RatingSnapshot;
  isMe: boolean;
  result: GameResult | null;
}) {
  if (!player) return null;
  const [from, to] = avatarGradient(player.avatarSeed || player.id);
  const won = result?.winner === color;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-arena-line/50 bg-arena-panel2 px-3 py-2">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-md text-xs font-black text-white/95"
        style={{ background: `linear-gradient(140deg, ${from}, ${to})` }}
      >
        {initials(player.username)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-arena-text">
          {player.username}
          {isMe && <span className="ml-2 rounded bg-arena-raised px-1.5 py-0.5 text-[10px] font-bold text-arena-muted">YOU</span>}
        </p>
        <p className="text-xs text-arena-muted">
          {color === 'w' ? 'White' : 'Black'} · {rating?.rating ?? player.rating}
          {rating && rating.delta !== 0 && (
            <span className={cn('ml-1 font-bold', rating.delta > 0 ? 'text-accent' : 'text-danger')}>
              {rating.delta > 0 ? '+' : ''}
              {rating.delta}
            </span>
          )}
        </p>
      </div>
      {won && <Trophy className="h-4 w-4 text-accent" />}
    </div>
  );
}
