import { MODEL_SETTINGS_CLIENT_SCRIPT } from "./scripts/settings-models.js";
import { AGENT_REVIEW_STYLES } from "./agent-review-surface.js";
import { MODEL_SETTINGS_STYLES } from "./styles/settings-models.js";
import { CODING_STYLES } from "@molis-ai/molis-work-plugin-coding";
import { FILES_STYLES } from "@molis-ai/molis-work-plugin-files";
import { SHELF_STYLES } from "@molis-ai/molis-work-plugin-shelf";
import { FUNCTIONS_STYLES } from "@molis-ai/molis-work-plugin-functions";
import { FORM_STYLES } from "@molis-ai/molis-work-plugin-form";
import { PAGES_STYLES } from "@molis-ai/molis-work-plugin-pages";
import { DATASET_STYLES } from "@molis-ai/molis-work-plugin-dataset";
import { PPT_STYLES } from "@molis-ai/molis-work-plugin-ppt";
import { LINGGUANG_STYLES } from "@molis-ai/molis-work-plugin-lingguang";
import { SCHEDULE_STYLES } from "@molis-ai/molis-work-plugin-schedule";
import { TRASH_GOAL_STYLES, PLANNING_SETTINGS_STYLES, PLANNING_ADOPTION_CLIENT_SCRIPT, PLANNING_SETTINGS_CLIENT_SCRIPT } from "@molis-ai/molis-work-plugin-goals";
import { PROJECT_OPERATIONS_STYLES, PROJECT_OPERATIONS_CLIENT_SCRIPT } from "@molis-ai/molis-work-plugin-work";
import {
  COSS_CONTROL_STYLES,
  INTERACTION_TEXTURE_STYLES,
  MICRO_INTERACTION_STYLES,
  ONBOARDING_STYLES,
  PRIMITIVE_STYLES,
  TYPEFACE_STYLES,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
  VISUAL_FOUNDATION_STYLES,
} from "@molis-ai/molis-work-design-system";
import { ARTIFACT_EMBED_STYLES, ARTIFACT_WORKBENCH_STYLES } from "./artifact-ui.js";
import {
  CLIENT_SCRIPT,
  CONTROL_CLIENT_SCRIPT,
  MORE_STYLES,
  PROJECT_GUIDANCE_CLIENT_SCRIPT,
  PROJECT_GUIDANCE_SETTINGS_STYLES,
  PROJECT_INDEX_STYLES,
  PROJECT_RULES_CLIENT_SCRIPT,
  PROJECT_RULES_SETTINGS_STYLES,
  RESPONSIVE_STYLES,
  RUNTIME_PLAN_CLIENT_SCRIPT,
  SETTINGS_IA_NAV_STYLES,
  SETTINGS_STYLES,
  STYLES,
  WEB_SERVICE_SETTINGS_SCRIPT,
} from "./browser-assets.js";
import { PROJECT_SETTINGS_CLIENT_SCRIPT } from "./scripts/project-settings.js";
import { DETAIL_READING_STYLES } from "./styles/detail-reading.js";
import { GOAL_CANVAS_STYLES } from "./styles/goal-canvas.js";
import { PLUGIN_STAGE_STYLES } from "./styles/plugin-stage.js";
import { IMMERSIVE_DIRECTORY_STYLES } from "./styles/immersive-directory.js";
import { IMMERSIVE_NAVIGATION_STYLES } from "./styles/immersive-navigation.js";
import { LINEAR_DENSITY_STYLES } from "./styles/linear-density.js";
import { PROJECT_HOME_STYLES } from "./styles/project-home.js";
import { PROJECT_SETTINGS_PAGE_STYLES } from "./styles/project-settings-page.js";
import { SURFACE_LANGUAGE_STYLES } from "./styles/surface-language.js";
import { TAB_WORKSPACE_STYLES } from "./styles/tab-workspace.js";

/** Coss/texture/primitive/typeface overlay. Appended after page CSS so mw-* wins. */
const PAGE_CHROME_OVERLAY = `${COSS_CONTROL_STYLES}${SURFACE_LANGUAGE_STYLES}`;
const PAGE_PRIMITIVE_TAIL = `${INTERACTION_TEXTURE_STYLES}${PRIMITIVE_STYLES}${MICRO_INTERACTION_STYLES}`;

