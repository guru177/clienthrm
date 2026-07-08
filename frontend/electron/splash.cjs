const { BrowserWindow } = require('electron');
const path = require('path');

const SPLASH_WIDTH = 560;
const SPLASH_HEIGHT = 360;
const MIN_VISIBLE_MS = 1400;

let splashWindow = null;
let splashShownAt = 0;
let pendingClose = false;

function createSplashWindow({ iconPath }) {
    if (splashWindow && !splashWindow.isDestroyed()) {
        return splashWindow;
    }

    splashShownAt = Date.now();
    pendingClose = false;

    splashWindow = new BrowserWindow({
        width: SPLASH_WIDTH,
        height: SPLASH_HEIGHT,
        frame: false,
        resizable: false,
        movable: true,
        center: true,
        show: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        backgroundColor: '#ffffff',
        icon: iconPath,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: path.join(__dirname, 'splash-preload.cjs'),
        },
    });

    splashWindow.once('ready-to-show', () => {
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.show();
        }
    });

    splashWindow.loadFile(path.join(__dirname, 'splash.html'));
    return splashWindow;
}

function getSplashWindow() {
    return splashWindow && !splashWindow.isDestroyed() ? splashWindow : null;
}

function updateSplashProgress(percent, message) {
    const win = getSplashWindow();
    if (!win) return;
    win.webContents.send('splash-progress', {
        percent: Math.max(0, Math.min(100, Math.round(percent))),
        message: message || 'Loading…',
    });
}

async function closeSplashWindow() {
    const win = getSplashWindow();
    if (!win) return;

    const elapsed = Date.now() - splashShownAt;
    if (elapsed < MIN_VISIBLE_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_VISIBLE_MS - elapsed));
    }

    if (win.isDestroyed()) {
        splashWindow = null;
        return;
    }

    win.webContents.send('splash-fade-out');
    await new Promise((resolve) => setTimeout(resolve, 420));

    if (!win.isDestroyed()) {
        win.close();
    }
    splashWindow = null;
    pendingClose = false;
}

function destroySplashWindow() {
    const win = getSplashWindow();
    if (win && !win.isDestroyed()) {
        win.destroy();
    }
    splashWindow = null;
}

module.exports = {
    createSplashWindow,
    getSplashWindow,
    updateSplashProgress,
    closeSplashWindow,
    destroySplashWindow,
};
