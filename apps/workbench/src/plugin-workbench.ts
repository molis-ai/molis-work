import { EXPERIMENTS_CLIENT_FACTORY_SCRIPT, EXPERIMENTS_STYLES, experimentsUiContribution } from "@molis-ai/molis-work-plugin-experiments";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { artifactReferenceUiContribution, artifactBrowserUiContribution } from "@molis-ai/molis-work-plugin-artifacts";
import { feedUiContribution } from "@molis-ai/molis-work-plugin-feed";
import {
  goalsContextUiContribution,
  goalsDecisionResultsUiContribution,
  goalsDialogsUiContribution,
  goalsDocumentUiContribution,
  goalsFactorsUiContribution,
  goalsMomentumUiContribution,
  goalsPlanningUiContribution,
  goalsPolicyUiContribution,
  goalsProposalUiContribution,
  goalsRelationUiContribution,
  goalsSafetyUiContribution,
  goalsSettingsUiContribution,
  goalsStatusUiContribution,
  goalsTreeUiContribution,
} from "@molis-ai/molis-work-plugin-goals";
import { inboxUiContribution } from "@molis-ai/molis-work-plugin-inbox";
import { SCHEDULE_CLIENT_FACTORY_SCRIPT, SCHEDULE_STYLES, scheduleUiContribution } from "@molis-ai/molis-work-plugin-schedule";
import {
  SHELF_CLIENT_FACTORY_SCRIPT,
  SHELF_SETTINGS_CLIENT_SCRIPT,
  SHELF_STYLES,
  shelfSettingsUiContribution,
  shelfUiContribution,
} from "@molis-ai/molis-work-plugin-shelf";
import {
  FUNCTIONS_CLIENT_FACTORY_SCRIPT,
  FUNCTIONS_SETTINGS_CLIENT_SCRIPT,
  FUNCTIONS_STYLES,
  functionsSettingsUiContribution,
  functionsUiContribution,
} from "@molis-ai/molis-work-plugin-functions";
import { PAGES_CLIENT_FACTORY_SCRIPT, PAGES_STYLES, pagesUiContribution } from "@molis-ai/molis-work-plugin-pages";
import { FORM_CLIENT_FACTORY_SCRIPT, FORM_STYLES, formUiContribution } from "@molis-ai/molis-work-plugin-form";
import { DATASET_CLIENT_FACTORY_SCRIPT, DATASET_STYLES, datasetUiContribution } from "@molis-ai/molis-work-plugin-dataset";
import { PPT_CLIENT_FACTORY_SCRIPT, PPT_STYLES, pptUiContribution } from "@molis-ai/molis-work-plugin-ppt";
import { LINGGUANG_CLIENT_FACTORY_SCRIPT, LINGGUANG_STYLES, lingguangUiContribution } from "@molis-ai/molis-work-plugin-lingguang";
import { workTerminalUiContribution, workUiContribution } from "@molis-ai/molis-work-plugin-work";

export interface PluginSearchRow {
  readonly selector: string;
  readonly idDataset: string;
}

export interface BuiltinPluginWorkbenchPack {
  readonly project_plugin_id: string;
  readonly contributions: readonly UiContribution[];
  readonly stylesheet?: string;
  readonly clientFactory?: string;
  readonly settingsClient?: string;
  readonly searchRow?: PluginSearchRow;
}

/**
 * Workbench chrome for built-in plugins. Catalog stays Host-safe (manifests only);
 * this table is the unique Workbench register for contributions, styles, factories.
 */
