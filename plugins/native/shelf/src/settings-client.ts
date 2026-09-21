import {
  CARBON_CMD_KEY,
  CARBON_CONTROL_KEY,
  CARBON_KEY_NAME,
  CARBON_OPTION_KEY,
  CARBON_SHIFT_KEY,
  HOTKEY_OCCUPIED,
  HOTKEY_RECORDING,
  KEYBOARD_CODE_TO_CARBON,
  MODIFIER_EVENT_CODES,
  defaultShelfHotKeys,
} from "@molis-ai/molis-work-module-shelf";

/** Live-saves Shelf device settings from the global settings page. */
export const SHELF_SETTINGS_CLIENT_SCRIPT = `(() => {
  const CODES = ${JSON.stringify(KEYBOARD_CODE_TO_CARBON)};
  const NAMES = ${JSON.stringify(CARBON_KEY_NAME)};
  const MODIFIER_CODES = ${JSON.stringify(MODIFIER_EVENT_CODES)};
  const DEFAULTS = ${JSON.stringify(defaultShelfHotKeys())};
  const CONTROL = ${CARBON_CONTROL_KEY};
  const OPTION = ${CARBON_OPTION_KEY};
  const SHIFT = ${CARBON_SHIFT_KEY};
  const CMD = ${CARBON_CMD_KEY};
  const t = (value) => (typeof L === "function" ? L(value) : value);
  let recording = null;

  const chordFromEvent = (event) => {
    if (MODIFIER_CODES.includes(event.code)) return null;
    const keyCode = CODES[event.code];
    if (keyCode == null) return null;
    let mods = 0;
    if (event.ctrlKey) mods |= CONTROL;
    if (event.altKey) mods |= OPTION;
    if (event.shiftKey) mods |= SHIFT;
    if (event.metaKey) mods |= CMD;
    return { key_code: keyCode, carbon_modifiers: mods };
  };
  const labelOf = (chord) => {
    let parts = "";
    if (chord.carbon_modifiers & CONTROL) parts += "⌃";
    if (chord.carbon_modifiers & OPTION) parts += "⌥";
    if (chord.carbon_modifiers & SHIFT) parts += "⇧";
    if (chord.carbon_modifiers & CMD) parts += "⌘";
    parts += NAMES[chord.key_code] || ("Key" + chord.key_code);
    return parts;
  };
  const same = (left, right) => left && right && left.key_code === right.key_code && left.carbon_modifiers === right.carbon_modifiers;
  const invoke = (name, payload) => {
    const fn = globalThis.__TAURI__?.core?.invoke;
    return typeof fn === "function" ? fn(name, payload) : Promise.resolve(null);
  };
  const stopRecording = () => {
    if (!recording) return;
    if (recording.panel) {
      const panelButton = recording.row.querySelector("[data-shelf-panel-record]");
      if (panelButton) {
        panelButton.setAttribute("aria-pressed", "false");
        panelButton.textContent = panelLabel({
          code: panelButton.dataset.code,
          meta: panelButton.dataset.meta === "true",
          ctrl: panelButton.dataset.ctrl === "true",
          alt: panelButton.dataset.alt === "true",
          shift: panelButton.dataset.shift === "true",
        });
      }
      recording.row.classList.remove("is-recording");
      recording = null;
      return;
    }
    const button = recording.row.querySelector("[data-shelf-hotkey-record]");
    if (button) {
      button.setAttribute("aria-pressed", "false");
      button.textContent = labelOf({
        key_code: Number(button.dataset.keyCode),
        carbon_modifiers: Number(button.dataset.carbonModifiers),
      });
    }
    recording.row.classList.remove("is-recording");
    recording = null;
  };
  const paintChord = (row, chord) => {
    const button = row.querySelector("[data-shelf-hotkey-record]");
    const reset = row.querySelector("[data-shelf-hotkey-reset]");
    if (!button || !chord) return;
    button.dataset.keyCode = String(chord.key_code);
    button.dataset.carbonModifiers = String(chord.carbon_modifiers);
    button.textContent = labelOf(chord);
    button.setAttribute("aria-pressed", "false");
    if (reset) reset.hidden = same(chord, DEFAULTS[row.dataset.shelfHotkeySlot]);
  };
  const paintOccupied = (root, status) => {
    root.querySelectorAll("[data-shelf-hotkey-slot]").forEach((row) => {
      const slot = row.dataset.shelfHotkeySlot;
      const caption = row.querySelector("[data-shelf-hotkey-caption]");
      if (!caption) return;
      const taken = status?.[slot] === false;
      caption.textContent = taken ? t(${JSON.stringify(HOTKEY_OCCUPIED)}) : (caption.dataset.idleCaption || caption.textContent);
      caption.toggleAttribute("data-occupied", taken);
    });
  };
  const paintHotkeysFromSettings = (root, hotkeys) => {
    if (!hotkeys) return;
    root.querySelectorAll("[data-shelf-hotkey-slot]").forEach((row) => {
      paintChord(row, hotkeys[row.dataset.shelfHotkeySlot]);
    });
  };
  const applyNative = async (hotkeys) => {
    if (!hotkeys) return null;
    return invoke("shelf_apply_hotkeys", {
      toggle: hotkeys.toggle,
      capture: hotkeys.capture,
      files: hotkeys.files,
    });
  };
  const savePatch = async (root, patch) => {
    const response = await fetch("/api/shelf/settings", {
      method: "POST",
      headers: { ...(globalThis.molisWorkControlHeaders?.() || {}), "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || t("无法保存 Shelf 设置"));
    paintHotkeysFromSettings(root, body.hotkeys);
    if (patch.hotkeys) {
      const status = await applyNative(body.hotkeys).catch(() => null);
      if (status) paintOccupied(root, status);
    } else {
      invoke("shelf_hotkey_status").then((next) => paintOccupied(root, next)).catch(() => {});
    }
    return body;
  };

  let settings = null;
  const refreshSettings = async (scope) => {
    try {
      const response = await fetch("/api/shelf/settings", { cache: "no-store" });
      if (response.ok) settings = await response.json();
    } catch {}
    paintPanes(scope);
    return settings;
  };
  const say = (scope, selector, message) => {
    const node = scope.querySelector(selector);
    if (!node) return;
    node.hidden = !message;
    node.textContent = message || "";
  };
  const panelLabel = (chord) => {
    let label = "";
    if (chord.ctrl) label += "⌃";
    if (chord.alt) label += "⌥";
    if (chord.shift) label += "⇧";
    if (chord.meta) label += "⌘";
    const code = chord.code;
    if (code === "Escape") return label + "Esc";
    if (code === "Backspace") return label + "⌫";
    if (code === "Delete") return label + "⌦";
    if (code === "Enter") return label + "↩";
    if (code.startsWith("Key")) return label + code.slice(3);
    if (code.startsWith("Digit")) return label + code.slice(5);
    return label + code;
  };
  const panelDefaults = {
    hide: { code: "Escape", meta: false, ctrl: false, alt: false, shift: false },
    paste: { code: "KeyV", meta: true, ctrl: false, alt: false, shift: false },
    copy: { code: "KeyC", meta: true, ctrl: false, alt: false, shift: false },
    delete: { code: "Backspace", meta: false, ctrl: false, alt: false, shift: false },
  };
  const samePanel = (left, right) => Boolean(left && right)
    && left.code === right.code && !!left.meta === !!right.meta && !!left.ctrl === !!right.ctrl
    && !!left.alt === !!right.alt && !!left.shift === !!right.shift;
  const paintPanelKeys = (scope) => {
    if (!settings?.panel_keys) return;
    scope.querySelectorAll("[data-shelf-panel-slot]").forEach((row) => {
      const slot = row.dataset.shelfPanelSlot;
      const chord = settings.panel_keys[slot];
      const button = row.querySelector("[data-shelf-panel-record]");
      const reset = row.querySelector("[data-shelf-panel-reset]");
      if (!button || !chord) return;
      button.dataset.code = chord.code;
      button.dataset.meta = String(Boolean(chord.meta));
      button.dataset.ctrl = String(Boolean(chord.ctrl));
      button.dataset.alt = String(Boolean(chord.alt));
      button.dataset.shift = String(Boolean(chord.shift));
      button.textContent = panelLabel(chord);
      button.setAttribute("aria-pressed", "false");
      if (reset) reset.hidden = samePanel(chord, panelDefaults[slot]);
    });
  };
  const paintPanes = (scope) => {
    paintPanelKeys(scope);
    if (!settings) return;
    scope.querySelectorAll("[data-shelf-engine]").forEach((input) => {
      input.checked = input.value === settings.engine;
    });
  };
  const reloadPage = () => { location.reload(); };

  const bind = (root) => {
    const scope = root && root.querySelector ? root : document;
    scope.querySelectorAll("[data-shelf-panel-slot]").forEach((row) => {
      if (row.dataset.shelfSettingsBound === "1") return;
      row.dataset.shelfSettingsBound = "1";
      const record = row.querySelector("[data-shelf-panel-record]");
      const reset = row.querySelector("[data-shelf-panel-reset]");
      record?.addEventListener("click", () => {
        if (recording?.row === row) { stopRecording(); return; }
        stopRecording();
        recording = { row, root: scope, panel: true };
        row.classList.add("is-recording");
        record.setAttribute("aria-pressed", "true");
        record.textContent = t(${JSON.stringify(HOTKEY_RECORDING)});
        record.focus();
      });
      reset?.addEventListener("click", async () => {
        const slot = row.dataset.shelfPanelSlot;
        if (!slot) return;
        stopRecording();
        try {
          settings = await savePatch(scope, { panel_keys: { [slot]: panelDefaults[slot] } });
          paintPanelKeys(scope);
        } catch {}
      });
    });
    scope.querySelectorAll("[data-shelf-engine]").forEach((input) => {
      if (input.dataset.shelfSettingsBound === "1") return;
      input.dataset.shelfSettingsBound = "1";
      input.addEventListener("change", async () => {
        if (!input.checked) return;
        try { settings = await savePatch(scope, { engine: input.value }); } catch {}
      });
    });
    const runtimeForm = scope.querySelector("[data-shelf-runtime-form]");
    if (runtimeForm && runtimeForm.dataset.shelfSettingsBound !== "1") {
      runtimeForm.dataset.shelfSettingsBound = "1";
      runtimeForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const current = settings || await refreshSettings(scope);
        const title = runtimeForm.querySelector("[data-shelf-runtime-title]")?.value?.trim() || "";
        const executable = runtimeForm.querySelector("[data-shelf-runtime-path]")?.value?.trim() || "";
        const kind = runtimeForm.querySelector("[data-shelf-runtime-kind]")?.value === "cli" ? "cli" : "tui";
        const next = [...(current?.custom_runtimes || []), { id: "", title, executable, kind }];
        try {
          settings = await savePatch(scope, { custom_runtimes: next });
          reloadPage();
        } catch (error) {
          say(scope, "[data-shelf-runtime-error]", error.message);
        }
      });
    }
    scope.querySelectorAll("[data-shelf-runtime-delete]").forEach((button) => {
      if (button.dataset.shelfSettingsBound === "1") return;
      button.dataset.shelfSettingsBound = "1";
      button.addEventListener("click", async () => {
        const id = button.closest("[data-shelf-runtime-id]")?.dataset.shelfRuntimeId;
        const current = settings || await refreshSettings(scope);
        if (!id || !current) return;
        try {
          settings = await savePatch(scope, { custom_runtimes: current.custom_runtimes.filter((entry) => entry.id !== id) });
          reloadPage();
        } catch (error) {
          say(scope, "[data-shelf-runtime-error]", error.message);
        }
      });
    });
    const shortcutForm = scope.querySelector("[data-shelf-shortcut-form]");
    if (shortcutForm && shortcutForm.dataset.shelfSettingsBound !== "1") {
      shortcutForm.dataset.shelfSettingsBound = "1";
      shortcutForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const current = settings || await refreshSettings(scope);
        const id = shortcutForm.querySelector("[data-shelf-shortcut-id]")?.value || "";
        const name = shortcutForm.querySelector("[data-shelf-shortcut-name]")?.value?.trim() || "";
        const prompt = shortcutForm.querySelector("[data-shelf-shortcut-prompt]")?.value?.trim() || "";
        const kinds = [...shortcutForm.querySelectorAll("[data-shelf-shortcut-kind]")]
          .filter((box) => box.checked).map((box) => box.dataset.shelfShortcutKind);
        const action = { id, name, prompt, kinds };
        const existing = current?.shortcuts || [];
        const next = id && existing.some((entry) => entry.id === id)
          ? existing.map((entry) => entry.id === id ? action : entry)
          : [...existing, action];
        try {
          settings = await savePatch(scope, { shortcuts: next });
          reloadPage();
        } catch (error) {
          say(scope, "[data-shelf-shortcut-error]", error.message);
        }
      });
      shortcutForm.querySelector("[data-shelf-shortcut-reset]")?.addEventListener("click", () => {
        shortcutForm.reset();
        const idField = shortcutForm.querySelector("[data-shelf-shortcut-id]");
        if (idField) idField.value = "";
      });
    }
    scope.querySelectorAll("[data-shelf-action-slot]").forEach((row) => {
      if (row.dataset.shelfSettingsBound === "1") return;
      row.dataset.shelfSettingsBound = "1";
      const slot = row.dataset.shelfActionSlot;
      row.querySelector("[data-shelf-action-visible]")?.addEventListener("click", async () => {
        const current = settings || await refreshSettings(scope);
        const hidden = new Set(current?.hidden_actions || []);
        if (hidden.has(slot)) hidden.delete(slot); else hidden.add(slot);
        try {
          settings = await savePatch(scope, { hidden_actions: [...hidden] });
          reloadPage();
        } catch {}
      });
      row.querySelectorAll("[data-shelf-action-move]").forEach((button) => {
        button.addEventListener("click", async () => {
          const current = settings || await refreshSettings(scope);
          const order = [...(current?.action_order || [])];
          const index = order.indexOf(slot);
          const next = button.dataset.shelfActionMove === "up" ? index - 1 : index + 1;
          if (index < 0 || next < 0 || next >= order.length) return;
          order.splice(next, 0, order.splice(index, 1)[0]);
          try {
            settings = await savePatch(scope, { action_order: order });
            reloadPage();
          } catch {}
        });
      });
      row.querySelector("[data-shelf-action-edit]")?.addEventListener("click", async () => {
        const current = settings || await refreshSettings(scope);
        const id = slot.startsWith("shortcut:") ? slot.slice("shortcut:".length) : "";
        const action = (current?.shortcuts || []).find((entry) => entry.id === id);
        if (!action) return;
        const form = scope.querySelector("[data-shelf-shortcut-form]");
        if (!form) return;
        form.querySelector("[data-shelf-shortcut-id]").value = action.id;
        form.querySelector("[data-shelf-shortcut-name]").value = action.name;
        form.querySelector("[data-shelf-shortcut-prompt]").value = action.prompt;
        form.querySelectorAll("[data-shelf-shortcut-kind]").forEach((box) => {
          box.checked = action.kinds.includes(box.dataset.shelfShortcutKind);
        });
        form.scrollIntoView({ block: "center" });
      });
      row.querySelector("[data-shelf-action-delete]")?.addEventListener("click", async () => {
        const current = settings || await refreshSettings(scope);
        const id = slot.startsWith("shortcut:") ? slot.slice("shortcut:".length) : "";
        if (!id || !current) return;
        try {
          settings = await savePatch(scope, {
            shortcuts: current.shortcuts.filter((entry) => entry.id !== id),
            action_order: current.action_order.filter((entry) => entry !== slot),
          });
          reloadPage();
        } catch {}
      });
    });
    const sample = scope.querySelector("[data-shelf-try-sample]");
    if (sample && sample.dataset.shelfSettingsBound !== "1") {
      sample.dataset.shelfSettingsBound = "1";
      sample.addEventListener("click", async () => {
        sample.disabled = true;
        try {
          await fetch("/api/shelf/sample", {
            method: "POST",
            headers: { ...(globalThis.molisWorkControlHeaders?.() || {}), "content-type": "application/json" },
            body: "{}",
          });
          say(scope, "[data-shelf-shortcut-error]", "");
          sample.textContent = t("示例已放回材料");
        } finally {
          sample.disabled = false;
        }
      });
    }
    invoke("shelf_setup_status").then((status) => {
      if (!status) return;
      const line = (selector, text) => {
        const node = scope.querySelector(selector);
        if (node && text) node.textContent = text;
      };
      line('[data-shelf-permission="accessibility"]', status.accessibility
        ? t("辅助功能：已授权。")
        : t("辅助功能：还没授权。加入前台选中文件时系统会询问。"));
      if (status.clipboard_readable === false) {
        line('[data-shelf-permission="clipboard"]', t("剪贴板：这台 Mac 不让后台程序读剪贴板。打开 Shelf 面板按 ⌘V 仍可把当前剪贴板上架。"));
      }
      if (Array.isArray(status.browsers)) {
        line('[data-shelf-permission="browsers"]', status.browsers.length
          ? t("已装浏览器：") + status.browsers.join("、")
          : t("没找到 Safari、Chrome 或 Edge。"));
      }
    }).catch(() => {});
    refreshSettings(scope);
    scope.querySelectorAll("[data-shelf-drop-wheel]").forEach((input) => {
      if (input.dataset.shelfSettingsBound === "1") return;
      input.dataset.shelfSettingsBound = "1";
      input.addEventListener("change", async () => {
        const previous = !input.checked;
        input.disabled = true;
        try {
          const body = await savePatch(scope, { drop_wheel_enabled: input.checked });
          input.checked = body.drop_wheel_enabled === true;
        } catch {
          input.checked = previous;
        } finally {
          input.disabled = false;
        }
      });
    });
    scope.querySelectorAll("[data-shelf-hotkey-slot]").forEach((row) => {
      if (row.dataset.shelfSettingsBound === "1") return;
      row.dataset.shelfSettingsBound = "1";
      const record = row.querySelector("[data-shelf-hotkey-record]");
      const reset = row.querySelector("[data-shelf-hotkey-reset]");
      record?.addEventListener("click", () => {
        if (recording?.row === row) {
          stopRecording();
          return;
        }
        stopRecording();
        recording = { row, root: scope };
        row.classList.add("is-recording");
        record.setAttribute("aria-pressed", "true");
        record.textContent = t(${JSON.stringify(HOTKEY_RECORDING)});
        record.focus();
      });
      reset?.addEventListener("click", async () => {
        const slot = row.dataset.shelfHotkeySlot;
        if (!slot || !DEFAULTS[slot]) return;
        stopRecording();
        try {
          await savePatch(scope, { hotkeys: { [slot]: DEFAULTS[slot] } });
        } catch {}
      });
    });
    invoke("shelf_hotkey_status").then((status) => paintOccupied(scope, status)).catch(() => {});
  };

  if (!globalThis.__molisWorkShelfHotkeyRecorder) {
    globalThis.__molisWorkShelfHotkeyRecorder = true;
    window.addEventListener("keydown", (event) => {
      if (!recording || !recording.row.isConnected) {
        recording = null;
        return;
      }
      if (event.repeat) return;
      if (!recording.panel && event.code === "Escape" && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        stopRecording();
        return;
      }
      if (recording.panel) {
        if (MODIFIER_CODES.includes(event.code)) return;
        event.preventDefault();
        event.stopPropagation();
        const slot = recording.row.dataset.shelfPanelSlot;
        const root = recording.root;
        const chord = {
          code: event.code,
          meta: event.metaKey,
          ctrl: event.ctrlKey,
          alt: event.altKey,
          shift: event.shiftKey,
        };
        stopRecording();
        savePatch(root, { panel_keys: { [slot]: chord } })
          .then((body) => { settings = body; paintPanelKeys(root); })
          .catch(() => {});
        return;
      }
      const chord = chordFromEvent(event);
      if (!chord) return;
      event.preventDefault();
      event.stopPropagation();
      if (!chord.carbon_modifiers) return;
      const slot = recording.row.dataset.shelfHotkeySlot;
      const root = recording.root;
      stopRecording();
      savePatch(root, { hotkeys: { [slot]: chord } }).catch(() => {});
    }, true);
  }

  globalThis.molisWorkBindShelfSettings = bind;
  if (document.querySelector("[data-shelf-settings]")) bind(document);
})();`;
