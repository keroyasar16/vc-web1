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

  // Pencere kontrolleri (Custom title bar)
  window: {
    minimize: () => ipcRenderer.send('vc:window-minimize'),
    maximize: () => ipcRenderer.send('vc:window-maximize'),
    close: () => ipcRenderer.send('vc:window-close'),
    isMaximized: () => ipcRenderer.invoke('vc:window-is-maximized'),
    onStateChange: (callback) => {
      ipcRenderer.on('vc:window-state', (_event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('vc:window-state');
    },
  },
});