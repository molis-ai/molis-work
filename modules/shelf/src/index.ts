export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-shelf",
  packagePath: "modules/shelf",
  kind: "module",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/modules/shelf",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["shelf.store.v1", "shelf.jobs.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { ShelfError, isShelfError } from "./errors.js";
export { extractLocalText, markdownFromExtract, resultNameForExtract } from "./extract.js";
export { SAMPLE_PDF_TEXT, createExtractablePdf, extractPdfSelectableText } from "./pdf.js";
export {
  CLIPBOARD_LIMIT,
  ShelfStore,
  clipFingerprint,
  clipTitleFor,
  hashBytes,
  isConcealedClipboard,
  isHttpUrl,
  isEditableShelfItem,
  openShelfStore,
} from "./store.js";
export {
  CARBON_CMD_KEY,
  CARBON_CONTROL_KEY,
  CARBON_KEY_NAME,
  CARBON_OPTION_KEY,
  CARBON_SHIFT_KEY,
  HOTKEY_GUIDE,
  HOTKEY_INVALID,
  HOTKEY_MODIFIER_REQUIRED,
  HOTKEY_OCCUPIED,
  HOTKEY_RECORDING,
  HOTKEY_RESET,
  HOTKEY_SETTINGS_EMPTY,
  KEYBOARD_CODE_TO_CARBON,
  MODIFIER_EVENT_CODES,
  SHELF_HOTKEY_SLOTS,
  chordFromKeyboardEvent,
  chordLabel,
  chordsEqual,
  defaultHotKey,
  defaultShelfDeviceSettings,
  defaultShelfHotKeys,
  hasHotKeyModifier,
  mergeShelfSettings,
  normalizeChord,
  normalizeHotKeys,
  normalizeShelfSettings,
  parseChord,
  parseGlobalChord,
  parseHotkeysPatch,
  parseSettingsWriteBody,
} from "./hotkeys.js";
export type { HotKeyKeyboardEvent } from "./hotkeys.js";
