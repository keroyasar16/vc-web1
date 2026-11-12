// Isolated shortcut controls: initialize independently of app.js errors.
(() => {
  "use strict";
  const list = document.getElementById("vc-shortcut-list");
  if (!list) return;
  const settings = document.getElementById("user-settings-dialog");
  const storageKey = "vc.shortcut.bindings.v1";
  const actions = [
    { id: "mic", label: "Mikrofonu Aç / Kapat", defaultKey: "Ctrl+KeyM", target: "mute-button" },
    { id: "sound", label: "Mikrofon ve Hoparlörü Aç / Kapat", defaultKey: "Ctrl+Shift+KeyD", target: "sound-mute-button" }
  ];
  let saved = {};
  try { const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}"); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) saved = parsed; } catch {}
  let recording = null;
  const get = (item) => Object.prototype.hasOwnProperty.call(saved, item.id) ? saved[item.id] : item.defaultKey;
  const labelFor = (value) => value ? value.replace(/Key([A-Z])/g, "$1").replace(/Digit([0-9])/g, "$1").replace(/\+/g, " + ") : "Atanmamış";
  const persist = () => { try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch {} };
  const toast = (message) => { const status = document.getElementById("vc-shortcut-status"); if (status) status.textContent = message; };
  const status = document.createElement("p"); status.id = "vc-shortcut-status"; status.className = "settings-note"; status.setAttribute("role", "status"); list.after(status);
  function render() {
    list.replaceChildren();
    for (const item of actions) {
      const row = document.createElement("div"); row.className = "vc-shortcut-row";
      const label = document.createElement("span"); label.textContent = item.label;
      const key = document.createElement("kbd"); key.textContent = recording === item.id ? "Tuş kombinasyonuna bas…" : labelFor(get(item));
      const assign = document.createElement("button"); assign.type = "button"; assign.className = "settings-secondary-button"; assign.textContent = recording === item.id ? "Bekleniyor…" : "Tuş Ata";
      assign.addEventListener("click", () => { recording = item.id; toast("Bir kombinasyon seç veya ESC ile iptal et."); render(); });
      const clear = document.createElement("button"); clear.type = "button"; clear.className = "settings-secondary-button"; clear.textContent = "Kaldır";
      clear.addEventListener("click", () => { saved[item.id] = ""; recording = null; persist(); render(); toast("Kısayol kaldırıldı."); });
      row.append(label, key, assign, clear); list.append(row);
    }
  }
  const modifierCodes = new Set(["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"]);
  function bindingOf(event) {
    if (modifierCodes.has(event.code)) return null;
    const parts = [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Meta"].filter(Boolean);
    if (!parts.length && !/^F([1-9]|1[0-2])$/.test(event.code)) return "";
    return [...parts, event.code].join("+");
  }
  document.addEventListener("keydown", (event) => {
    if (recording) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === "Escape") { recording = null; render(); toast("Atama iptal edildi."); return; }
      const binding = bindingOf(event);
      if (binding === null) return;
      if (!binding) { toast("Ctrl, Alt veya Shift ile bir tuş seç; F1–F12 de kullanılabilir."); return; }
      if (actions.some((item) => item.id !== recording && get(item) === binding)) { toast("Bu kombinasyon zaten başka bir işlemde kullanılıyor."); return; }
      saved[recording] = binding; recording = null; persist(); render(); toast("Kısayol kaydedildi."); return;
    }
    if (event.repeat || event.isComposing || event.defaultPrevented) return;
    const target = event.target;
    if (target instanceof Element && target.closest("input, textarea, select, [contenteditable], [role=textbox], dialog[open]")) return;
    const binding = bindingOf(event);
    if (!binding) return;
    const action = actions.find((item) => get(item) === binding);
    if (!action) return;
    const button = document.getElementById(action.target);
    if (!button || button.disabled) return;
    event.preventDefault(); button.click();
  }, true);
  settings?.addEventListener("close", () => { recording = null; render(); });
  render();
})();
