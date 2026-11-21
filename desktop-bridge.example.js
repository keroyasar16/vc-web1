/*
 * VC masaüstü uygulaması için ekran/pencere seçici köprüsü (Electron örneği).
 *
 * Web arayüzü, sayfada `window.vcDesktop` varsa yerel sistem penceresi yerine
 * kendi tasarımındaki seçiciyi gösterir. Bu dosya projeyi çalıştırmak için gerekli
 * değildir; yalnızca Electron ile sarmalanmış masaüstü sürümünde kullanılır.
 * Mevcut dialog.showMessageBox tabanlı seçici kodunun yerine geçer.
 */

// ===================== main.js =====================
const { ipcMain, desktopCapturer, session } = require("electron");

let selectedSourceId = null;
let selectedIncludeAudio = false;

function registerScreenPicker() {
  ipcMain.handle("vc:get-screen-sources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 480, height: 270 },
      fetchWindowIcons: true,
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      type: source.id.startsWith("screen:") ? "screen" : "window",
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
    }));
  });

  ipcMain.handle("vc:select-screen-source", (_event, id, includeAudio = false) => {
    selectedSourceId = typeof id === "string" ? id : null;
    selectedIncludeAudio = Boolean(includeAudio);
  });

  // app.whenReady() sonrasında çağır.
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const id = selectedSourceId;
    const includeAudio = selectedIncludeAudio;
    selectedSourceId = null;
    selectedIncludeAudio = false;
    if (!id) return callback({});
    const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
    const source = sources.find((item) => item.id === id);
    if (!source) return callback({});
    // Include audio if requested - "loopback" captures system audio
    callback({ video: source, audio: includeAudio ? "loopback" : undefined });
  });
}
module.exports = { registerScreenPicker };

// ===================== preload.js =====================
// const { contextBridge, ipcRenderer } = require("electron");
// contextBridge.exposeInMainWorld("vcDesktop", {
//   getScreenSources: () => ipcRenderer.invoke("vc:get-screen-sources"),
//   selectScreenSource: (id, includeAudio) => ipcRenderer.invoke("vc:select-screen-source", id, includeAudio),
// });
//
// BrowserWindow oluştururken: webPreferences: { preload: path.join(__dirname, "preload.js"),
//   contextIsolation: true }
