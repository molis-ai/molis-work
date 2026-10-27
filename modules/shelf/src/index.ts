export { shelfErrors, isShelfFailure, type ShelfFailure } from "./errors.js";
export { markdownFromExtract, resultNameForExtract } from "./extract.js";
export {
  WEBSITE_MIME,
  captureWebsite,
  websiteFilename,
  websiteMarkdown,
} from "./website.js";
export type { ShelfWebsiteCapture } from "./website.js";
export {
  OCR_LOW_CONFIDENCE,
  OCR_MISSING,
  ocrLanguages,
  ocrMarkdown,
} from "./ocr.js";
export type { ShelfOcrLine } from "./ocr.js";
export {
  SHELF_RECIPES,
  SHELF_RECIPE_ORDER,
  SHELF_SHORTCUT_RECIPE,
  looksLikeDeliverable,
  finalizeShelfRecipeResult,
  recipeAvailability,
  resolvedChoiceId,
  shelfRecipeAccepts,
  shelfRecipeOutputName,
  shelfRecipeSpec,
  shelfRecipeTitle,
} from "./recipes.js";
export type { ShelfRecipeSpec } from "./recipes.js";
export {
  NO_AGENT_REASON,
  SHELF_ENGINES,
  detectShelfRuntime,
  emptyShelfRuntime,
  isolationFact,
  shelfRuntimeCatalog,
  missingJobReason,
} from "./runtimes.js";
export type { ShelfEngine, ShelfLocalToolsPort, ShelfRuntimeLookup } from "./runtimes.js";
export { SAMPLE_PDF_TEXT, createExtractablePdf } from "./pdf.js";
export {
  SHELF_JOB_TIMEOUT_MS,
  CLIPBOARD_LIMIT,
  ShelfStore,
  hashBytes,
  isEditableShelfItem,
  openShelfStore,
  initializeShelfFiles,
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
  defaultShelfHotKeys,
  hasHotKeyModifier,
  normalizeChord,
  normalizeHotKeys,
  parseChord,
  parseGlobalChord,
  parseHotkeysPatch,
} from "./hotkeys.js";
export type { HotKeyKeyboardEvent } from "./hotkeys.js";
export {
  RUNTIME_PATH_REQUIRED,
  RUNTIME_TITLE_REQUIRED,
  SETTINGS_EMPTY,
  SHORTCUT_NAME_REQUIRED,
  SHORTCUT_PREFIX,
  SHELF_PANEL_KEY_SLOTS,
  SHORTCUT_PROMPT_REQUIRED,
  defaultActionOrder,
  defaultPanelKey,
  defaultPanelKeys,
  panelKeyLabel,
  panelKeysEqual,
  defaultShelfDeviceSettings,
  mergeShelfSettings,
  normalizeShelfSettings,
  parseSettingsWriteBody,
  shortcutIdFromSlot,
  shortcutOutputName,
  shortcutSlotId,
} from "./settings.js";

export { isConcealedClipboard, isHttpUrl, clipFingerprint, clipTitleFor } from "./clipboard.js";
