import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const deployEnv = path.join(root, 'deploy', '.env');
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

const platformUrl =
    readEnvValue('VITE_PLATFORM_APP_URL') ||
    readEnvValue('PLATFORM_APP_URL') ||
    readEnvValue('TENANT_APP_URL') ||
    readEnvValue('VITE_TENANT_APP_URL');
const tenantUrl =
    readEnvValue('VITE_TENANT_APP_URL') ||
    readEnvValue('TENANT_APP_URL') ||
    platformUrl;

if (!platformUrl) {
    if (fs.existsSync(viteEnv)) {
        console.log('Using existing platform/.env.production');
    } else {
        console.warn('No deploy/.env platform URL; create platform/.env.production manually');
    }
    process.exit(0);
}

const apiRoot = platformUrl.replace(/\/$/, '');
const tenantRoot = (tenantUrl || platformUrl).replace(/\/$/, '');
const lines = [
    `VITE_API_URL=${apiRoot}/api`,
    `VITE_TENANT_APP_URL=${tenantRoot}`,
    '',
];

fs.writeFileSync(viteEnv, lines.join('\n'), 'utf8');
console.log(`Wrote platform/.env.production → VITE_API_URL=${apiRoot}/api`);
