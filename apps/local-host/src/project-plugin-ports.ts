import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AgentHostComposition } from "./agent-host-composition.js";
import { observeReviewSettlements, type AgentWritePlaces } from "./review-settlement-events.js";
import { ensureInstalledPlugins } from "./installed-plugin-host.js";
import type { LocalHost } from "./local-host.js";
import type { MolisWorkLocalHostOptions, MolisWorkProjectRuntime } from "./project-host.js";
import { ensureProjectPlugins } from "./project-plugins.js";
import { hostDependencyCheck } from "./plugin-actions-client.js";

/**
 * What the project's plugin ports are read from. `agents` is read when a call needs it, not when the Host is built: the
 * Agent service is attached to the Host afterwards.
 */
interface ProjectPluginHost {
  readonly host: LocalHost<MolisWorkProjectRuntime>;
  readonly options: MolisWorkLocalHostOptions;
  agents(): AgentHostComposition | undefined;
}

/** The plugins installed in this project (generated, installed from the market): their actions join the project's directory. */
export async function prepareInstalledPlugins(source: ProjectPluginHost, reference: LocalHostProjectReference, runtime: MolisWorkProjectRuntime): Promise<void> {
  const { host, options } = source;
  if (!options.homeDirectory) return;
  const installed = await ensureInstalledPlugins({ store: runtime.store, projectId: runtime.project_id, homeDirectory: options.homeDirectory, actorId: LOCAL_PERSON_ACTOR_ID,
    routePrefix: options.projectRoutePrefix?.(reference.project_id) ?? `/projects/${encodeURIComponent(reference.project_id)}`,
    dependencyCheck: hostDependencyCheck(host.client(reference)),
    actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, project_id: reference.project_id,
      // This internal directory is already in a prepared Host; recursing through the public entry would wait on itself.
      inspect: caller => host.inspectActions(caller, reference) } });
  await installed.refreshPublicActions();
}

/** The project's built-in Runtime plugins (Coding, Files, Git, ...): started once per project, their actions registered. */
export function ensureProjectPluginActions(source: ProjectPluginHost, reference: LocalHostProjectReference): Promise<unknown> {
  const { host, options } = source;
  const agents = () => source.agents();
  return host.withRuntime(reference, runtime => ensureProjectPlugins({
    store: runtime.store, artifacts: runtime.artifacts, processItems: runtime.processItems, projectId: runtime.project_id, actorId: LOCAL_PERSON_ACTOR_ID, homeDirectory: options.homeDirectory,
    dependencyCheck: hostDependencyCheck(host.client(reference)),
    actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, project_id: reference.project_id },
    ...(agents() ? { observeReviewSettlements: listener => observeReviewSettlements(agents()!.agentHost.reviews, runtime.project_id, listener,
      agentWritePlaces(source, runtime.project_id)) } : {}),
  }));
}

/** Where an Agent's approved write in this project landed (BL-366): its round's frozen directory, and the project's workspaces. */
function agentWritePlaces(source: ProjectPluginHost, projectId: string): AgentWritePlaces {
  return {
    async runDirectory(run) {
      const host = source.agents()?.agentHost;
      for (const { runtime_id } of host?.descriptors() ?? []) {
        const view = await host!.adapter(runtime_id).read(run).catch(() => null);
        if (view) return view.frozen.directory?.canonical_path ?? null;
      }
      return null;
    },
    async workspaces() {
      const { workspacesFor, workspaceFor } = source.options;
      if (workspacesFor) return workspacesFor(projectId);
      const one = await workspaceFor?.(projectId);
      return one ? [one] : [];
    },
  };
}
