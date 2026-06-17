const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron');
const path = require('path');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

function createWindow() {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs')
        },
        icon: path.join(__dirname, '../public/images/icon.png'),
        title: 'Raintech HRM',
        autoHideMenuBar: true,
    });

    // In development mode, load the Vite dev server URL
    // In production mode, load the compiled HTML file
    const isDev = !app.isPackaged;

    if (isDev) {
        mainWindow.loadURL('http://localhost:5174');
        // Open the DevTools automatically if desired
        // mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Emitted when the window is closed.
    mainWindow.on('closed', function () {
        // Dereference the window object
        mainWindow = null;
    });
}

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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
