/**
 * Copy electron-builder artifacts from frontend/release/ to storage/desktop-updates/
 * for the backend generic update feed (/api/public/desktop/updates/*).
 */
const fs = require('fs');
const path = require('path');

const releaseDir = path.join(__dirname, '..', 'release');
const destDir = path.join(__dirname, '..', '..', 'storage', 'desktop-updates');

if (!fs.existsSync(releaseDir)) {
    console.error('No release/ folder. Run: npm run electron:build');
    process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });

const pattern = /\.(exe|yml|yaml|blockmap|dmg|zip|AppImage)$/i;
let copied = 0;

for (const name of fs.readdirSync(releaseDir)) {
    if (!pattern.test(name)) continue;
    fs.copyFileSync(path.join(releaseDir, name), path.join(destDir, name));
    console.log(`Copied ${name}`);
    copied += 1;
}

if (copied === 0) {
    console.error('No installer or latest.yml found in release/');
    process.exit(1);
}

console.log(`\nPublished to ${destDir}`);
console.log('Feed URL: http://<your-api-host>:3001/api/public/desktop/updates');
