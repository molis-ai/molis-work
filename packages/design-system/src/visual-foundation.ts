export {
  MOLIS_WORK_DENSITY_STORAGE_KEY,
  MOLIS_WORK_TERMINAL_THEME_STORAGE_KEY,
  MOLIS_WORK_THEME_STORAGE_KEY,
  THEME_BOOTSTRAP_SCRIPT,
  type MolisWorkDensity,
  type MolisWorkTerminalTheme,
  type MolisWorkTheme,
} from "./preferences.js";

import { VISUAL_FOUNDATION_CLIENT_SCRIPT as PREFERENCE_CLIENT_SCRIPT } from "./preferences.js";
import { SELECT_MENU_CLIENT_SCRIPT } from "./select-menu-client.js";
import { MICRO_INTERACTION_CLIENT_SCRIPT } from "./styles/micro-interactions.js";
import { CRAFT_FINISH_CLIENT_SCRIPT } from "./styles/craft-finish.js";
import { CALM_DESKTOP_STYLES } from "./styles/calm-desktop.js";
import { DESKTOP_TITLEBAR_STYLES } from "./styles/desktop-titlebar.js";
import { DIRECTORY_LEDGER_STYLES } from "./styles/directory-ledger.js";
import { FOUNDATION_STYLES } from "./styles/foundation.js";
import { MOMENTUM_STYLES } from "./styles/momentum.js";
import { NAVIGATION_OWNERSHIP_STYLES } from "./styles/navigation-ownership.js";
import { PERSONAL_SHELL_STYLES } from "./styles/personal-shell.js";
import { PERSONAL_WORKBENCH_V2_STYLES } from "./styles/personal-workbench-v2.js";
import { PERSONAL_WORKBENCH_V3_STYLES } from "./styles/personal-workbench-v3.js";
import { QUIET_PAPER_STYLES } from "./styles/quiet-paper.js";
import { SOURCE_FEED_STYLES } from "./styles/source-feed.js";
import { COSS_CONTROL_STYLES } from "./styles/coss-controls.js";
import { PRIMITIVE_STYLES } from "./styles/primitives.js";

/** Stable concatenation order preserves the existing cascade.
 * Coss + Primitive sit at the end of this bundle so Catalog/tests that only
 * consume VISUAL_FOUNDATION_STYLES still see mw-* rules. Workbench page sheets
 * concatenate them again after product CSS so the same overlay wins there too. */
export const VISUAL_FOUNDATION_STYLES = [
  "\n",
  FOUNDATION_STYLES,
  MOMENTUM_STYLES,
  QUIET_PAPER_STYLES,
  CALM_DESKTOP_STYLES,
  PERSONAL_SHELL_STYLES,
  PERSONAL_WORKBENCH_V2_STYLES,
  PERSONAL_WORKBENCH_V3_STYLES,
  DIRECTORY_LEDGER_STYLES,
  NAVIGATION_OWNERSHIP_STYLES,
  SOURCE_FEED_STYLES,
  DESKTOP_TITLEBAR_STYLES,
  COSS_CONTROL_STYLES,
  PRIMITIVE_STYLES,
].join("");

/** Theme preferences plus the measured micro-interactions; every page renderer inlines this. */
export const VISUAL_FOUNDATION_CLIENT_SCRIPT = `${PREFERENCE_CLIENT_SCRIPT}${MICRO_INTERACTION_CLIENT_SCRIPT}${SELECT_MENU_CLIENT_SCRIPT}${CRAFT_FINISH_CLIENT_SCRIPT}`;

export { COSS_CONTROL_STYLES } from "./styles/coss-controls.js";
export { PRIMITIVE_STYLES } from "./styles/primitives.js";
export { INTERACTION_TEXTURE_STYLES } from "./styles/interaction-texture.js";
export { MICRO_INTERACTION_STYLES, MICRO_INTERACTION_CLIENT_SCRIPT } from "./styles/micro-interactions.js";
export { CRAFT_FINISH_STYLES, CRAFT_FINISH_CLIENT_SCRIPT } from "./styles/craft-finish.js";