export const BUILTIN_PLUGIN_WORKBENCH: readonly BuiltinPluginWorkbenchPack[] = [
  { project_plugin_id: "experiments", contributions: [experimentsUiContribution], stylesheet: EXPERIMENTS_STYLES, clientFactory: EXPERIMENTS_CLIENT_FACTORY_SCRIPT },
  { project_plugin_id: "feed", contributions: [feedUiContribution] },
  { project_plugin_id: "inbox", contributions: [inboxUiContribution] },
  {
    project_plugin_id: "schedule",
    contributions: [scheduleUiContribution],
    stylesheet: SCHEDULE_STYLES,
    clientFactory: SCHEDULE_CLIENT_FACTORY_SCRIPT,
  },
  {
    project_plugin_id: "shelf",
    contributions: [shelfUiContribution, shelfSettingsUiContribution],
    stylesheet: SHELF_STYLES,
    clientFactory: SHELF_CLIENT_FACTORY_SCRIPT,
    settingsClient: SHELF_SETTINGS_CLIENT_SCRIPT,
  },
  {
    project_plugin_id: "functions",
    contributions: [functionsUiContribution, functionsSettingsUiContribution],
    stylesheet: FUNCTIONS_STYLES,
    clientFactory: FUNCTIONS_CLIENT_FACTORY_SCRIPT,
    settingsClient: FUNCTIONS_SETTINGS_CLIENT_SCRIPT,
  },
  {
    project_plugin_id: "pages",
    contributions: [pagesUiContribution],
    stylesheet: PAGES_STYLES,
    clientFactory: PAGES_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "button.feed-stage-entry[data-page-id]", idDataset: "pageId" },
  },
  {
    project_plugin_id: "form",
    contributions: [formUiContribution],
    stylesheet: FORM_STYLES,
    clientFactory: FORM_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-form-id]", idDataset: "formId" },
  },
  {
    project_plugin_id: "dataset",
    contributions: [datasetUiContribution],
    stylesheet: DATASET_STYLES,
    clientFactory: DATASET_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-dataset-id]", idDataset: "datasetId" },
  },
  {
    project_plugin_id: "ppt",
    contributions: [pptUiContribution],
    stylesheet: PPT_STYLES,
    clientFactory: PPT_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-ppt-id]", idDataset: "pptId" },
  },
  {
    project_plugin_id: "lingguang",
    contributions: [lingguangUiContribution],
    stylesheet: LINGGUANG_STYLES,
    clientFactory: LINGGUANG_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-lingguang-id]", idDataset: "lingguangId" },
  },
  { project_plugin_id: "sessions", contributions: [workUiContribution, workTerminalUiContribution] },
  { project_plugin_id: "artifacts", contributions: [artifactReferenceUiContribution, artifactBrowserUiContribution] },
  {
    project_plugin_id: "goals",
    contributions: [
      goalsPolicyUiContribution,
      goalsProposalUiContribution,
      goalsDecisionResultsUiContribution,
      goalsSafetyUiContribution,
      goalsRelationUiContribution,
      goalsTreeUiContribution,
      goalsMomentumUiContribution,
      goalsDocumentUiContribution,
      goalsContextUiContribution,
      goalsPlanningUiContribution,
      goalsStatusUiContribution,
      goalsFactorsUiContribution,
      goalsDialogsUiContribution,
      goalsSettingsUiContribution,
    ],
  },
];

export function pluginWorkbenchStyles(): string {
  return BUILTIN_PLUGIN_WORKBENCH.map((pack) => pack.stylesheet ?? "").join("");
}

export function pluginWorkbenchSettingsStyles(): string {
  return BUILTIN_PLUGIN_WORKBENCH
    .filter((pack) => pack.settingsClient)
    .map((pack) => pack.stylesheet ?? "")
    .join("");
}

export function pluginSearchRows(): Array<[string, string, string]> {
  return BUILTIN_PLUGIN_WORKBENCH.flatMap((pack) => pack.searchRow
    ? [[pack.project_plugin_id, pack.searchRow.selector, pack.searchRow.idDataset] as [string, string, string]]
    : []);
}

export function pluginWorkbenchClientBootstrap(): string {
  return BUILTIN_PLUGIN_WORKBENCH.flatMap((pack) => {
    const lines: string[] = [];
    if (pack.clientFactory) {
      lines.push(`(${pack.clientFactory})({ translate: L, projectId: () => state.project?.project_id || document.body.dataset.projectId || "", feedApi, route });`);
    }
    if (pack.settingsClient) lines.push(pack.settingsClient);
    return lines;
  }).join("\n    ");
}
