const { protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');

let distRoot = null;

function registerPrivilegedScheme() {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: 'hrm',
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                corsEnabled: true,
                stream: true,
            },
        },
    ]);
}

function mimeFor(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const types = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ico': 'image/x-icon',
        '.webp': 'image/webp',
    };
    return types[ext] || 'application/octet-stream';
}

function resolveFilePath(urlPath) {
    let rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
    if (!rel || rel.endsWith('/')) {
        rel += 'index.html';
    }
    const filePath = path.normalize(path.join(distRoot, rel));
    if (!filePath.startsWith(distRoot)) {
        return null;
    }
    return filePath;
}

function installHrmProtocol(root) {
    distRoot = path.normalize(root);

    if (typeof protocol.handle === 'function') {
        protocol.handle('hrm', (request) => {
            const url = new URL(request.url);
            const filePath = resolveFilePath(url.pathname);
            if (!filePath) {
                return new Response('Forbidden', { status: 403 });
            }
            return net.fetch(pathToFileURL(filePath).href);
        });
        return;
    }

    protocol.registerFileProtocol('hrm', (request, callback) => {
        try {
            const url = new URL(request.url);
            const filePath = resolveFilePath(url.pathname);
            if (!filePath || !fs.existsSync(filePath)) {
                callback({ error: -6 });
                return;
            }
            callback({ path: filePath, mimeType: mimeFor(filePath) });
        } catch {
            callback({ error: -2 });
        }
    });
}

module.exports = { registerPrivilegedScheme, installHrmProtocol };
