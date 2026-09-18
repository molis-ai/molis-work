import type {
  ShelfCustomRuntime,
  ShelfDeviceSettings,
  ShelfHotKeys,
  ShelfItemKind,
  ShelfPanelKeyChord,
  ShelfPanelKeys,
  ShelfPanelKeySlot,
  ShelfSettingsPatch,
  ShelfShortcutAction,
} from "@molis-ai/molis-work-contracts/modules/shelf";
import { defaultShelfHotKeys, normalizeHotKeys, parseHotkeysPatch } from "./hotkeys.js";
import { SHELF_RECIPE_ORDER } from "./recipes.js";
import { SHELF_ENGINES } from "./runtimes.js";

export const SETTINGS_EMPTY = "请提供要保存的设置";
export const SHORTCUT_PREFIX = "shortcut:";
export const SHORTCUT_NAME_REQUIRED = "给这个动作起个名字";
export const SHORTCUT_PROMPT_REQUIRED = "写一句话说明要做什么";
export const RUNTIME_TITLE_REQUIRED = "给这个 Runtime 起个名字";
export const RUNTIME_PATH_REQUIRED = "填可执行文件的完整路径";

export const SHELF_PANEL_KEY_SLOTS = ["hide", "paste", "copy", "delete"] as const satisfies readonly ShelfPanelKeySlot[];

/** DropAgent's in-panel keys: Esc hides, ⌘V shelves, ⌘C copies, ⌫ removes. */
const PANEL_KEY_DEFAULTS: ShelfPanelKeys = {
  hide: { code: "Escape", meta: false, ctrl: false, alt: false, shift: false },
  paste: { code: "KeyV", meta: true, ctrl: false, alt: false, shift: false },
  copy: { code: "KeyC", meta: true, ctrl: false, alt: false, shift: false },
  delete: { code: "Backspace", meta: false, ctrl: false, alt: false, shift: false },
};

export function defaultPanelKeys(): ShelfPanelKeys {
  return { ...PANEL_KEY_DEFAULTS };
}

export function defaultPanelKey(slot: ShelfPanelKeySlot): ShelfPanelKeyChord {
  return PANEL_KEY_DEFAULTS[slot];
}

export function panelKeyLabel(chord: ShelfPanelKeyChord): string {
  let label = "";
  if (chord.ctrl) label += "⌃";
  if (chord.alt) label += "⌥";
  if (chord.shift) label += "⇧";
  if (chord.meta) label += "⌘";
  return label + panelKeyName(chord.code);
}

export function panelKeysEqual(left: ShelfPanelKeyChord, right: ShelfPanelKeyChord): boolean {
  return left.code === right.code
    && left.meta === right.meta
    && left.ctrl === right.ctrl
    && left.alt === right.alt
    && left.shift === right.shift;
}

function panelKeyName(code: string): string {
  if (code === "Escape") return "Esc";
  if (code === "Backspace") return "⌫";
  if (code === "Delete") return "⌦";
  if (code === "Space") return "Space";
  if (code === "Enter") return "↩";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

function parsePanelKey(raw: unknown): ShelfPanelKeyChord | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const code = String(record.code ?? "").trim();
  if (!code || code.length > 24) return null;
  return {
    code,
    meta: record.meta === true,
    ctrl: record.ctrl === true,
    alt: record.alt === true,
    shift: record.shift === true,
  };
}

function normalizePanelKeys(raw: unknown): ShelfPanelKeys {
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const keys = { ...PANEL_KEY_DEFAULTS } as Record<ShelfPanelKeySlot, ShelfPanelKeyChord>;
  for (const slot of SHELF_PANEL_KEY_SLOTS) {
    const parsed = parsePanelKey(record[slot]);
    if (parsed) keys[slot] = parsed;
  }
  return keys;
}

function parsePanelKeysPatch(raw: unknown): { ok: Partial<ShelfPanelKeys> } | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "panel_keys 无效" };
  const record = raw as Record<string, unknown>;
  const patch: Record<string, ShelfPanelKeyChord> = {};
  for (const slot of SHELF_PANEL_KEY_SLOTS) {
    if (!(slot in record)) continue;
    const parsed = parsePanelKey(record[slot]);
    if (!parsed) return { error: "这个键不能用" };
    patch[slot] = parsed;
  }
  return { ok: patch as Partial<ShelfPanelKeys> };
}

