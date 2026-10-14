/**
 * Board + piece visual system.
 *
 * Board themes are plain data (inline styles keep the board rendering
 * framework-free and lets the live game, review and practice boards share one
 * implementation). Piece sets are skins applied to shared SVG geometry — see
 * `src/components/board/Piece.tsx`.
 */

export type BoardThemeId = 'green' | 'wood' | 'glass' | 'neon' | 'marble' | 'blue';
export type PieceSetId = 'neo' | 'wood' | 'staunton' | 'modern';

export interface BoardTheme {
  id: BoardThemeId;
  name: string;
  /** Board squares. */
  light: string;
  dark: string;
  /** Last-move highlight (yellow-ish, chess.com style). */
  lastMoveLight: string;
  lastMoveDark: string;
  /** Selected square tint. */
  selectedLight: string;
  selectedDark: string;
  /** Premove / hint tint. */
  hintLight: string;
  hintDark: string;
  /** King in check. */
  check: string;
  /** Legal-move dot + capture ring. */
  dot: string;
  ring: string;
  /** Arrow colours offered by the drawing toolbar. */
  arrows: { green: string; orange: string; red: string; blue: string; yellow: string };
  /** CSS border/box-shadow wrapper colour. */
  frame: string;
  coordLight: string;
  coordDark: string;
  /** Accent used for the eval bar / panel chrome. */
  accent: string;
}

const arrowPalette = {
  green: '#81b64c',
  orange: '#e58f2a',
  red: '#ca3431',
  blue: '#4a90d9',
  yellow: '#f0d45c',
};

