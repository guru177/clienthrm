import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

/** Remove local installer outputs so they are never picked up by electron-builder. */
const outputDirs = ['release', 'release-hoteldaddy', 'release-build'];

for (const dir of outputDirs) {
    const target = path.join(root, dir);
    if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
        console.log(`Removed ${dir}/ before packaging`);
    }
}

// Dev uploads under public/storage should not ship in desktop installers.
const publicStorage = path.join(root, 'public', 'storage');
if (fs.existsSync(publicStorage)) {
    fs.rmSync(publicStorage, { recursive: true, force: true });
    console.log('Removed public/storage/ before packaging');
}
