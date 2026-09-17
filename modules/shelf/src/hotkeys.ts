import type {
  ShelfDeviceSettings,
  ShelfHotKeyChord,
  ShelfHotKeys,
  ShelfHotKeySlot,
  ShelfSettingsPatch,
} from "@molis-ai/molis-work-contracts/modules/shelf";

export const CARBON_CMD_KEY = 1 << 8;
export const CARBON_SHIFT_KEY = 1 << 9;
export const CARBON_OPTION_KEY = 1 << 11;
export const CARBON_CONTROL_KEY = 1 << 12;

export const HOTKEY_MODIFIER_REQUIRED = "全局快捷键必须带 ⌃ ⌥ ⇧ 或 ⌘。";
export const HOTKEY_OCCUPIED = "这个组合被占用。";
export const HOTKEY_RECORDING = "按下…";
export const HOTKEY_RESET = "默认";
export const HOTKEY_GUIDE = "点右边的键再按下新组合。全局快捷键必须带 ⌃ ⌥ ⇧ 或 ⌘。";
export const HOTKEY_SETTINGS_EMPTY = "请提供要保存的设置";
export const HOTKEY_INVALID = "快捷键无效";

export const SHELF_HOTKEY_SLOTS = ["toggle", "capture", "files"] as const satisfies readonly ShelfHotKeySlot[];

export const MODIFIER_EVENT_CODES = [
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
  "CapsLock",
  "Fn",
] as const;

const KEY_TABLE = [
  { code: "KeyA", carbon: 0x00, name: "A" },
  { code: "KeyS", carbon: 0x01, name: "S" },
  { code: "KeyD", carbon: 0x02, name: "D" },
  { code: "KeyF", carbon: 0x03, name: "F" },
  { code: "KeyH", carbon: 0x04, name: "H" },
  { code: "KeyG", carbon: 0x05, name: "G" },
  { code: "KeyZ", carbon: 0x06, name: "Z" },
  { code: "KeyX", carbon: 0x07, name: "X" },
  { code: "KeyC", carbon: 0x08, name: "C" },
  { code: "KeyV", carbon: 0x09, name: "V" },
  { code: "KeyB", carbon: 0x0b, name: "B" },
  { code: "KeyQ", carbon: 0x0c, name: "Q" },
  { code: "KeyW", carbon: 0x0d, name: "W" },
  { code: "KeyE", carbon: 0x0e, name: "E" },
  { code: "KeyR", carbon: 0x0f, name: "R" },
  { code: "KeyY", carbon: 0x10, name: "Y" },
  { code: "KeyT", carbon: 0x11, name: "T" },
  { code: "Digit1", carbon: 0x12, name: "1" },
  { code: "Digit2", carbon: 0x13, name: "2" },
  { code: "Digit3", carbon: 0x14, name: "3" },
  { code: "Digit4", carbon: 0x15, name: "4" },
  { code: "Digit6", carbon: 0x16, name: "6" },
  { code: "Digit5", carbon: 0x17, name: "5" },
  { code: "Equal", carbon: 0x18, name: "=" },
  { code: "Digit9", carbon: 0x19, name: "9" },
  { code: "Digit7", carbon: 0x1a, name: "7" },
  { code: "Minus", carbon: 0x1b, name: "-" },
  { code: "Digit8", carbon: 0x1c, name: "8" },
  { code: "Digit0", carbon: 0x1d, name: "0" },
  { code: "BracketRight", carbon: 0x1e, name: "]" },
  { code: "KeyO", carbon: 0x1f, name: "O" },
  { code: "KeyU", carbon: 0x20, name: "U" },
  { code: "BracketLeft", carbon: 0x21, name: "[" },
  { code: "KeyI", carbon: 0x22, name: "I" },
  { code: "KeyP", carbon: 0x23, name: "P" },
  { code: "Enter", carbon: 0x24, name: "↩" },
  { code: "KeyL", carbon: 0x25, name: "L" },
  { code: "KeyJ", carbon: 0x26, name: "J" },
  { code: "Quote", carbon: 0x27, name: "'" },
  { code: "KeyK", carbon: 0x28, name: "K" },
  { code: "Semicolon", carbon: 0x29, name: ";" },
  { code: "Backslash", carbon: 0x2a, name: "\\" },
  { code: "Comma", carbon: 0x2b, name: "," },
  { code: "Slash", carbon: 0x2c, name: "/" },
  { code: "KeyN", carbon: 0x2d, name: "N" },
  { code: "KeyM", carbon: 0x2e, name: "M" },
  { code: "Period", carbon: 0x2f, name: "." },
  { code: "Tab", carbon: 0x30, name: "⇥" },
  { code: "Space", carbon: 0x31, name: "Space" },
  { code: "Backquote", carbon: 0x32, name: "`" },
  { code: "Backspace", carbon: 0x33, name: "⌫" },
  { code: "Escape", carbon: 0x35, name: "Esc" },
  { code: "NumpadEnter", carbon: 0x4c, name: "↩" },
  { code: "Delete", carbon: 0x75, name: "⌦" },
  { code: "ArrowLeft", carbon: 0x7b, name: "←" },
  { code: "ArrowRight", carbon: 0x7c, name: "→" },
  { code: "ArrowDown", carbon: 0x7d, name: "↓" },
  { code: "ArrowUp", carbon: 0x7e, name: "↑" },
] as const;

