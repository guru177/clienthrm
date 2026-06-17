const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    isElectron: true,
    send: (channel, data) => {
        const validChannels = ['toMain'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    receive: (channel, func) => {
        const validChannels = ['fromMain'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    },
    showNotification: ({ title, body, tag }) =>
        ipcRenderer.invoke('show-notification', { title, body, tag }),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    onNotificationClick: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('notification-clicked', listener);
        return () => ipcRenderer.removeListener('notification-clicked', listener);
    },
});
