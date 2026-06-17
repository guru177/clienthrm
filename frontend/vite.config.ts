import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { Connect } from 'vite';
import { defineConfig, type Plugin } from 'vite';

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

export default defineConfig({
    base: './',
    plugins: [
        react(),
        tailwindcss(),
        blockPublicStorage(),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    server: {
        host: '0.0.0.0',
        port: 5174,
        strictPort: true,
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
                    });
                },
            },

        },
    },
    build: {
        outDir: 'dist',
    },
});
