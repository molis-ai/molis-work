export {
  GOALBOARD_DENSITY_STORAGE_KEY,
  GOALBOARD_TERMINAL_THEME_STORAGE_KEY,
  GOALBOARD_THEME_STORAGE_KEY,
  THEME_BOOTSTRAP_SCRIPT,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
  type GoalBoardDensity,
  type GoalBoardTerminalTheme,
  type GoalBoardTheme,
} from "./preferences.js";

import { CALM_DESKTOP_STYLES } from "./styles/calm-desktop.js";
import { DESKTOP_TITLEBAR_STYLES } from "./styles/desktop-titlebar.js";
import { DIRECTORY_LEDGER_STYLES } from "./styles/directory-ledger.js";
import { FOUNDATION_STYLES } from "./styles/foundation.js";
import { MOMENTUM_STYLES } from "./styles/momentum.js";
import { MOTION_POLISH_STYLES } from "./styles/motion-polish.js";
import { NAVIGATION_OWNERSHIP_STYLES } from "./styles/navigation-ownership.js";
import { PERSONAL_SHELL_STYLES } from "./styles/personal-shell.js";
import { PERSONAL_WORKBENCH_V2_STYLES } from "./styles/personal-workbench-v2.js";
import { PERSONAL_WORKBENCH_V3_STYLES } from "./styles/personal-workbench-v3.js";
import { QUIET_PAPER_STYLES } from "./styles/quiet-paper.js";
import { SOURCE_FEED_STYLES } from "./styles/source-feed.js";

/** Stable concatenation order preserves the existing cascade and rendered CSS. */
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
  MOTION_POLISH_STYLES,
].join("");
