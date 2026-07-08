/**
 * Generate Raintech HRM branded assets for electron-builder / NSIS installer.
 * Run: node scripts/generate-installer-assets.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import toIco from 'to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'build');

const faviconCandidates = [
    path.join(root, 'public', 'favicon.png'),
    path.join(root, '..', 'favicon.png'),
];

const logoCandidates = [
    path.join(root, 'public', 'images', 'logo.png'),
    path.join(buildDir, 'icon.png'),
];

const BRAND = {
    navy: '#071b3a',
    blue: '#0d4a8a',
    light: '#e8f2fd',
    accent: '#3b82f6',
    white: '#ffffff',
};

function resolveFavicon() {
    for (const candidate of faviconCandidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error('No favicon found — add public/favicon.png or favicon.png at repo root');
}

function resolveLogo() {
    for (const candidate of logoCandidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error('No logo found — add public/images/logo.png or build/icon.png');
}

function encodeBmp24(rgbData, width, height) {
    const rowSize = Math.ceil((width * 3) / 4) * 4;
    const pixelDataSize = rowSize * height;
    const fileSize = 54 + pixelDataSize;
    const buf = Buffer.alloc(fileSize);

    buf.write('BM', 0);
    buf.writeUInt32LE(fileSize, 2);
    buf.writeUInt32LE(54, 10);
    buf.writeUInt32LE(40, 14);
    buf.writeInt32LE(width, 18);
    buf.writeInt32LE(height, 22);
    buf.writeUInt16LE(1, 26);
    buf.writeUInt16LE(24, 28);
    buf.writeUInt32LE(pixelDataSize, 34);

    let offset = 54;
    for (let y = height - 1; y >= 0; y -= 1) {
        for (let x = 0; x < width; x += 1) {
            const src = (y * width + x) * 3;
            buf[offset] = rgbData[src + 2];
            buf[offset + 1] = rgbData[src + 1];
            buf[offset + 2] = rgbData[src];
            offset += 3;
        }
        const padding = rowSize - width * 3;
        offset += padding;
    }
    return buf;
}

async function writeBmpFromSvg(svg, width, height, outPath, logoOverlay) {
    let pipeline = sharp(Buffer.from(svg)).resize(width, height);

    if (logoOverlay) {
        const logo = await sharp(logoOverlay.source)
            .resize(logoOverlay.size, logoOverlay.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
        pipeline = sharp(await pipeline.png().toBuffer()).composite([
            { input: logo, top: logoOverlay.top, left: logoOverlay.left },
        ]);
    }

    const { data, info } = await pipeline
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    fs.writeFileSync(outPath, encodeBmp24(data, info.width, info.height));
}

const SIDEBAR_CIRCLE = { cx: 82, cy: 108, rInner: 38, rOuter: 54 };

function centeredLogoPlacement(size) {
    return {
        size,
        left: Math.round(SIDEBAR_CIRCLE.cx - size / 2),
        top: Math.round(SIDEBAR_CIRCLE.cy - size / 2),
    };
}

function sidebarSvg() {
    const { cx, cy, rOuter, rInner } = SIDEBAR_CIRCLE;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314" viewBox="0 0 164 314">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BRAND.blue}"/>
      <stop offset="45%" stop-color="${BRAND.navy}"/>
      <stop offset="100%" stop-color="#030d1a"/>
    </linearGradient>
    <linearGradient id="glow" x1="0.5" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="35%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="164" height="314" fill="url(#bg)"/>
  <rect width="164" height="120" fill="url(#glow)"/>
  <circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="#ffffff" fill-opacity="0.06"/>
  <circle cx="${cx}" cy="${cy}" r="${rInner}" fill="#ffffff" fill-opacity="0.05"/>
  <text x="82" y="188" text-anchor="middle" fill="${BRAND.white}" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700" letter-spacing="1">RAINTECH</text>
  <text x="82" y="208" text-anchor="middle" fill="#9ec5ff" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="600" letter-spacing="4">H R M</text>
  <text x="82" y="238" text-anchor="middle" fill="#ffffff" fill-opacity="0.75" font-family="Segoe UI, Arial, sans-serif" font-size="8.5">Human Resource Management</text>
  <text x="82" y="252" text-anchor="middle" fill="#ffffff" fill-opacity="0.55" font-family="Segoe UI, Arial, sans-serif" font-size="7.5">Attendance · Payroll · Leave · Chat</text>
  <rect x="24" y="276" width="116" height="3" rx="1.5" fill="#ffffff" fill-opacity="0.12"/>
  <rect x="44" y="276" width="76" height="3" rx="1.5" fill="#ffffff" fill-opacity="0.35"/>
  <text x="82" y="298" text-anchor="middle" fill="#ffffff" fill-opacity="0.45" font-family="Segoe UI, Arial, sans-serif" font-size="7">© Raintech Software</text>
</svg>`;
}

function headerSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57" viewBox="0 0 150 57">
  <defs>
    <linearGradient id="hdr" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${BRAND.navy}"/>
      <stop offset="100%" stop-color="${BRAND.blue}"/>
    </linearGradient>
  </defs>
  <rect width="150" height="57" fill="url(#hdr)"/>
  <rect y="54" width="150" height="3" fill="#ffffff" fill-opacity="0.2"/>
  <text x="58" y="26" fill="${BRAND.white}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700">Raintech HRM</text>
  <text x="58" y="42" fill="#b8d9ff" font-family="Segoe UI, Arial, sans-serif" font-size="8">Desktop Client Setup</text>
</svg>`;
}

const LICENSE_TEXT = `Raintech HRM - End User License Agreement

Copyright (c) Raintech Software. All rights reserved.

Raintech HRM is human resource management software for attendance,
payroll, leave, workflows, and team collaboration.

By installing this software you agree to use it only for lawful business
purposes and in accordance with your organization's policies.

This software connects to your organization's Raintech HRM server. Your
administrator controls access, data retention, and feature availability.

Raintech Software provides this application "as is" without warranty of
any kind. For support contact your system administrator or Raintech Software.

Press "I Agree" to continue with installation.
`;

async function main() {
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'license.txt'), LICENSE_TEXT, 'ascii');
    const faviconPath = resolveFavicon();
    const logoPath = resolveLogo();

    await sharp(faviconPath)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(buildDir, 'icon.png'));

    await sharp(faviconPath)
        .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(buildDir, 'icon-256.png'));

    const iconSizes = [16, 24, 32, 48, 64, 128, 256];
    const pngBuffers = await Promise.all(
        iconSizes.map((size) =>
            sharp(faviconPath)
                .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toBuffer(),
        ),
    );
    fs.writeFileSync(path.join(buildDir, 'icon.ico'), await toIco(pngBuffers));

    const sidebarLogo = centeredLogoPlacement(SIDEBAR_CIRCLE.rInner * 2 - 4);

    await writeBmpFromSvg(sidebarSvg(), 164, 314, path.join(buildDir, 'installerSidebar.bmp'), {
        source: logoPath,
        ...sidebarLogo,
    });

    const headerLogoSize = 34;
    const headerLogo = {
        source: logoPath,
        size: headerLogoSize,
        left: 11,
        top: Math.round((57 - headerLogoSize) / 2),
    };

    await writeBmpFromSvg(headerSvg(), 150, 57, path.join(buildDir, 'installerHeader.bmp'), headerLogo);

  // NSIS uninstaller reuses the same sidebar art.
    fs.copyFileSync(
        path.join(buildDir, 'installerSidebar.bmp'),
        path.join(buildDir, 'uninstallerSidebar.bmp'),
    );

    console.log('Raintech HRM installer assets generated in build/');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
