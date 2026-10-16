export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-design-system",
  packagePath: "packages/design-system",
  kind: "foundation",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/ui",
  migrationGoals: ["goal-reorg-f2","goal-reorg-ap3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "design-system.theme.v1",
    "design-system.tokens.v1",
    "design-system.accessibility.v1",
  ],
} as const;

export { renderStateRing, type StateRingOptions } from "./state-ring.js";
export { STATE_RING_FAMILIES, STATE_RING_LABELS, stateRingFamily, type StateRingState, type StateRingFamily } from "./state-ring-states.js";
export { STATE_RING_CLIENT_SCRIPT } from "./state-ring-client.js";
export { STATE_RING_STYLES } from "./styles/state-ring.js";

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export {
  MOLIS_WORK_DENSITY_STORAGE_KEY,
  MOLIS_WORK_TERMINAL_THEME_STORAGE_KEY,
  MOLIS_WORK_THEME_STORAGE_KEY,
  THEME_BOOTSTRAP_SCRIPT,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
  VISUAL_FOUNDATION_STYLES,
  VISUAL_FOUNDATION_PAGE_STYLES,
  COSS_CONTROL_STYLES,
  PRIMITIVE_STYLES,
  ARRIVAL_COMPONENT_STYLES,
  INTERACTION_TEXTURE_STYLES,
  MICRO_INTERACTION_CLIENT_SCRIPT,
  MICRO_INTERACTION_STYLES,
  CRAFT_FINISH_STYLES,
  CRAFT_FINISH_CLIENT_SCRIPT,
  type MolisWorkDensity,
  type MolisWorkTerminalTheme,
  type MolisWorkTheme,
} from "./visual-foundation.js";

export { SELECT_MENU_CLIENT_SCRIPT, SELECT_MENU_STYLES } from "./select-menu-client.js";
export { renderFilePreviewHtml, FILE_PREVIEW_STYLES, FILE_PREVIEW_CLIENT_SCRIPT, type FilePreviewContent } from "./file-preview.js";
export { ARRIVAL_MOTION_CLIENT_SCRIPT } from "./arrival-motion-client.js";
export {
  TYPEFACE_STYLES,
  INTER_VARIABLE_ASSET_PATH,
  NOTO_SANS_SC_ASSET_PATH,
  FONT_STACK,
  MONO_FONT_STACK,
  interVariableFontFilePath,
  notoSansScFontFilePath,
} from "./typeface.js";

export { projectMonogram, renderProjectMonogram, type ProjectMonogramHue } from "./monogram.js";
export { icon, renderIconSprite, ICON_LIBRARY, PLUGIN_ICON, STATUS_ICON, listedIconNames, registeredIconNames, type MolisWorkIcon } from "./icons.js";
export {
  MW_CONTENT_MARKS,
  MW_CONTENT_SURFACES,
  MW_CONTENT_THEME,
  MW_HUES,
  MW_PLUGINS,
  MW_SURFACES,
  renderControlMetrics,
  renderPaletteTokens,
  renderShapeTokens,
  renderShellTokens,
  type MwContentMarkId,
  type MwHueId,
} from "./palette.js";
export * from "./primitives/index.js";
export { renderPluginStageShell } from "./plugin-stage-shell.js";
export * from './plugin-components.js';
export * from './plugin-component-client.js';
export * from './plugin-presentation.js';
export { renderPluginPresentationExample } from './plugin-presentation-example.js';
export * from './interaction.js';
export * from './interaction-client.js';
export { INTERACTION_DATE_STYLES, INTERACTION_NUMBER_STYLES, INTERACTION_OPERATION_STYLES, INTERACTION_QUESTION_STYLES, INTERACTION_REFERENCE_STYLES, INTERACTION_STEP_STYLES, INTERACTION_STYLES, INTERACTION_TRACE_STYLES } from './styles/interaction.js';
export { compactScript } from './compact-script.js';
export { CONTEXT_TOOLBAR_CLIENT_SCRIPT, CONTEXT_TOOLBAR_STYLES } from './context-toolbar.js';
export { sanitizeContextTools } from './context-tools.js';
