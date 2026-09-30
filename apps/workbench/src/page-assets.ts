import { FUNCTIONS_STYLES } from "./functions/styles.js";
import { DISCUSSION_SPLIT_STYLES, DISCUSSION_SPLIT_SCRIPT } from "./discussion-split.js";
import { CODING_COMPANION_STYLES } from "./styles/coding-companions.js";
import { GIT_STYLES } from "@molis-ai/molis-work-plugin-git";
import { DIFF_STYLES } from "@molis-ai/molis-work-plugin-diff";
import { MODEL_SETTINGS_CLIENT_SCRIPT } from "./scripts/settings-models.js";
import { AGENT_REVIEW_STYLES } from "./agent-review-surface.js";
import { MODEL_SETTINGS_STYLES } from "./styles/settings-models.js";
import { CODING_STYLES } from "@molis-ai/molis-work-plugin-coding";
import { FILES_STYLES } from "@molis-ai/molis-work-plugin-files";
import { CHARACTERS_STYLES } from "@molis-ai/molis-work-plugin-characters";
import { TRASH_GOAL_STYLES, PLANNING_SETTINGS_STYLES, PLANNING_ADOPTION_CLIENT_SCRIPT, PLANNING_SETTINGS_CLIENT_SCRIPT } from "@molis-ai/molis-work-plugin-goals";
import { PROJECT_OPERATIONS_STYLES, PROJECT_OPERATIONS_CLIENT_SCRIPT } from "@molis-ai/molis-work-plugin-work";
import {
  COSS_CONTROL_STYLES,
  CRAFT_FINISH_STYLES,
  INTERACTION_TEXTURE_STYLES,
  MICRO_INTERACTION_STYLES,
  PRIMITIVE_STYLES,
  TYPEFACE_STYLES,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
  VISUAL_FOUNDATION_STYLES,
} from "@molis-ai/molis-work-design-system";
import { ARTIFACT_EMBED_STYLES, ARTIFACT_WORKBENCH_STYLES } from "./artifact-ui.js";
import { CONTEXT_ONBOARDING_STYLES } from "./styles/context-onboarding.js";
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
import { GLOBAL_SEARCH_CONTENT_STYLES } from "./styles/global-search-content.js";
import { PLACEMENT_STYLES } from "./styles/placement.js";
import { LINEAR_DENSITY_STYLES } from "./styles/linear-density.js";
import { PROJECT_HOME_STYLES } from "./styles/project-home.js";
import { PROJECT_SETTINGS_PAGE_STYLES } from "./styles/project-settings-page.js";
import { SURFACE_LANGUAGE_STYLES } from "./styles/surface-language.js";
import { TAB_WORKSPACE_STYLES } from "./styles/tab-workspace.js";
import { pluginWorkbenchSettingsStyles, pluginWorkbenchStyles } from "./plugin-workbench.js";
import { CAPABILITIES_STYLES } from "./styles/capabilities.js";
import { NAVIGATION_FLOW_STYLES } from "./styles/navigation-flow.js";
import { PROMPT_SETTINGS_CLIENT_SCRIPT } from "./settings-prompts.js";
import { ASSISTANT_SETTINGS_CLIENT_SCRIPT } from "./settings-assistant.js";
import { AGENT_DIAGNOSTICS_CLIENT_SCRIPT } from "./settings-agent-diagnostics.js";

/** Coss/texture/primitive/typeface overlay. Appended after page CSS so mw-* wins. */
const PAGE_CHROME_OVERLAY = `${COSS_CONTROL_STYLES}${SURFACE_LANGUAGE_STYLES}`;
const PAGE_PRIMITIVE_TAIL = `${INTERACTION_TEXTURE_STYLES}${PRIMITIVE_STYLES}${MICRO_INTERACTION_STYLES}`;

