const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splashApi', {
    getMeta: () => ipcRenderer.sendSync('splash-meta'),
    onProgress: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('splash-progress', listener);
        return () => ipcRenderer.removeListener('splash-progress', listener);
    },
    onFadeOut: (callback) => {
        const listener = () => callback();
        ipcRenderer.on('splash-fade-out', listener);
        return () => ipcRenderer.removeListener('splash-fade-out', listener);
    },
});
