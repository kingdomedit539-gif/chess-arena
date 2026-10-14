'use client';

import { useId } from 'react';
import type { Color, PieceSymbol } from '@/lib/types';
import type { PieceSetId } from '@/lib/chess/themes';
import { cn } from '@/lib/utils';

/**
 * Shared SVG geometry (100x100 viewBox, baseline at y=90) rendered through four
 * interchangeable skins. Keeping one geometry + N skins means piece sets stay
 * visually consistent and adding a set is a ~10 line change.
 */

interface Skin {
  fill: string;
  gradient?: [string, string];
  stroke: string;
  strokeWidth: number;
  /** Colour used for small details: eyes, mitre slit, nostrils. */
  detail: string;
}

const SKINS: Record<PieceSetId, Record<Color, Skin>> = {
  neo: {
    w: { fill: '#f9f9f6', stroke: '#8d8a82', strokeWidth: 1.7, detail: '#8d8a82' },
    b: { fill: '#312f2c', stroke: '#141311', strokeWidth: 1.7, detail: '#cfccc4' },
  },
  wood: {
    w: { fill: '#e9c79b', gradient: ['#f6e0bd', '#c9975c'], stroke: '#8a5f2c', strokeWidth: 2, detail: '#8a5f2c' },
    b: { fill: '#5c3818', gradient: ['#8f5c2e', '#3d220e'], stroke: '#26150a', strokeWidth: 2, detail: '#e9cd9f' },
  },
  staunton: {
    w: { fill: '#f4f3ef', gradient: ['#ffffff', '#c8c5bc'], stroke: '#2b2a27', strokeWidth: 2.5, detail: '#2b2a27' },
    b: { fill: '#2e2e2e', gradient: ['#585858', '#0d0d0d'], stroke: '#000000', strokeWidth: 2.5, detail: '#f2f2f2' },
  },
  modern: {
    w: { fill: '#ffffff', stroke: '#242424', strokeWidth: 2.2, detail: '#242424' },
    b: { fill: '#1c1c1c', stroke: '#9b9b9b', strokeWidth: 1.5, detail: '#9b9b9b' },
  },
};

function Pawn({ detail }: { detail: string }) {
  return (
    <>
      <circle cx="50" cy="33" r="12.5" />
      <path d="M50 45c-7.4 0-12 4.4-12 9.6 0 4 2 7.2 4.4 10.4-3.4 5.6-6.4 10.4-7.4 16.4h30c-1-6-4-10.8-7.4-16.4 2.4-3.2 4.4-6.4 4.4-10.4 0-5.2-4.6-9.6-12-9.6z" />
      <rect x="28" y="80" width="44" height="10" rx="3.5" />
      <ellipse cx="50" cy="33" rx="12.5" ry="4" fill={detail} opacity="0.08" stroke="none" />
    </>
  );
}

function Rook() {
  return (
    <>
      <path d="M28 14h11v7h7v-7h8v7h7v-7h11v16H28z" />
      <rect x="34" y="30" width="32" height="7" rx="2" />
      <path d="M37 37h26l7 36H30z" />
      <rect x="26" y="73" width="48" height="8" rx="2" />
      <rect x="22" y="81" width="56" height="9" rx="3" />
    </>
  );
}

function Knight({ detail }: { detail: string }) {
  return (
    <>
      <path d="M27 90V72c0-12 6-22 16-29l6-4c-5-2-7-7-5-11l-8-6c-3-3-1-8 3-7l15 6c9-6 22-1 25 12 2 9 0 14-7 16l-12 2c0 7 2 15 4 21l4 18z" />
      <rect x="24" y="80" width="52" height="10" rx="3" />
      <circle cx="58" cy="32" r="2.8" fill={detail} stroke="none" />
      <circle cx="70" cy="43" r="1.7" fill={detail} stroke="none" opacity="0.75" />
      <path d="M44 22c4 2 6 6 5 10" fill="none" stroke={detail} strokeWidth="1.6" opacity="0.5" strokeLinecap="round" />
    </>
  );
}

function Bishop({ detail }: { detail: string }) {
  return (
    <>
      <circle cx="50" cy="13" r="4.6" />
      <path d="M50 17c9 11 15 20 15 28 0 6.6-6 11-15 11s-15-4.4-15-11c0-8 6-17 15-28z" />
      <path d="M44 27l12 12" fill="none" stroke={detail} strokeWidth="2.4" strokeLinecap="round" />
      <rect x="37" y="53" width="26" height="6.5" rx="3" />
      <path d="M40 59.5h20c0 9 4.6 15.6 8 20.5H32c3.4-4.9 8-11.5 8-20.5z" />
      <rect x="26" y="80" width="48" height="10" rx="3" />
    </>
  );
}

function Queen() {
  return (
    <>
      <circle cx="30" cy="17" r="4.2" />
      <circle cx="50" cy="11" r="4.8" />
      <circle cx="70" cy="17" r="4.2" />
      <circle cx="40" cy="31" r="3.1" />
      <circle cx="60" cy="31" r="3.1" />
      <polygon points="26,40 30,17 40,31 50,13 60,31 70,17 74,40" />
      <rect x="30" y="40" width="40" height="6.5" rx="3" />
      <path d="M34 46.5h32c-1.6 12 2.4 23 5.6 32.5H28.4c3.2-9.5 7.2-20.5 5.6-32.5z" />
      <rect x="22" y="79" width="56" height="11" rx="3" />
    </>
  );
}

function King() {
  return (
    <>
      <rect x="46.4" y="3" width="7.2" height="20" rx="2" />
      <rect x="39" y="9.6" width="22" height="7.2" rx="2" />
      <path d="M26 45C26 27 36 16.5 50 16.5S74 27 74 45z" />
      <rect x="31" y="45" width="38" height="6.5" rx="3" />
      <path d="M36.5 51.5h27c-1.4 12 1.6 21.5 4.5 32.5H32c2.9-11 5.9-20.5 4.5-32.5z" />
      <rect x="23" y="79" width="54" height="11" rx="3" />
    </>
  );
}

const GEOMETRY: Record<PieceSymbol, (props: { detail: string }) => React.ReactElement> = {
  p: Pawn,
  n: Knight,
  b: Bishop,
  r: Rook,
  q: Queen,
  k: King,
};

export interface PieceProps {
  type: PieceSymbol;
  color: Color;
  set?: PieceSetId;
  className?: string;
  /** Screen-reader label override. */
  label?: string;
  /** Disable the drop shadow (used inside the promotion picker). */
  flat?: boolean;
}

export function Piece({ type, color, set = 'neo', className, label, flat }: PieceProps) {
  const reactId = useId();
  const skin = (SKINS[set] ?? SKINS.neo)[color];
  const gradientId = `piece-${set}-${color}-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const Geometry = GEOMETRY[type];
  const fill = skin.gradient ? `url(#${gradientId})` : skin.fill;
  const name = label ?? `${color === 'w' ? 'White' : 'Black'} ${type}`;

  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={name}
      className={cn('h-full w-full select-none', !flat && 'drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]', className)}
      style={{ pointerEvents: 'none' }}
    >
      {skin.gradient && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0%" stopColor={skin.gradient[0]} />
            <stop offset="100%" stopColor={skin.gradient[1]} />
          </linearGradient>
        </defs>
      )}
      <g
        fill={fill}
        stroke={skin.stroke}
        strokeWidth={skin.strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <Geometry detail={skin.detail} />
      </g>
    </svg>
  );
}
