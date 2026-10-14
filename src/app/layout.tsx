import type { Metadata, Viewport } from 'next';
import './globals.css';
import { GameSessionProvider } from '@/components/providers/GameSessionProvider';
import { AppShell } from '@/components/layout/AppShell';
import { ToastViewport } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: {
    default: 'Chess Arena — Play real-time chess',
    template: '%s · Chess Arena',
  },
  description:
    'Real-time 1v1 online chess with bullet, blitz and rapid matchmaking, engine-powered game review and a free analysis board.',
  applicationName: 'Chess Arena',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Chess Arena',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
  openGraph: {
    title: 'Chess Arena — Play real-time chess',
    description: 'Human vs human blitz, rapid and bullet with Stockfish game review.',
    type: 'website',
    siteName: 'Chess Arena',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#262421',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-arena-bg">
        <GameSessionProvider>
          <AppShell>{children}</AppShell>
        </GameSessionProvider>
        <ToastViewport />
      </body>
    </html>
  );
}
