import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Explicit alias so webpack resolves `@/*` the same way tsc does.
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname, 'src');
    return config;
  },
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  // The realtime layer (socket.io) lives in `server/index.mjs` and owns the HTTP server,
  // so Next runs in non-standalone mode behind a custom node entrypoint.
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  async headers() {
    return [
      {
        // Allow the Stockfish WASM worker to be created from a blob/CDN source.
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ];
  },
};

export default nextConfig;