/** Shared workbench presentation. Kept outside project HTML so the browser can reuse it. */
export function renderMolisWorkWorkbenchStylesheet(): string {
  return `${STYLES}${MORE_STYLES}${RESPONSIVE_STYLES}${VISUAL_FOUNDATION_STYLES}${TRASH_GOAL_STYLES}${PROJECT_OPERATIONS_STYLES}${ARTIFACT_EMBED_STYLES}${ARTIFACT_WORKBENCH_STYLES}${IMMERSIVE_NAVIGATION_STYLES}${IMMERSIVE_DIRECTORY_STYLES}${PROJECT_HOME_STYLES}${GOAL_CANVAS_STYLES}${PLUGIN_STAGE_STYLES}${TAB_WORKSPACE_STYLES}${DETAIL_READING_STYLES}${PROJECT_GUIDANCE_SETTINGS_STYLES}${PROJECT_RULES_SETTINGS_STYLES}${PLANNING_SETTINGS_STYLES}${SETTINGS_STYLES}${MODEL_SETTINGS_STYLES}${PROJECT_SETTINGS_PAGE_STYLES}.document-pane.is-syncing .goal-document { animation: none; }${PAGE_CHROME_OVERLAY}${LINEAR_DENSITY_STYLES}${CODING_STYLES}${FILES_STYLES}${AGENT_REVIEW_STYLES}${PAGE_PRIMITIVE_TAIL}${SHELF_STYLES}${FUNCTIONS_STYLES}${PAGES_STYLES}${FORM_STYLES}${DATASET_STYLES}${PPT_STYLES}${LINGGUANG_STYLES}${SCHEDULE_STYLES}${TYPEFACE_STYLES}`;
}

/** Full-screen first-run and update journey. */
export function renderMolisWorkOnboardingStylesheet(): string {
  return `${ONBOARDING_STYLES}${PRIMITIVE_STYLES}${TYPEFACE_STYLES}`;
}

/** Shared project index presentation. */
export function renderMolisWorkProjectIndexStylesheet(): string {
  return `${STYLES}${VISUAL_FOUNDATION_STYLES}${PROJECT_INDEX_STYLES}${PAGE_CHROME_OVERLAY}${PAGE_PRIMITIVE_TAIL}${TYPEFACE_STYLES}`;
}

/** Shared settings presentation, reused across project and global settings routes. */
export function renderMolisWorkSettingsStylesheet(): string {
  return `${STYLES}${MORE_STYLES}${RESPONSIVE_STYLES}${SETTINGS_STYLES}${MODEL_SETTINGS_STYLES}${PROJECT_GUIDANCE_SETTINGS_STYLES}${PROJECT_RULES_SETTINGS_STYLES}${PLANNING_SETTINGS_STYLES}${VISUAL_FOUNDATION_STYLES}${PROJECT_INDEX_STYLES}${SETTINGS_IA_NAV_STYLES}${COSS_CONTROL_STYLES}${PROJECT_SETTINGS_PAGE_STYLES}${SURFACE_LANGUAGE_STYLES}${LINEAR_DENSITY_STYLES}${PAGE_PRIMITIVE_TAIL}${TYPEFACE_STYLES}${SHELF_STYLES}${FUNCTIONS_STYLES}`;
}

/** Shared workbench behavior. Locale strings and project facts remain page-local. */
export function renderMolisWorkWorkbenchClientScript(): string {
  return `${CONTROL_CLIENT_SCRIPT}${MODEL_SETTINGS_CLIENT_SCRIPT}${CLIENT_SCRIPT}${PROJECT_SETTINGS_CLIENT_SCRIPT}${PROJECT_GUIDANCE_CLIENT_SCRIPT}${PROJECT_RULES_CLIENT_SCRIPT}${PLANNING_SETTINGS_CLIENT_SCRIPT}${PLANNING_ADOPTION_CLIENT_SCRIPT}${RUNTIME_PLAN_CLIENT_SCRIPT}${WEB_SERVICE_SETTINGS_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}${PROJECT_OPERATIONS_CLIENT_SCRIPT}`;
}
