const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { initAutoUpdater } = require('./updater.cjs');

const DEV_API_BASE = 'http://127.0.0.1:3001';

function packagedApiBase() {
    try {
        const prod = require('./production-api.json');
        if (typeof prod?.apiBase === 'string' && prod.apiBase.trim()) {
            return normalizeApiRoot(prod.apiBase);
        }
    } catch {
        /* no production-api.json — dev / custom install */
    }
    return DEV_API_BASE;
}

function defaultApiBase() {
    return app.isPackaged ? packagedApiBase() : DEV_API_BASE;
}

let mainWindow;
let updaterControls = null;

function configPath() {
    return path.join(app.getPath('userData'), 'hrm-config.json');
}

function readConfig() {
    try {
        const raw = fs.readFileSync(configPath(), 'utf8');
        const parsed = JSON.parse(raw);
        const config = { apiBase: defaultApiBase() };
        if (typeof parsed.apiBase === 'string' && parsed.apiBase.trim()) {
            config.apiBase = normalizeApiRoot(parsed.apiBase);
        }
        if (typeof parsed.updateUrl === 'string' && parsed.updateUrl.trim()) {
            config.updateUrl = parsed.updateUrl.trim().replace(/\/$/, '');
        }
        return config;
    } catch {
        /* first run */
    }
    return { apiBase: defaultApiBase() };
}

function writeConfig(next) {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8');
}

function normalizeApiRoot(raw) {
    let value = String(raw).trim().replace(/\/$/, '');
    if (value.endsWith('/api')) {
        value = value.slice(0, -4);
    }
    return value;
}

function resolveUpdateFeedUrl() {
    const config = readConfig();
    if (config.updateUrl) {
        return config.updateUrl;
    }
    return `${config.apiBase}/api/public/desktop/updates`;
}

function resolveWindowIcon() {
    const candidates = [
        path.join(__dirname, '../build/icon.png'),
        path.join(__dirname, '../public/images/icon.png'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    return undefined;
}

function createWindow() {
    const isDev = !app.isPackaged;

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 960,
        minHeight: 640,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: path.join(__dirname, 'preload.cjs'),
        },
        icon: resolveWindowIcon(),
        title: 'Raintech HRM',
        autoHideMenuBar: true,
        show: false,
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5174');
        if (process.env.ELECTRON_DEVTOOLS === '1') {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    updaterControls = initAutoUpdater(mainWindow, resolveUpdateFeedUrl);
}

ipcMain.on('get-api-base', (event) => {
    event.returnValue = readConfig().apiBase;
});

ipcMain.handle('get-app-version', async () => app.getVersion());

ipcMain.handle('check-for-updates', async () => {
    if (!updaterControls) return { skipped: true };
    try {
        return await updaterControls.checkForUpdates();
    } catch (err) {
        return { error: err?.message || 'Update check failed' };
    }
});

ipcMain.handle('download-update', async () => {
    if (!updaterControls) return { skipped: true };
    try {
        return await updaterControls.downloadUpdate();
    } catch (err) {
        return { error: err?.message || 'Download failed' };
    }
});

ipcMain.handle('install-update', async () => {
    if (!updaterControls) return { skipped: true };
    updaterControls.quitAndInstall();
    return { ok: true };
});

ipcMain.handle('set-api-base', async (_event, raw) => {
    if (typeof raw !== 'string' || !/^https?:\/\//i.test(raw.trim())) {
        return false;
    }
    const apiBase = normalizeApiRoot(raw);
    const existing = readConfig();
    writeConfig({ ...existing, apiBase });
    if (updaterControls && app.isPackaged) {
        const { autoUpdater } = require('electron-updater');
        autoUpdater.setFeedURL({
            provider: 'generic',
            url: resolveUpdateFeedUrl(),
        });
    }
    return true;
});

ipcMain.handle('open-external', async (_event, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        return false;
    }
    await shell.openExternal(url);
    return true;
});

ipcMain.handle('show-notification', async (event, { title, body, tag }) => {
    if (!Notification.isSupported()) return false;

    const notification = new Notification({
        title: title || 'Raintech HRM',
        body: body || '',
        silent: false,
    });

    notification.on('click', () => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            if (!win.isVisible()) win.show();
            win.focus();
        }
        event.sender.send('notification-clicked', { tag });
    });

    notification.show();
    return true;
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        writeConfig(readConfig());
        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
