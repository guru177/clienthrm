import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_API = 'http://127.0.0.1:3001';
const out = path.join(__dirname, '..', 'electron', 'production-api.json');
const viteEnv = path.join(__dirname, '..', '.env.production');

const payload = {
    apiBase: LOCAL_API,
    tenantAppUrl: LOCAL_API,
    platformAppUrl: LOCAL_API,
};

fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
fs.writeFileSync(viteEnv, `VITE_API_URL=${LOCAL_API}/api\n`, 'utf8');
console.log(`Wrote electron/production-api.json → ${LOCAL_API}`);
console.log(`Wrote .env.production → VITE_API_URL=${LOCAL_API}/api`);
