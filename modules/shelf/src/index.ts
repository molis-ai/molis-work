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
export {
  SHELF_JOB_TIMEOUT_MS,
  agentEnvironment,
  collectRecipeOutput,
  hasDeliverable,
  runAgentProcess,
} from "./job-runner.js";
export {
  WEBSITE_MIME,
  captureWebsite,
  documentTitle,
  htmlToMarkdown,
  websiteFilename,
  websiteMarkdown,
} from "./website.js";
export type { ShelfWebsiteCapture } from "./website.js";
export {
  OCR_LOW_CONFIDENCE,
  OCR_MISSING,
  imageTextAvailable,
  ocrHelperPath,
  ocrLanguages,
  ocrMarkdown,
  recognizeImageText,
} from "./ocr.js";
export type { ShelfOcrLine } from "./ocr.js";
export {
  SHELF_RECIPES,
  SHELF_RECIPE_ORDER,
  SHELF_SHORTCUT_RECIPE,
  fileGuardrail,
  finalizeOutput,
  looksLikeDeliverable,
  recipeAvailability,
  recipePrompt,
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
  canRunJob,
  clearShelfRuntimeCache,
  detectShelfRuntime,
  emptyShelfRuntime,
  headlessArguments,
  installedShelfEngines,
  isolationFact,
  shelfRuntimeCatalog,
  missingJobReason,
  readCliHelp,
  shelfRuntimeCandidates,
  shelfSearchDirectories,
  supportsWorkspaceSandbox,
} from "./runtimes.js";
export type { ShelfAgentRunRequest, ShelfEngine, ShelfRuntimeProbe } from "./runtimes.js";
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
