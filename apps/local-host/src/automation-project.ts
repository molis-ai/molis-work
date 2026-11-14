import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkProjectCatalog } from "./project-catalog.js";
import { assertPassiveProjectAvailable } from "./passive-sync-execution.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";

/** Find the built-in document owner by its manifest and pin the discovered action to that provider. */
export function registeredPagesProvider(): string | undefined {
  return PLATFORM_PLUGIN_REGISTRATIONS.find(entry => entry.project_plugin_id === "pages"
    && entry.manifest.actions?.some(action => action.capability_id === "pages.create" && action.version === /* @version action.pages.create */ 1))?.manifest.plugin_id;
}

export function automationProjectSnapshot(home: string, catalog: MolisWorkProjectCatalog, reference: LocalHostProjectReference, scan: boolean) {
  assertPassiveProjectAvailable(home, reference.project_id);
  const project = catalog.getProject(reference.project_id);
  if (resolve(project.database_path) !== reference.storage_key || catalog.recycle.isRecycled(reference.project_id)) {
    throw new ActionError("actions.conflict", "项目已变更，请重新打开");
  }
  const incarnation = JSON.stringify([project.created_at, reference.storage_key]);
  if (!scan) return { incarnation, folders: [], revision: null, plugins: null };
  return { incarnation, ...catalog.personInputDirectories(project.project_id), plugins: catalog.projectPluginMembershipWithRevision(project.project_id).revision };
}

type ProjectObservation = ReturnType<typeof automationProjectSnapshot>;
export function assertAutomationProject(seen: ProjectObservation, current: ProjectObservation): void {
  if (!isDeepStrictEqual(seen, current)) throw new ActionError("actions.conflict", "项目或目录授权已变化，请重新查看建议");
}
