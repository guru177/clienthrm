const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { initAutoUpdater } = require('./updater.cjs');
const { registerPrivilegedScheme, installHrmProtocol } = require('./local-protocol.cjs');
const {
    createSplashWindow,
    updateSplashProgress,
    closeSplashWindow,
    destroySplashWindow,
} = require('./splash.cjs');

registerPrivilegedScheme();

const DEV_API_BASE = 'http://127.0.0.1:3001';

function readPackagedApiFile(name) {
    const filePath = path.join(__dirname, name);
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function packagedApiBase() {
    for (const name of ['production-api.json', 'production-api.json.example']) {
        const prod = readPackagedApiFile(name);
        if (typeof prod?.apiBase === 'string' && prod.apiBase.trim() && !isLocalApi(prod.apiBase)) {
            return normalizeApiRoot(prod.apiBase);
        }
    }
    return DEV_API_BASE;
}

function isLocalApi(raw) {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(String(raw).trim());
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
    const packaged = defaultApiBase();
    if (app.isPackaged) {
        const config = { apiBase: packaged };
        try {
            const parsed = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
            if (typeof parsed.updateUrl === 'string' && parsed.updateUrl.trim()) {
                config.updateUrl = parsed.updateUrl.trim().replace(/\/$/, '');
            }
        } catch {
            /* first run */
        }
        return config;
    }

    try {
        const raw = fs.readFileSync(configPath(), 'utf8');
        const parsed = JSON.parse(raw);
        const config = { apiBase: packaged };
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
    return { apiBase: packaged };
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

function brandingPath(...parts) {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'branding', ...parts);
    }
    return path.join(__dirname, 'branding', ...parts);
}

function resolveLogoForSplash() {
    const candidates = [
        brandingPath('logo.png'),
        brandingPath('icon-256.png'),
        path.join(__dirname, '../build/icon-256.png'),
        path.join(__dirname, '../public/images/logo.png'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return pathToFileURL(candidate).href;
        }
    }
    return undefined;
}

function resolveWindowIcon() {
    const candidates = [
        brandingPath('icon.ico'),
        path.join(__dirname, '../build/icon.ico'),
        brandingPath('icon-256.png'),
        path.join(__dirname, '../build/icon-256.png'),
        path.join(__dirname, '../public/images/logo.png'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    return undefined;
}

function createWindow() {
    const isDev = !app.isPackaged;
    const iconPath = resolveWindowIcon();

    createSplashWindow({ iconPath });
    updateSplashProgress(8, 'Starting HR Daddy…');

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 960,
        minHeight: 640,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: path.join(__dirname, 'preload.cjs'),
        },
        icon: iconPath,
        title: 'HR Daddy',
        autoHideMenuBar: true,
    });

    if (iconPath && process.platform === 'win32') {
        mainWindow.setIcon(iconPath);
    }

    mainWindow.webContents.on('did-start-loading', () => {
        updateSplashProgress(34, 'Loading interface…');
    });

    mainWindow.webContents.on('dom-ready', () => {
        updateSplashProgress(68, 'Preparing workspace…');
    });

    mainWindow.webContents.on('did-finish-load', () => {
        updateSplashProgress(88, 'Almost ready…');
    });

    mainWindow.once('ready-to-show', async () => {
        updateSplashProgress(100, 'Launching…');
        await closeSplashWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    updateSplashProgress(18, 'Connecting to services…');

    if (isDev) {
        mainWindow.loadURL('http://localhost:5174');
        if (process.env.ELECTRON_DEVTOOLS === '1') {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
    } else {
        const distRoot = path.join(__dirname, '../dist');
        installHrmProtocol(distRoot);
        mainWindow.loadURL('hrm://app/index.html');
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    updaterControls = initAutoUpdater(mainWindow, resolveUpdateFeedUrl);
}

ipcMain.on('splash-meta', (event) => {
    event.returnValue = {
        appName: 'HR Daddy',
        version: app.getVersion(),
        logoPath: resolveLogoForSplash(),
    };
});

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
        title: title || 'HR Daddy',
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

    app.on('before-quit', () => {
        destroySplashWindow();
    });

    app.whenReady().then(() => {
        app.setAppUserModelId('com.raintech.hrm');
        const iconPath = resolveWindowIcon();
        if (iconPath) {
            app.setAboutPanelOptions({
                applicationName: 'HR Daddy',
                applicationVersion: app.getVersion(),
                copyright: 'Copyright © Raintech Software',
                version: app.getVersion(),
                iconPath,
            });
        }

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
