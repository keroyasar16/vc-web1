const { app, BrowserWindow, ipcMain, desktopCapturer, session, dialog } = require('electron');
const path = require('path');
const { createServer } = require('./server.js');
const { autoUpdater } = require('electron-updater');

// ==================== KONFİGÜRASYON ====================
// Varsayılan: Uzak sunucu (web ile aynı veri)
// Yerel sunucu için: VC_LOCAL=1 npm start / VC_LOCAL=1 VC.exe
const USE_LOCAL_SERVER = process.env.VC_LOCAL === '1' || process.argv.includes('--local');

// Production URL - BURAYA KENDİ WEB ADRESİNİZİ YAZIN
const REMOTE_URL = 'https://vcchats.com'; // <-- DEĞİŞTİRİN

// Auto-updater URL (GitHub Releases)
const UPDATE_URL = 'https://github.com/keroyasar16/vc-web1/releases/latest'; // <-- DEĞİŞTİRİN

// Geliştirme mi paketlenmiş mi?
const isDev = !app.isPackaged;

// WGC (Windows Graphics Capture) - Varsayılan KAPALI
app.commandLine.appendSwitch('log-level', '3');

if (process.env.VC_ENABLE_WGC === '1') {
  app.commandLine.appendSwitch('enable-features', 'ScreenCaptureWithWGC');
  console.log('[VC] WGC etkin');
} else {
  app.commandLine.appendSwitch('disable-features', 'WindowsGraphicsCapture');
  console.log('[VC] WGC devre dışı - Legacy GDI capture');
}

// ==================== DEĞİŞKENLER ====================
let mainWindow;
let server;
let selectedSourceId = null;
let selectedIncludeAudio = false;
let updateDownloaded = false;

// ==================== YARDIMCI FONKSİYONLAR ====================
function getResourcePath(...paths) {
  const base = isDev ? __dirname : process.resourcesPath;
  return path.join(base, ...paths);
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// ==================== WINDOW CONTROLS (Custom title bar) ====================
ipcMain.on('vc:window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});

ipcMain.on('vc:window-maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on('vc:window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

ipcMain.handle('vc:window-is-maximized', () => {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false;
});

// Send maximized state changes to renderer
function registerWindowStateEvents() {
  if (!mainWindow) return;
  mainWindow.on('maximize', () => sendToRenderer('vc:window-state', { maximized: true }));
  mainWindow.on('unmaximize', () => sendToRenderer('vc:window-state', { maximized: false }));
}

// ==================== SCREEN PICKER (Masaüstü özel) ====================
function registerScreenPicker() {
  ipcMain.handle('vc:get-screen-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 480, height: 270 },
        fetchWindowIcons: true,
      });
      return sources.map((source) => ({
        id: source.id,
        name: source.name,
        type: source.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: source.thumbnail.toDataURL(),
        appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
      }));
    } catch (error) {
      console.error('Screen sources error:', error);
      return [];
    }
  });

  ipcMain.handle('vc:select-screen-source', (_event, id, includeAudio = false) => {
    selectedSourceId = typeof id === 'string' ? id : null;
    selectedIncludeAudio = Boolean(includeAudio);
  });

  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const id = selectedSourceId;
    const includeAudio = selectedIncludeAudio;
    selectedSourceId = null;
    selectedIncludeAudio = false;
    if (!id) return callback({});
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const source = sources.find((item) => item.id === id);
      if (!source) {
        console.warn('Selected screen source not found:', id);
        return callback({});
      }
      callback({ video: source, audio: includeAudio ? 'loopback' : undefined });
    } catch (error) {
      console.error('Display media request error:', error);
      callback({});
    }
  });
}