export const KEYBOARD_CODE_TO_CARBON: Record<string, number> = Object.fromEntries(
  KEY_TABLE.map((entry) => [entry.code, entry.carbon]),
);

export const CARBON_KEY_NAME: Record<number, string> = Object.fromEntries(
  KEY_TABLE.map((entry) => [entry.carbon, entry.name]),
);

const DEFAULT_TOGGLE: ShelfHotKeyChord = {
  key_code: KEYBOARD_CODE_TO_CARBON.KeyD,
  carbon_modifiers: CARBON_CONTROL_KEY | CARBON_OPTION_KEY,
};
const DEFAULT_CAPTURE: ShelfHotKeyChord = {
  key_code: KEYBOARD_CODE_TO_CARBON.KeyW,
  carbon_modifiers: CARBON_CONTROL_KEY | CARBON_OPTION_KEY,
};
const DEFAULT_FILES: ShelfHotKeyChord = {
  key_code: KEYBOARD_CODE_TO_CARBON.KeyA,
  carbon_modifiers: CARBON_CONTROL_KEY | CARBON_OPTION_KEY,
};

export function defaultHotKey(slot: ShelfHotKeySlot): ShelfHotKeyChord {
  if (slot === "toggle") return DEFAULT_TOGGLE;
  if (slot === "capture") return DEFAULT_CAPTURE;
  return DEFAULT_FILES;
}

export function defaultShelfHotKeys(): ShelfHotKeys {
  return {
    toggle: DEFAULT_TOGGLE,
    capture: DEFAULT_CAPTURE,
    files: DEFAULT_FILES,
  };
}

export function defaultShelfDeviceSettings(): ShelfDeviceSettings {
  return {
    drop_wheel_enabled: true,
    hotkeys: defaultShelfHotKeys(),
  };
}

export function hasHotKeyModifier(chord: ShelfHotKeyChord): boolean {
  return chord.carbon_modifiers !== 0;
}

export function chordsEqual(left: ShelfHotKeyChord, right: ShelfHotKeyChord): boolean {
  return left.key_code === right.key_code && left.carbon_modifiers === right.carbon_modifiers;
}

export function chordLabel(chord: ShelfHotKeyChord): string {
  let parts = "";
  if (chord.carbon_modifiers & CARBON_CONTROL_KEY) parts += "⌃";
  if (chord.carbon_modifiers & CARBON_OPTION_KEY) parts += "⌥";
  if (chord.carbon_modifiers & CARBON_SHIFT_KEY) parts += "⇧";
  if (chord.carbon_modifiers & CARBON_CMD_KEY) parts += "⌘";
  parts += CARBON_KEY_NAME[chord.key_code] ?? `Key${chord.key_code}`;
  return parts;
}

export function parseChord(raw: unknown): ShelfHotKeyChord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (!Number.isInteger(record.key_code) || !Number.isInteger(record.carbon_modifiers)) return null;
  const key_code = record.key_code as number;
  const carbon_modifiers = record.carbon_modifiers as number;
  if (key_code < 0 || key_code > 255 || carbon_modifiers < 0 || carbon_modifiers > 0xffff) return null;
  return { key_code, carbon_modifiers };
}

