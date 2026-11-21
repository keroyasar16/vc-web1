const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vcDesktop', {
  // Ekran paylaşım seçici
  getScreenSources: () => ipcRenderer.invoke('vc:get-screen-sources'),
  selectScreenSource: (id, includeAudio) => ipcRenderer.invoke('vc:select-screen-source', id, includeAudio),

  // Auto-updater API (sadece masaüstü uygulamasında çalışır)
  updates: {
    check: () => ipcRenderer.invoke('vc:check-updates'),
    install: () => ipcRenderer.invoke('vc:install-update'),
    onStatus: (callback) => {
      ipcRenderer.on('vc-update-status', (_event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('vc-update-status');
    },
  },
});