// ==================== AUTO-UPDATER ====================
function setupAutoUpdater() {
  if (isDev) {
    console.log('[VC] Development modu - auto-updater atlandı');
    return;
  }

  if (USE_LOCAL_SERVER) {
    console.log('[VC] Yerel sunucu modu - auto-updater atlandı');
    return;
  }

  autoUpdater.logger = require('electron-log');
  autoUpdater.logger.transports.file.level = 'info';
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // GitHub Releases'dan güncelleme kontrolü
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'keroyasar16',
    repo: 'vc-web1',
  });

  autoUpdater.on('checking-for-update', () => {
    console.log('[VC] Güncelleme kontrol ediliyor...');
    sendToRenderer('vc-update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[VC] Güncelleme bulundu:', info.version);
    sendToRenderer('vc-update-status', { status: 'available', version: info.version, notes: info.releaseNotes });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[VC] Güncelleme yok, sürüm:', info.version);
    sendToRenderer('vc-update-status', { status: 'none', version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent);
    console.log(`[VC] İndiriliyor: ${percent}%`);
    sendToRenderer('vc-update-status', { status: 'downloading', percent, transferred: progress.transferred, total: progress.total });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[VC] Güncelleme indirildi, yeniden başlatma bekliyor:', info.version);
    updateDownloaded = true;
    sendToRenderer('vc-update-status', { status: 'downloaded', version: info.version, releaseNotes: info.releaseNotes });

    // Kullanıcıya bildir
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Güncelleme Hazır',
      message: `VC v${info.version} indirildi. Uygulama kapatıldığında otomatik kurulacak.`,
      detail: info.releaseNotes || '',
      buttons: ['Şimdi Yeniden Başlat', 'Sonra'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[VC] Auto-updater hatası:', err);
    sendToRenderer('vc-update-status', { status: 'error', error: err.message });
  });

  // Başlangıçta ve periyodik kontrol
  autoUpdater.checkForUpdatesAndNotify();

  // Her 4 saatte bir kontrol et
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 4 * 60 * 60 * 1000);
}

// Renderer'dan manuel kontrol isteği
ipcMain.handle('vc:check-updates', async () => {
  if (isDev || USE_LOCAL_SERVER) return { status: 'disabled' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { status: 'checked', updateInfo: result?.updateInfo };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
});

ipcMain.handle('vc:install-update', async () => {
  if (updateDownloaded) {
    autoUpdater.quitAndInstall(false, true);
  }
  return { status: updateDownloaded ? 'installing' : 'not_ready' };
});

// ==================== PENCERE OLUŞTUR ====================
function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    icon: path.join(__dirname, 'desktop-icons', 'vc.ico'),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    show: false,
    backgroundColor: '#1b1d24',
  });

  registerScreenPicker();
  registerWindowStateEvents();

  // Yükleme hatalarını yakala (sadece yerel modda)
  if (USE_LOCAL_SERVER) {
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error('Load failed:', errorCode, errorDescription, validatedURL);
      if (errorCode === -102 || errorCode === -101 || errorCode === -7) {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.loadURL(`http://localhost:${port}`);
          }
        }, 500);
      }
    });
  }

  // Loading spinner
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.executeJavaScript(`
      if (!document.getElementById('vc-loading')) {
        const style = document.createElement('style');
        style.textContent = \`
          #vc-loading { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #1b1d24; color: #f3f1ec; z-index: 9999; font-family: system-ui, sans-serif; }
          #vc-loading .spinner { width: 32px; height: 32px; border: 3px solid rgba(255,255,255,.1); border-top-color: #7c84ff; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 16px; }
          @keyframes spin { to { transform: rotate(360deg); } }
        \`;
        document.head.appendChild(style);
        const div = document.createElement('div');
        div.id = 'vc-loading';
        div.innerHTML = '<div class="spinner"></div><span>Yükleniyor...</span>';
        document.body.appendChild(div);
      }
    `).catch(() => {});
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      const el = document.getElementById('vc-loading');
      if (el) el.remove();
    `).catch(() => {});
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
  });

  // ==================== URL YÜKLE ====================
  if (USE_LOCAL_SERVER) {
    // YEREL SUNUCU MODU
    console.log('[VC] Yerel sunucu modu aktif');

    const port = Number(process.env.PORT) || 3000;
    const dataDirectory = process.env.DATA_DIR || getResourcePath('data');
    const { server: srv } = createServer({ dataFile: path.join(dataDirectory, 'store.json') });
    server = srv;

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} kullanımda.`);
      } else {
        console.error('Server error:', err);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      console.log(`VC local server: http://localhost:${port}`);
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(`http://localhost:${port}`);
        }
      }, 300);
    });
  } else {
    // UZAK SUNUCU MODU (Varsayılan - Web ile aynı veri)
    console.log('[VC] Uzak sunucu modu:', REMOTE_URL);
    mainWindow.loadURL(REMOTE_URL);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ==================== APP LIFECYCLE ====================
app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    require('electron').shell.openExternal(navigationUrl);
  });
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});