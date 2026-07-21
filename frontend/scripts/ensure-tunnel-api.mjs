/**
 * Bake a Cloudflare quick-tunnel origin into the Electron + Vite production build.
 * Usage: node scripts/ensure-tunnel-api.mjs https://xxxx.trycloudflare.com
 *    or: set TUNNEL_URL=https://xxxx.trycloudflare.com && node scripts/ensure-tunnel-api.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const out = path.join(root, 'electron', 'production-api.json');
const viteEnv = path.join(root, '.env.production');

const raw = (process.argv[2] || process.env.TUNNEL_URL || '').trim().replace(/\/$/, '');
if (!raw || !/^https:\/\//i.test(raw)) {
    console.error('Usage: node scripts/ensure-tunnel-api.mjs https://xxxx.trycloudflare.com');
    console.error('  (or set TUNNEL_URL)');
    process.exit(1);
}

const payload = {
    apiBase: raw,
    tenantAppUrl: raw,
    platformAppUrl: raw,
};

fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
fs.writeFileSync(viteEnv, `VITE_API_URL=${raw}/api\n`, 'utf8');
console.log(`Cloudflare tunnel API configured → ${raw}`);
console.log(`Wrote electron/production-api.json`);
console.log(`Wrote .env.production → VITE_API_URL=${raw}/api`);
