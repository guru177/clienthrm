import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const API_ROOT = 'https://hrm-api.hoteldaddy.in';
const out = path.join(root, 'electron', 'production-api.json');
const viteEnv = path.join(root, '.env.production');
const logoDir = path.join(root, 'public', 'images');
const favicon = path.join(root, 'public', 'favicon.png');
const logo = path.join(logoDir, 'logo.png');

const payload = {
    apiBase: API_ROOT,
    tenantAppUrl: API_ROOT,
    platformAppUrl: API_ROOT,
};

fs.mkdirSync(logoDir, { recursive: true });
if (!fs.existsSync(logo) && fs.existsSync(favicon)) {
    fs.copyFileSync(favicon, logo);
}

fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
fs.writeFileSync(viteEnv, `VITE_API_URL=${API_ROOT}/api\n`, 'utf8');
console.log(`Hotel Daddy API configured → ${API_ROOT}`);
console.log(`Wrote electron/production-api.json`);
console.log(`Wrote .env.production → VITE_API_URL=${API_ROOT}/api`);
