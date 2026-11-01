import { ARTIFACTS_PROVIDER_ID } from "@molis-ai/molis-work-module-artifacts";
import { artifactReferenceUiContribution, artifactBrowserUiContribution } from "./artifacts/index.js";
import { ownedContribution, type UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { ARTIFACT_REFERENCE_UI_CONTRIBUTION_ID, type ArtifactReferenceUiPrimitives } from "./artifacts/index.js";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { BUILTIN_PLUGIN_WORKBENCH, type BuiltinPluginWorkbenchPack } from "./plugin-workbench.js";
import { withPluginWords } from "./i18n.js";
import { createArtifactWorkbenchRenderer } from "./artifact-ui.js";

export { WORKBENCH_UI_SLOTS, renderWorkbenchDocument } from "./document-shell.js";
import { WORKBENCH_UI_SLOTS } from "./document-shell.js";


/**
 * Shared Workbench composition root. Product renderers never import a Plugin implementation directly. The host offers
 * the five workbench slots, and every surface is mounted in the slot its contribution declares (W5-06): no
 * surface→slot table and no per-plugin mount adapter lives here.
 */
export function createWorkbenchUiHost(packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH): UiHost {
  const host = new UiHost({ slots: Object.values(WORKBENCH_UI_SLOTS), drawingAs: withPluginWords });
  host.register(ownedContribution(artifactReferenceUiContribution, ARTIFACTS_PROVIDER_ID));
  host.register(ownedContribution(artifactBrowserUiContribution, ARTIFACTS_PROVIDER_ID));
  for (const pack of packs) {
    for (const contribution of pack.contributions) host.register(contribution);
  }
  return host;
}

const workbenchUiHost = createWorkbenchUiHost();


export const artifactWorkbench = createArtifactWorkbenchRenderer(workbenchUiHost);

export function createArtifactReferenceRenderer(primitives: ArtifactReferenceUiPrimitives) {
  return (value: string, label = value): string => renderWorkbenchContribution(ARTIFACT_REFERENCE_UI_CONTRIBUTION_ID, "reference", { value, label, primitives });
}

/** Mount one surface of a registered contribution in the slot the contribution declares for it. */
export function renderWorkbenchContribution(contributionId: string, surface: string, model: unknown): string {
  return workbenchUiHost.mountDeclared({ contribution_id: contributionId, surface, model }).html;
}

/**
 * The mount one plugin's page is given (T-116, `GoalsPagePorts.mount`): its own contributions only. Another plugin's contribution id is
 * refused by the host with `ui_host.plugin_denied`, so a page cannot draw a surface another plugin owns through the port it was handed.
 * `host` is the workbench's own unless a test gives another.
 */
export function mountContributionsOf(pluginId: string, host: UiHost = workbenchUiHost): (contributionId: string, surface: string, model: unknown) => string {
  return (contributionId, surface, model) => host.mountDeclared({ contribution_id: contributionId, surface, model }, pluginId).html;
}

/** The settings page asks for the settings slot itself: a contribution whose `settings` surface targets another slot is refused. */
export function renderPluginSettingsContribution(
  contributionId: string,
  model: unknown,
): string {
  return workbenchUiHost.mount({
    slot: WORKBENCH_UI_SLOTS.settings,
    contribution: { contribution_id: contributionId, surface: "settings", model },
  }).html;
}


export function listWorkbenchUiContributions() {
  return workbenchUiHost.list();
}
