import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkProjectCatalog } from "./project-catalog.js";
import { assertPassiveProjectAvailable } from "./passive-sync-execution.js";
import type { ProjectPluginMembership } from "@molis-ai/molis-work-contracts/modules/projects";
import { onboardingTakers, type OnboardingTaker } from "./onboarding-takers.js";
import { shownProjectPlugins } from "./plugin-registry.js";

/**
 * The plugins the project shows (enabled there, or a personal one it does not hide) that keep a text the platform hands them as a document (the `documents` material,
 * contract-design §2.5), by their own declaration: the report is saved by whichever one it is, and no plugin is named here.
 */
export function projectDocumentTakers(membership: ProjectPluginMembership): OnboardingTaker[] {
  const here = new Set(shownProjectPlugins(membership.plugins, membership.hidden));
  return onboardingTakers("documents").filter(taker => here.has(taker.project_plugin_id));
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
