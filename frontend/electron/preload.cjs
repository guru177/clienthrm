const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    isElectron: true,
    getApiBase: () => ipcRenderer.sendSync('get-api-base'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    setApiBase: (url) => ipcRenderer.invoke('set-api-base', url),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    showNotification: ({ title, body, tag }) =>
        ipcRenderer.invoke('show-notification', { title, body, tag }),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    onNotificationClick: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('notification-clicked', listener);
        return () => ipcRenderer.removeListener('notification-clicked', listener);
    },
    onDesktopUpdate: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('desktop-update', listener);
        return () => ipcRenderer.removeListener('desktop-update', listener);
    },
});