const ITEM_KINDS: readonly ShelfItemKind[] = [
  "pdf", "image", "text", "markdown", "url", "website", "file", "folder",
];

/** Default action bar: the recipes, in DropAgent's order. */
export function defaultActionOrder(): string[] {
  return [...SHELF_RECIPE_ORDER].filter((recipe) => recipe !== "shortcut");
}

export function defaultShelfDeviceSettings(): ShelfDeviceSettings {
  return {
    drop_wheel_enabled: true,
    hotkeys: defaultShelfHotKeys(),
    panel_keys: defaultPanelKeys(),
    engine: "auto",
    custom_runtimes: [],
    shortcuts: [],
    action_order: defaultActionOrder(),
    hidden_actions: [],
  };
}

export function normalizeShelfSettings(raw: unknown): ShelfDeviceSettings {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const shortcuts = normalizeShortcuts(record.shortcuts);
  return {
    drop_wheel_enabled: record.drop_wheel_enabled !== false,
    hotkeys: normalizeHotKeys(record.hotkeys),
    panel_keys: normalizePanelKeys(record.panel_keys),
    engine: normalizeEngine(record.engine),
    custom_runtimes: normalizeRuntimes(record.custom_runtimes),
    shortcuts,
    action_order: normalizeOrder(record.action_order, shortcuts),
    hidden_actions: normalizeStrings(record.hidden_actions),
  };
}

export function mergeShelfSettings(current: ShelfDeviceSettings, patch: ShelfSettingsPatch): ShelfDeviceSettings {
  const shortcuts = patch.shortcuts ?? current.shortcuts;
  return {
    drop_wheel_enabled: patch.drop_wheel_enabled ?? current.drop_wheel_enabled,
    hotkeys: {
      toggle: patch.hotkeys?.toggle ?? current.hotkeys.toggle,
      capture: patch.hotkeys?.capture ?? current.hotkeys.capture,
      files: patch.hotkeys?.files ?? current.hotkeys.files,
    },
    panel_keys: { ...current.panel_keys, ...patch.panel_keys },
    engine: patch.engine ?? current.engine,
    custom_runtimes: patch.custom_runtimes ?? current.custom_runtimes,
    shortcuts,
    action_order: patch.action_order ?? current.action_order,
    hidden_actions: patch.hidden_actions ?? current.hidden_actions,
  };
}

export function parseSettingsWriteBody(body: unknown): { ok: ShelfSettingsPatch } | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: SETTINGS_EMPTY };
  }
  const record = body as Record<string, unknown>;
  const patch: {
    drop_wheel_enabled?: boolean;
    hotkeys?: Partial<ShelfHotKeys>;
    panel_keys?: Partial<ShelfPanelKeys>;
    engine?: string;
    custom_runtimes?: readonly ShelfCustomRuntime[];
    shortcuts?: readonly ShelfShortcutAction[];
    action_order?: readonly string[];
    hidden_actions?: readonly string[];
  } = {};
  if ("drop_wheel_enabled" in record) {
    if (typeof record.drop_wheel_enabled !== "boolean") {
      return { error: "drop_wheel_enabled 必须是布尔值" };
    }
    patch.drop_wheel_enabled = record.drop_wheel_enabled;
  }
  if ("hotkeys" in record) {
    const parsed = parseHotkeysPatch(record.hotkeys);
    if ("error" in parsed) return parsed;
    patch.hotkeys = parsed.ok;
  }
  if ("panel_keys" in record) {
    const parsed = parsePanelKeysPatch(record.panel_keys);
    if ("error" in parsed) return parsed;
    patch.panel_keys = parsed.ok;
  }
  if ("engine" in record) {
    if (typeof record.engine !== "string" || !isKnownEngine(record.engine)) {
      return { error: "这个 Runtime 不在名单里" };
    }
    patch.engine = record.engine;
  }
  if ("custom_runtimes" in record) {
    const parsed = parseRuntimes(record.custom_runtimes);
    if ("error" in parsed) return parsed;
    patch.custom_runtimes = parsed.ok;
  }
  if ("shortcuts" in record) {
    const parsed = parseShortcuts(record.shortcuts);
    if ("error" in parsed) return parsed;
    patch.shortcuts = parsed.ok;
  }
  if ("action_order" in record) {
    if (!Array.isArray(record.action_order)) return { error: "action_order 无效" };
    patch.action_order = normalizeStrings(record.action_order);
  }
  if ("hidden_actions" in record) {
    if (!Array.isArray(record.hidden_actions)) return { error: "hidden_actions 无效" };
    patch.hidden_actions = normalizeStrings(record.hidden_actions);
  }
  if (!Object.keys(patch).length) return { error: SETTINGS_EMPTY };
  return { ok: patch };
}

