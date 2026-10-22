import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import type { AgentHostComposition } from "./agent-host-composition.js";
import { observeGitOperations } from "./git-operation-notifications.js";
import { ensureInstalledPlugins } from "./installed-plugin-host.js";
import type { LocalHost } from "./local-host.js";
import type { MolisWorkLocalHostOptions, MolisWorkProjectRuntime } from "./project-host.js";
import { ensureProjectPlugins } from "./project-plugins.js";

/**
 * What the project's plugin ports are read from. `agents` is read when a call needs it, not when the Host is built: the
 * Agent service is attached to the Host afterwards.
 */
export interface ProjectPluginHost {
  readonly host: LocalHost<MolisWorkProjectRuntime>;
  readonly options: MolisWorkLocalHostOptions;
  agents(): AgentHostComposition | undefined;
}

/** Reuse the complete production composition, without restoring external MCP or executing an Agent. */
export async function withPreparedProject<Result>(source: ProjectPluginHost, reference: LocalHostProjectReference,
  operation: (runtime: MolisWorkProjectRuntime) => Result | Promise<Result>, activatePlugins = false): Promise<Result> {
  if (activatePlugins) await ensureProjectPluginActions(source, reference);
  return source.host.withRuntime(reference, async runtime => { await prepareInstalledPlugins(source, reference, runtime); return operation(runtime); });
}

/** The plugins installed in this project (generated, installed from the market): their actions join the project's directory. */
export async function prepareInstalledPlugins(source: ProjectPluginHost, reference: LocalHostProjectReference, runtime: MolisWorkProjectRuntime): Promise<void> {
  const { host, options } = source;
  if (!options.homeDirectory) return;
  const installed = await ensureInstalledPlugins({ store: runtime.store, projectId: runtime.project_id, homeDirectory: options.homeDirectory, actorId: LOCAL_PERSON_ACTOR_ID,
    routePrefix: options.projectRoutePrefix?.(reference.project_id) ?? `/projects/${encodeURIComponent(reference.project_id)}`,
    capabilities: host.client(reference),
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
    store: runtime.store, projectId: runtime.project_id, actorId: LOCAL_PERSON_ACTOR_ID, homeDirectory: options.homeDirectory,
    capabilities: host.client(reference),
    actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, project_id: reference.project_id },
    characterWorkspaces: async () => options.workspacesFor ? await options.workspacesFor(reference.project_id)
      : options.workspaceFor ? [await options.workspaceFor(reference.project_id)].filter((value): value is ProjectWorkspaceRef => !!value) : [],
    ...(agents() ? { observeGitOperations: listener => observeGitOperations(agents()!.agentHost.reviews, runtime.project_id, listener) } : {}),
  }));
}
