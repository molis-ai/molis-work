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

  const bind = (root) => {
    const scope = root && root.querySelector ? root : document;
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
      if (event.code === "Escape" && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        stopRecording();
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
