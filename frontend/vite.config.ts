import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { Connect } from 'vite';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Block direct /storage access — files must go through authenticated API. */
function blockPublicStorage(): Plugin {
    return {
        name: 'block-public-storage',
        configureServer(server) {
            server.middlewares.use('/storage', (_req: Connect.IncomingMessage, res) => {
                res.statusCode = 403;
                res.end('Forbidden — use authenticated file API');
            });
        },
    };
}

/** Ensure Digital Asset Links is served as JSON (TWA verification). */
function wellKnownAssetLinks(): Plugin {
    return {
        name: 'well-known-assetlinks',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const url = req.url?.split('?')[0] ?? '';
                if (url === '/.well-known/assetlinks.json') {
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.setHeader('Cache-Control', 'no-store');
                }
                next();
            });
        },
    };
}

export default defineConfig(({ mode }) => {
    /** Cloudflare quick tunnels (trycloudflare.com) need WSS HMR on 443. */
    const useTunnel =
        mode === 'tunnel' ||
        process.env.VITE_DEV_TUNNEL === '1' ||
        process.env.CF_TUNNEL === '1' ||
        process.env.TUNNEL === '1';

    return {
    base: '/',
    plugins: [
        react(),
        tailwindcss(),
        blockPublicStorage(),
        wellKnownAssetLinks(),
        VitePWA({
            registerType: 'autoUpdate',
            // Off in normal `npm run dev` — SW CacheFirst on /src causes stale modules + Workbox spam.
            // Enable for phone/PWA tunnel QA: VITE_PWA_DEV=1 or tunnel mode.
            devOptions: {
                enabled:
                    useTunnel ||
                    process.env.VITE_PWA_DEV === '1' ||
                    process.env.VITE_DEV_TUNNEL === '1',
                type: 'module',
            },
            workbox: {
                // Quieter production logs; avoid caching raw Vite /src in any env.
                navigateFallback: 'index.html',
                navigateFallbackDenylist: [/^\/api\//, /^\/\.well-known\//],
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'hrm-google-fonts-css',
                            expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                        },
                    },
                    {
                        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'hrm-google-fonts-files',
                            expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                        },
                    },
                    {
                        urlPattern: ({ request }) => request.destination === 'image',
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'hrm-media',
                            expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
                        },
                    },
                    {
                        urlPattern: ({ url, request }) =>
                            request.mode === 'navigate' && !url.pathname.startsWith('/api'),
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'hrm-pages',
                            networkTimeoutSeconds: 5,
                            expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 },
                        },
                    },
                ],
            },
            manifest: {
                id: '/',
                name: 'Raintech HRM',
                short_name: 'HR Daddy',
                description: 'Raintech HRM App',
                theme_color: '#ffffff',
                background_color: '#ffffff',
                display: 'standalone',
                orientation: 'portrait-primary',
                scope: '/',
                start_url: '/',
                icons: [
                    {
                        src: 'logo192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any',
                    },
                    {
                        src: 'logo512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any',
                    },
                    {
                        src: 'maskable-icon-192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                    {
                        src: 'maskable-icon-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    preview: {
        host: '0.0.0.0',
        port: 5177,
        allowedHosts: true,
    },
    server: {
        host: '0.0.0.0',
        port: 5174,
        strictPort: false,
        // Allow *.trycloudflare.com and any tunnel host without editing config
        allowedHosts: true,
        // Electron (hrm://) and tunnel browsers must get ACAO on preflight — default Vite OPTIONS omits it for hrm://.
        cors: {
            origin(origin, callback) {
                if (!origin || origin === 'null' || origin.startsWith('hrm://')) {
                    callback(null, origin || true);
                    return;
                }
                callback(null, origin);
            },
            credentials: true,
        },
        // Phone/PWA testing via `cloudflared tunnel --url http://localhost:5174`
        ...(useTunnel
            ? {
                  hmr: {
                      protocol: 'wss',
                      clientPort: 443,
                  },
              }
            : {}),
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:3001',
                changeOrigin: true,
                ws: true,
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq, req) => {
                        const remote =
                            req.socket?.remoteAddress?.replace('::ffff:', '') ||
                            req.headers['x-forwarded-for'];
                        if (typeof remote === 'string' && remote.length > 0) {
                            proxyReq.setHeader('X-Forwarded-For', remote);
                        }
                        // So backend sees the public HTTPS origin when behind Cloudflare
                        const host = req.headers['host'];
                        const proto = req.headers['x-forwarded-proto'] || 'https';
                        if (typeof host === 'string' && host.includes('trycloudflare.com')) {
                            proxyReq.setHeader('X-Forwarded-Host', host);
                            proxyReq.setHeader('X-Forwarded-Proto', String(proto));
                        }
                    });
                },
            },
        },
    },
    build: {
        outDir: 'dist',
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules/@vladmandic/face-api')) return 'face-api';
                    if (id.includes('node_modules/recharts')) return 'recharts';
                    if (id.includes('node_modules/xlsx') || id.includes('node_modules/xlsx-js-style')) return 'xlsx';
                    if (id.includes('node_modules/mammoth')) return 'mammoth';
                    if (id.includes('node_modules/@radix-ui')) return 'radix';
                },
            },
        },
        chunkSizeWarningLimit: 600,
    },
};
});