export function shortcutSlotId(id: string): string {
  return `${SHORTCUT_PREFIX}${id}`;
}

export function shortcutIdFromSlot(slot: string): string | null {
  if (!slot.startsWith(SHORTCUT_PREFIX)) return null;
  const id = slot.slice(SHORTCUT_PREFIX.length);
  return id || null;
}

/** `报价.pdf` + 「摘要」 → `报价-摘要.md`, DropAgent's shortcut output name. */
export function shortcutOutputName(sourceName: string, actionName: string): string {
  const base = sourceName.replace(/\.[^.]+$/u, "") || "output";
  const action = actionName.replace(/[\\/:*?"<>|]/gu, "").trim() || "动作";
  return `${base}-${action}.md`;
}

function isKnownEngine(value: string): boolean {
  if (value === "auto") return true;
  if (value.startsWith("custom:")) return value.length > "custom:".length;
  return SHELF_ENGINES.some((engine) => engine.key === value);
}

function normalizeEngine(raw: unknown): string {
  return typeof raw === "string" && isKnownEngine(raw) ? raw : "auto";
}

function normalizeStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const value = String(entry ?? "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function normalizeOrder(raw: unknown, shortcuts: readonly ShelfShortcutAction[]): string[] {
  const wanted = [...defaultActionOrder(), ...shortcuts.map((action) => shortcutSlotId(action.id))];
  const listed = normalizeStrings(raw).filter((slot) => wanted.includes(slot));
  for (const slot of wanted) {
    if (!listed.includes(slot)) listed.push(slot);
  }
  return listed;
}

function normalizeRuntimes(raw: unknown): ShelfCustomRuntime[] {
  const parsed = parseRuntimes(raw);
  return "ok" in parsed ? [...parsed.ok] : [];
}

function parseRuntimes(raw: unknown): { ok: ShelfCustomRuntime[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "custom_runtimes 无效" };
  const out: ShelfCustomRuntime[] = [];
  for (const entry of raw.slice(0, 20)) {
    if (!entry || typeof entry !== "object") return { error: "custom_runtimes 无效" };
    const record = entry as Record<string, unknown>;
    const title = String(record.title ?? "").trim();
    const executable = String(record.executable ?? "").trim();
    if (!title) return { error: RUNTIME_TITLE_REQUIRED };
    if (!executable.startsWith("/")) return { error: RUNTIME_PATH_REQUIRED };
    out.push({
      id: String(record.id ?? "").trim() || newId("runtime"),
      title: title.slice(0, 60),
      executable,
      kind: record.kind === "cli" ? "cli" : "tui",
    });
  }
  return { ok: out };
}

function normalizeShortcuts(raw: unknown): ShelfShortcutAction[] {
  const parsed = parseShortcuts(raw);
  return "ok" in parsed ? [...parsed.ok] : [];
}

function parseShortcuts(raw: unknown): { ok: ShelfShortcutAction[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "shortcuts 无效" };
  const out: ShelfShortcutAction[] = [];
  for (const entry of raw.slice(0, 30)) {
    if (!entry || typeof entry !== "object") return { error: "shortcuts 无效" };
    const record = entry as Record<string, unknown>;
    const name = String(record.name ?? "").trim();
    const prompt = String(record.prompt ?? "").trim();
    if (!name) return { error: SHORTCUT_NAME_REQUIRED };
    if (!prompt) return { error: SHORTCUT_PROMPT_REQUIRED };
    const kinds = Array.isArray(record.kinds)
      ? record.kinds.map(String).filter((kind): kind is ShelfItemKind => (ITEM_KINDS as readonly string[]).includes(kind))
      : [];
    out.push({
      id: String(record.id ?? "").trim() || newId("shortcut"),
      name: name.slice(0, 40),
      kinds: kinds.length ? kinds : ["pdf", "markdown", "text", "website"],
      prompt: prompt.slice(0, 2_000),
    });
  }
  return { ok: out };
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
