import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

function devApiProxyTarget(env: Record<string, string>): string {
    const fromEnv = env.VITE_API_URL?.trim();
    if (fromEnv) {
        return fromEnv.replace(/\/api\/?$/, '');
    }
    return env.VITE_DEV_API_TARGET?.trim() || 'http://127.0.0.1:3001';
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, __dirname, '');

    return {
        publicDir: path.resolve(__dirname, '../frontend/public'),
        plugins: [react(), tailwindcss()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src'),
            },
        },
        server: {
            host: '0.0.0.0',
            port: 5175,
            strictPort: true,
            proxy: {
                '/api': {
                    target: devApiProxyTarget(env),
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
    };
});
