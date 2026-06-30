const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowDowngrade = false;

function send(mainWindow, payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('desktop-update', payload);
    }
}

function formatReleaseNotes(info) {
    const notes = info?.releaseNotes;
    if (typeof notes === 'string') return notes;
    if (Array.isArray(notes)) {
        return notes.map((entry) => (typeof entry === 'string' ? entry : entry?.note || '')).join('\n');
    }
    return '';
}

/**
 * @param {import('electron').BrowserWindow | null} mainWindow
 * @param {() => string} resolveFeedUrl
 */
function initAutoUpdater(mainWindow, resolveFeedUrl) {
    if (!app.isPackaged) {
        return {
            checkForUpdates: async () => ({ skipped: true }),
            downloadUpdate: async () => ({ skipped: true }),
            quitAndInstall: () => {},
        };
    }

    autoUpdater.setFeedURL({
        provider: 'generic',
        url: resolveFeedUrl(),
    });

    autoUpdater.on('checking-for-update', () => {
        send(mainWindow, { status: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
        send(mainWindow, {
            status: 'available',
            version: info.version,
            releaseNotes: formatReleaseNotes(info),
        });
    });

    autoUpdater.on('update-not-available', (info) => {
        send(mainWindow, {
            status: 'not-available',
            version: info?.version,
        });
    });

    autoUpdater.on('error', (err) => {
        send(mainWindow, {
            status: 'error',
            message: err?.message || 'Update check failed',
        });
    });

    autoUpdater.on('download-progress', (progress) => {
        send(mainWindow, {
            status: 'download-progress',
            percent: progress.percent,
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        send(mainWindow, {
            status: 'downloaded',
            version: info.version,
            releaseNotes: formatReleaseNotes(info),
        });
    });

    setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => {
            send(mainWindow, {
                status: 'error',
                message: err?.message || 'Update check failed',
            });
        });
    }, 10000);

    return {
        checkForUpdates: () => autoUpdater.checkForUpdates(),
        downloadUpdate: () => autoUpdater.downloadUpdate(),
        quitAndInstall: () => autoUpdater.quitAndInstall(false, true),
    };
}

module.exports = { initAutoUpdater };
