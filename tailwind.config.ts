import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}', './src/lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Chess.com-inspired dark palette
        arena: {
          bg: '#262421',
          panel: '#312e2b',
          panel2: '#3a3733',
          raised: '#403d39',
          line: '#4a4741',
          text: '#e8e6e3',
          muted: '#a8a49e',
          dim: '#7a766f',
        },
        accent: {
          DEFAULT: '#81b64c',
          hover: '#95c95f',
          dark: '#6a9a3d',
          deep: '#557f30',
        },
        danger: '#ca3431',
        warn: '#e58f2a',
        info: '#4a90d9',
        board: {
          light: '#eeeed2',
          dark: '#769656',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.7)',
        board: '0 18px 40px -18px rgba(0,0,0,0.85)',
        glow: '0 0 0 1px rgba(129,182,76,0.6), 0 0 22px -4px rgba(129,182,76,0.55)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(14px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.82)' },
          '70%': { opacity: '1', transform: 'scale(1.04)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'sweep': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(100%)' } },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'slide-up': 'slide-up 220ms cubic-bezier(0.16,1,0.3,1)',
        'pop-in': 'pop-in 260ms cubic-bezier(0.16,1,0.3,1)',
        sweep: 'sweep 1.4s linear infinite',
        'pulse-ring': 'pulse-ring 1.6s cubic-bezier(0.16,1,0.3,1) infinite',
      },
      transitionTimingFunction: {
        board: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
