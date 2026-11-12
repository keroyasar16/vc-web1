(() => {
  "use strict";
  const list = document.getElementById("vc-shortcut-list");
  if (!list) return;
  const dialog = document.getElementById("user-settings-dialog");
  const storageKey = "vc.shortcut.bindings.v1";
  const enabledKey = "vc.shortcut.enabled.v1";
  const actions = [
    { id: "mic", label: "Mikrofonu Aç / Kapat", defaultKey: "Ctrl+KeyM", target: "mute-button" },
    { id: "sound", label: "Mikrofon ve Hoparlörü Aç / Kapat", defaultKey: "Ctrl+Shift+KeyD", target: "sound-mute-button" }
  ];
  const modifiers = new Set(["ControlLeft","ControlRight","AltLeft","AltRight","ShiftLeft","ShiftRight","MetaLeft","MetaRight"]);
  let saved = {}, enabled = {}, recording = null;
  try { const value = JSON.parse(localStorage.getItem(storageKey) || "{}"); if (value && typeof value === "object" && !Array.isArray(value)) saved = value; } catch {}
  try { const value = JSON.parse(localStorage.getItem(enabledKey) || "{}"); if (value && typeof value === "object" && !Array.isArray(value)) enabled = value; } catch {}
  const get = (a) => Object.prototype.hasOwnProperty.call(saved, a.id) ? saved[a.id] : a.defaultKey;
  const isEnabled = (a) => enabled[a.id] !== false;
  const store = () => { try { localStorage.setItem(storageKey, JSON.stringify(saved)); localStorage.setItem(enabledKey, JSON.stringify(enabled)); } catch {} };
  const pretty = (value) => value ? value.split("+").map(p => ({Delete:"DEL",Backspace:"BACKSPACE",Space:"SPACE",Escape:"ESC",PageUp:"PAGE UP",PageDown:"PAGE DOWN",ArrowUp:"↑",ArrowDown:"↓",ArrowLeft:"←",ArrowRight:"→"}[p] || p.replace(/^Key/, "").replace(/^Digit/, ""))).join(" + ") : "Tuş Atanmamış";
  const status = document.createElement("p"); status.className = "settings-note vc-shortcut-status"; status.setAttribute("role", "status"); list.after(status);
  const notify = (msg) => { status.textContent = msg; };
  function bindingOf(event) {
    if (modifiers.has(event.code)) return null;
    const code = event.code || event.key;
    if (!code || code === "Unidentified" || code === "Process") return null;
    return [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Meta", code].filter(Boolean).join("+");
  }
  function make(tag, cls, text) { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; }
  function render() {
    list.replaceChildren();
    for (const a of actions) {
      const row = make("div", "vc-shortcut-row");
      const left = make("div", "vc-shortcut-action");
      const actionLabel = make("span", "vc-shortcut-field-label", "Tuş Ataması Eylemi");
      const select = make("div", "vc-shortcut-action-name", a.label);
      left.append(actionLabel, select);
      const middle = make("div", "vc-shortcut-binding");
      middle.append(make("span", "vc-shortcut-field-label", "Tuş Ataması"));
      const control = make("div", "vc-shortcut-binding-control");
      const key = make("kbd", "vc-shortcut-key", recording === a.id ? "Bir tuşa bas…" : pretty(get(a)));
      const assign = make("button", "vc-shortcut-assign", recording === a.id ? "Dinleniyor…" : get(a) ? "Tuş At. Düzenle" : "Tuş Ata");
      assign.type = "button";
      assign.addEventListener("click", () => { recording = a.id; notify("Bir tuşa veya tuş kombinasyonuna bas. ESC iptal eder."); render(); });
      control.append(key, assign); middle.append(control);
      const remove = make("button", "vc-shortcut-remove", "✕"); remove.type = "button"; remove.title = "Atamayı kaldır"; remove.setAttribute("aria-label", a.label + " kısayolunu kaldır");
      remove.addEventListener("click", () => { saved[a.id] = ""; recording = null; store(); render(); notify("Kısayol kaldırıldı."); });
      const toggle = make("label", "vc-shortcut-switch"); toggle.title = "Kısayolu etkinleştir / devre dışı bırak";
      const check = document.createElement("input"); check.type = "checkbox"; check.checked = isEnabled(a); check.setAttribute("aria-label", a.label + " etkin");
      check.addEventListener("change", () => { enabled[a.id] = check.checked; store(); });
      toggle.append(check, make("span", "vc-shortcut-switch-track"));
      row.append(left, middle, remove, toggle); list.append(row);
    }
  }
  document.addEventListener("keydown", (event) => {
    if (recording) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === "Escape") { recording = null; render(); notify("Atama iptal edildi."); return; }
      if (event.repeat) return;
      const binding = bindingOf(event); if (!binding) return;
      if (actions.some(a => a.id !== recording && get(a) === binding)) { notify("Bu tuş başka bir işlemde kullanılıyor."); return; }
      saved[recording] = binding; recording = null; store(); render(); notify("Kısayol kaydedildi."); return;
    }
    if (event.repeat || event.isComposing || event.defaultPrevented || event.metaKey) return;
    const target = event.target;
    if (target instanceof Element && target.closest("input, textarea, select, button, [contenteditable], [role=textbox], dialog[open]")) return;
    if (document.querySelector("dialog[open]")) return;
    const binding = bindingOf(event); if (!binding) return;
    const action = actions.find(a => isEnabled(a) && get(a) === binding); if (!action) return;
    const button = document.getElementById(action.target); if (!button || button.disabled) return;
    event.preventDefault(); button.click();
  }, true);
  dialog?.addEventListener("close", () => { recording = null; render(); });
  render();
})();