export function parseGlobalChord(raw: unknown): { ok: ShelfHotKeyChord } | { error: string } {
  const chord = parseChord(raw);
  if (!chord) return { error: HOTKEY_INVALID };
  if (!hasHotKeyModifier(chord)) return { error: HOTKEY_MODIFIER_REQUIRED };
  return { ok: chord };
}

export function normalizeChord(raw: unknown, fallback: ShelfHotKeyChord): ShelfHotKeyChord {
  const parsed = parseGlobalChord(raw);
  return "ok" in parsed ? parsed.ok : fallback;
}

export function normalizeHotKeys(raw: unknown): ShelfHotKeys {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return {
    toggle: normalizeChord(record.toggle, DEFAULT_TOGGLE),
    capture: normalizeChord(record.capture, DEFAULT_CAPTURE),
    files: normalizeChord(record.files, DEFAULT_FILES),
  };
}

export function normalizeShelfSettings(raw: unknown): ShelfDeviceSettings {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return {
    drop_wheel_enabled: record.drop_wheel_enabled !== false,
    hotkeys: normalizeHotKeys(record.hotkeys),
  };
}

export function mergeShelfSettings(current: ShelfDeviceSettings, patch: ShelfSettingsPatch): ShelfDeviceSettings {
  return {
    drop_wheel_enabled: patch.drop_wheel_enabled ?? current.drop_wheel_enabled,
    hotkeys: {
      toggle: patch.hotkeys?.toggle ?? current.hotkeys.toggle,
      capture: patch.hotkeys?.capture ?? current.hotkeys.capture,
      files: patch.hotkeys?.files ?? current.hotkeys.files,
    },
  };
}

export function parseHotkeysPatch(raw: unknown): { ok: Partial<ShelfHotKeys> } | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "hotkeys 无效" };
  }
  const record = raw as Record<string, unknown>;
  const patch: {
    toggle?: ShelfHotKeyChord;
    capture?: ShelfHotKeyChord;
    files?: ShelfHotKeyChord;
  } = {};
  for (const slot of SHELF_HOTKEY_SLOTS) {
    if (!(slot in record)) continue;
    const parsed = parseGlobalChord(record[slot]);
    if ("error" in parsed) return parsed;
    patch[slot] = parsed.ok;
  }
  return { ok: patch };
}

export function parseSettingsWriteBody(body: unknown): { ok: ShelfSettingsPatch } | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: HOTKEY_SETTINGS_EMPTY };
  }
  const record = body as Record<string, unknown>;
  let drop_wheel_enabled: boolean | undefined;
  let hotkeys: Partial<ShelfHotKeys> | undefined;
  if ("drop_wheel_enabled" in record) {
    if (typeof record.drop_wheel_enabled !== "boolean") {
      return { error: "drop_wheel_enabled 必须是布尔值" };
    }
    drop_wheel_enabled = record.drop_wheel_enabled;
  }
  if ("hotkeys" in record) {
    const parsed = parseHotkeysPatch(record.hotkeys);
    if ("error" in parsed) return parsed;
    hotkeys = parsed.ok;
  }
  if (drop_wheel_enabled === undefined && hotkeys === undefined) {
    return { error: HOTKEY_SETTINGS_EMPTY };
  }
  return { ok: { drop_wheel_enabled, hotkeys } };
}

export interface HotKeyKeyboardEvent {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
}

export function chordFromKeyboardEvent(event: HotKeyKeyboardEvent): ShelfHotKeyChord | null {
  if ((MODIFIER_EVENT_CODES as readonly string[]).includes(event.code)) return null;
  const key_code = KEYBOARD_CODE_TO_CARBON[event.code];
  if (key_code == null) return null;
  let carbon_modifiers = 0;
  if (event.ctrlKey) carbon_modifiers |= CARBON_CONTROL_KEY;
  if (event.altKey) carbon_modifiers |= CARBON_OPTION_KEY;
  if (event.shiftKey) carbon_modifiers |= CARBON_SHIFT_KEY;
  if (event.metaKey) carbon_modifiers |= CARBON_CMD_KEY;
  return { key_code, carbon_modifiers };
}