export const BOARD_THEMES: Record<BoardThemeId, BoardTheme> = {
  green: {
    id: 'green',
    name: 'Green',
    light: '#eeeed2',
    dark: '#769656',
    lastMoveLight: 'rgba(255, 235, 110, 0.55)',
    lastMoveDark: 'rgba(255, 213, 79, 0.45)',
    selectedLight: 'rgba(255, 235, 110, 0.62)',
    selectedDark: 'rgba(255, 213, 79, 0.55)',
    hintLight: 'rgba(129, 182, 76, 0.45)',
    hintDark: 'rgba(129, 182, 76, 0.4)',
    check: 'radial-gradient(circle, rgba(255,60,50,0.95) 12%, rgba(255,60,50,0.35) 58%, transparent 74%)',
    dot: 'rgba(20, 22, 18, 0.30)',
    ring: 'rgba(20, 22, 18, 0.26)',
    arrows: arrowPalette,
    frame: '#3f4a35',
    coordLight: '#769656',
    coordDark: '#eeeed2',
    accent: '#81b64c',
  },
  wood: {
    id: 'wood',
    name: 'Wood',
    light: '#e6cba1',
    dark: '#a9793f',
    lastMoveLight: 'rgba(255, 214, 120, 0.55)',
    lastMoveDark: 'rgba(224, 168, 60, 0.5)',
    selectedLight: 'rgba(255, 214, 120, 0.6)',
    selectedDark: 'rgba(224, 168, 60, 0.55)',
    hintLight: 'rgba(129, 182, 76, 0.45)',
    hintDark: 'rgba(104, 150, 58, 0.45)',
    check: 'radial-gradient(circle, rgba(255,60,50,0.95) 12%, rgba(255,60,50,0.35) 58%, transparent 74%)',
    dot: 'rgba(58, 36, 14, 0.34)',
    ring: 'rgba(58, 36, 14, 0.3)',
    arrows: arrowPalette,
    frame: '#5d3f22',
    coordLight: '#a9793f',
    coordDark: '#f0ddc0',
    accent: '#c08a45',
  },
  glass: {
    id: 'glass',
    name: 'Glass',
    light: '#dce7f0',
    dark: '#7f9cba',
    lastMoveLight: 'rgba(255, 231, 122, 0.5)',
    lastMoveDark: 'rgba(255, 214, 90, 0.42)',
    selectedLight: 'rgba(255, 231, 122, 0.6)',
    selectedDark: 'rgba(255, 214, 90, 0.5)',
    hintLight: 'rgba(120, 205, 255, 0.4)',
    hintDark: 'rgba(90, 180, 240, 0.4)',
    check: 'radial-gradient(circle, rgba(255,72,64,0.95) 12%, rgba(255,72,64,0.3) 58%, transparent 74%)',
    dot: 'rgba(12, 30, 48, 0.32)',
    ring: 'rgba(12, 30, 48, 0.28)',
    arrows: arrowPalette,
    frame: '#334a60',
    coordLight: '#7f9cba',
    coordDark: '#e8f2fb',
    accent: '#5fa8e0',
  },
  neon: {
    id: 'neon',
    name: 'Neon',
    light: '#2b3040',
    dark: '#171a24',
    lastMoveLight: 'rgba(0, 255, 200, 0.30)',
    lastMoveDark: 'rgba(0, 255, 200, 0.22)',
    selectedLight: 'rgba(255, 0, 190, 0.35)',
    selectedDark: 'rgba(255, 0, 190, 0.3)',
    hintLight: 'rgba(0, 255, 200, 0.28)',
    hintDark: 'rgba(0, 255, 200, 0.22)',
    check: 'radial-gradient(circle, rgba(255,0,90,1) 10%, rgba(255,0,90,0.4) 55%, transparent 72%)',
    dot: 'rgba(0, 255, 200, 0.55)',
    ring: 'rgba(0, 255, 200, 0.45)',
    arrows: { ...arrowPalette, green: '#00ffc8', blue: '#00c2ff' },
    frame: '#00ffc8',
    coordLight: '#2b3040',
    coordDark: '#0d1017',
    accent: '#00ffc8',
  },
  marble: {
    id: 'marble',
    name: 'Marble',
    light: '#f2f0ec',
    dark: '#8d8f96',
    lastMoveLight: 'rgba(255, 226, 110, 0.55)',
    lastMoveDark: 'rgba(240, 200, 80, 0.45)',
    selectedLight: 'rgba(255, 226, 110, 0.62)',
    selectedDark: 'rgba(240, 200, 80, 0.5)',
    hintLight: 'rgba(129, 182, 76, 0.4)',
    hintDark: 'rgba(129, 182, 76, 0.35)',
    check: 'radial-gradient(circle, rgba(255,60,50,0.95) 12%, rgba(255,60,50,0.35) 58%, transparent 74%)',
    dot: 'rgba(40, 42, 48, 0.3)',
    ring: 'rgba(40, 42, 48, 0.26)',
    arrows: arrowPalette,
    frame: '#5a5c63',
    coordLight: '#8d8f96',
    coordDark: '#f7f6f3',
    accent: '#9aa0a6',
  },
  blue: {
    id: 'blue',
    name: 'Ice Blue',
    light: '#dee3e6',
    dark: '#5b7fa6',
    lastMoveLight: 'rgba(255, 235, 110, 0.55)',
    lastMoveDark: 'rgba(255, 213, 79, 0.45)',
    selectedLight: 'rgba(255, 235, 110, 0.62)',
    selectedDark: 'rgba(255, 213, 79, 0.55)',
    hintLight: 'rgba(129, 182, 76, 0.45)',
    hintDark: 'rgba(129, 182, 76, 0.4)',
    check: 'radial-gradient(circle, rgba(255,60,50,0.95) 12%, rgba(255,60,50,0.35) 58%, transparent 74%)',
    dot: 'rgba(16, 34, 56, 0.3)',
    ring: 'rgba(16, 34, 56, 0.26)',
    arrows: arrowPalette,
    frame: '#3a5a7d',
    coordLight: '#5b7fa6',
    coordDark: '#e9eef2',
    accent: '#5fa8e0',
  },
};

export const PIECE_SETS: Record<PieceSetId, { id: PieceSetId; name: string; description: string }> = {
  neo: { id: 'neo', name: 'Neo', description: 'Clean flat vectors — the classic look.' },
  wood: { id: 'wood', name: 'Wood', description: 'Turned wood with warm grain gradients.' },
  staunton: { id: 'staunton', name: 'Staunton', description: 'Traditional tournament pieces.' },
  modern: { id: 'modern', name: 'Modern', description: 'Minimal monochrome silhouettes.' },
};

export const DEFAULT_BOARD_THEME: BoardThemeId = 'green';
export const DEFAULT_PIECE_SET: PieceSetId = 'neo';

export const getBoardTheme = (id: BoardThemeId | undefined): BoardTheme =>
  BOARD_THEMES[id ?? DEFAULT_BOARD_THEME] ?? BOARD_THEMES.green;