/** Shared workbench presentation. Kept outside project HTML so the browser can reuse it. */
export function renderMolisWorkWorkbenchStylesheet(): string {
  return `${STYLES}${MORE_STYLES}${RESPONSIVE_STYLES}${VISUAL_FOUNDATION_STYLES}${TRASH_GOAL_STYLES}${PROJECT_OPERATIONS_STYLES}${ARTIFACT_EMBED_STYLES}${ARTIFACT_WORKBENCH_STYLES}${IMMERSIVE_NAVIGATION_STYLES}${IMMERSIVE_DIRECTORY_STYLES}${PROJECT_HOME_STYLES}${GOAL_CANVAS_STYLES}${PLUGIN_STAGE_STYLES}${TAB_WORKSPACE_STYLES}${DETAIL_READING_STYLES}${PROJECT_GUIDANCE_SETTINGS_STYLES}${PROJECT_RULES_SETTINGS_STYLES}${PLANNING_SETTINGS_STYLES}${SETTINGS_STYLES}${MODEL_SETTINGS_STYLES}${PROJECT_SETTINGS_PAGE_STYLES}.document-pane.is-syncing .goal-document { animation: none; }${PAGE_CHROME_OVERLAY}${LINEAR_DENSITY_STYLES}${PAGE_PRIMITIVE_TAIL}${pluginWorkbenchStyles()}${CODING_STYLES}${FILES_STYLES}${CODING_COMPANION_STYLES}${GIT_STYLES}${DIFF_STYLES}${AGENT_REVIEW_STYLES}${CHARACTERS_STYLES}${TYPEFACE_STYLES}${CRAFT_FINISH_STYLES}${NAVIGATION_FLOW_STYLES}${DISCUSSION_SPLIT_STYLES}${GLOBAL_SEARCH_CONTENT_STYLES}${PLACEMENT_STYLES}`;
}

/** Full-screen first-run and update journey: the same window and controls the pages inline. */
export function renderMolisWorkOnboardingStylesheet(): string {
  return CONTEXT_ONBOARDING_STYLES;
}

/** Shared project index presentation. */
export function renderMolisWorkProjectIndexStylesheet(): string {
  return `${STYLES}${VISUAL_FOUNDATION_STYLES}${PROJECT_INDEX_STYLES}${PAGE_CHROME_OVERLAY}${PAGE_PRIMITIVE_TAIL}${TYPEFACE_STYLES}${CRAFT_FINISH_STYLES}`;
}

/** Shared settings presentation, reused across project and global settings routes. */
export function renderMolisWorkSettingsStylesheet(): string {
  return `${STYLES}${MORE_STYLES}${RESPONSIVE_STYLES}${SETTINGS_STYLES}${MODEL_SETTINGS_STYLES}${PROJECT_GUIDANCE_SETTINGS_STYLES}${PROJECT_RULES_SETTINGS_STYLES}${PLANNING_SETTINGS_STYLES}${VISUAL_FOUNDATION_STYLES}${PROJECT_INDEX_STYLES}${SETTINGS_IA_NAV_STYLES}${COSS_CONTROL_STYLES}${PROJECT_SETTINGS_PAGE_STYLES}${SURFACE_LANGUAGE_STYLES}${LINEAR_DENSITY_STYLES}${PAGE_PRIMITIVE_TAIL}${TYPEFACE_STYLES}${pluginWorkbenchSettingsStyles()}${CODING_STYLES}${CHARACTERS_STYLES}${PLUGIN_STAGE_STYLES}${FUNCTIONS_STYLES}${CAPABILITIES_STYLES}${CRAFT_FINISH_STYLES}${NAVIGATION_FLOW_STYLES}`;
}

/** Shared workbench behavior. Locale strings and project facts remain page-local. */
export function renderMolisWorkWorkbenchClientScript(): string {
  return `${CONTROL_CLIENT_SCRIPT}${MODEL_SETTINGS_CLIENT_SCRIPT}${PROMPT_SETTINGS_CLIENT_SCRIPT}${ASSISTANT_SETTINGS_CLIENT_SCRIPT}${AGENT_DIAGNOSTICS_CLIENT_SCRIPT}${CLIENT_SCRIPT}${PROJECT_SETTINGS_CLIENT_SCRIPT}${PROJECT_GUIDANCE_CLIENT_SCRIPT}${PROJECT_RULES_CLIENT_SCRIPT}${PLANNING_SETTINGS_CLIENT_SCRIPT}${PLANNING_ADOPTION_CLIENT_SCRIPT}${RUNTIME_PLAN_CLIENT_SCRIPT}${WEB_SERVICE_SETTINGS_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}${PROJECT_OPERATIONS_CLIENT_SCRIPT}${DISCUSSION_SPLIT_SCRIPT}`;
}
