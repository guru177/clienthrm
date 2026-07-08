import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const deployEnv = path.join(root, 'deploy', '.env');
const out = path.join(__dirname, '..', 'electron', 'production-api.json');
const viteEnv = path.join(__dirname, '..', '.env.production');

function readEnvValue(key) {
    if (!fs.existsSync(deployEnv)) return null;
    const line = fs
        .readFileSync(deployEnv, 'utf8')
        .split(/\r?\n/)
        .find((l) => l.startsWith(`${key}=`));
    if (!line) return null;
    let value = line.slice(key.length + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
    }
    return value || null;
}

const tenantUrl = readEnvValue('VITE_TENANT_APP_URL') || readEnvValue('TENANT_APP_URL');
const platformUrl = readEnvValue('VITE_PLATFORM_APP_URL') || readEnvValue('PLATFORM_APP_URL');

if (!tenantUrl) {
    if (fs.existsSync(out)) {
        console.log('Using existing electron/production-api.json');
    } else {
        console.warn('No deploy/.env tenant URL; using production-api.json.example at runtime');
    }
    process.exit(0);
}

const apiRoot = tenantUrl.replace(/\/$/, '');
const payload = {
    apiBase: apiRoot,
    tenantAppUrl: apiRoot,
    platformAppUrl: (platformUrl || tenantUrl).replace(/\/$/, ''),
};

fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
fs.writeFileSync(viteEnv, `VITE_API_URL=${apiRoot}/api\n`, 'utf8');
console.log(`Wrote electron/production-api.json → ${payload.apiBase}`);
console.log(`Wrote .env.production → VITE_API_URL=${apiRoot}/api`);
