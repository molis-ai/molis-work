import {
  AgentHost,
  CliAgentAdapter,
  createNodeCliProcessPort,
  createPrologueNodeAdapter,
  registerAgentHostCapabilities,
  type AgentStartAuthority,
  type PrologueNodeAdapterOptions,
} from "@molis-ai/molis-work-service-agent-host";
import { BUILTIN_PLUGIN_AGENTS } from "@molis-ai/molis-work-app-workbench";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/goals";
import type { AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";
import type { ModelProviderStore } from "./model-provider-store.js";

/**
 * Wires the Agent Host into a running Host.
 *
 * This is the step that turns "a Plugin could reach the Agent Host" into "it
 * can". Everything it needs — which Plugins declare Agents, which directory is
 * authorized, which model is configured — is resolved from facts the Host
 * already owns, so a Plugin cannot name a role, a directory or a model that is
 * not already its own.
 */

export interface AgentHostCompositionOptions {
  localHost: MolisWorkLocalHost;
  /** Resolves the workspace a project is bound to, for directory authority. */
  workspacesFor?(projectId: string): readonly ProjectWorkspaceRef[] | Promise<readonly ProjectWorkspaceRef[]>;
  workspaceFor(projectId: string): ProjectWorkspaceRef | null | Promise<ProjectWorkspaceRef | null>;
  /** Configured providers, used to decide whether a CLI Runtime has a model. */
  models?: ModelProviderStore;
  /** CLI executables to register. Absent ones are simply not registered. */
  cliRuntimes?: ReadonlyArray<{ runtime_id: string; display_name: string; command: string }>;
  /** The owning server supplies storage and credential access for this Home. */
  prologue?: Omit<PrologueNodeAdapterOptions, "app">;
}

export interface AgentHostComposition {
  readonly agentHost: AgentHost;
  readonly ready: Promise<void>;
  /** Unregisters the Capabilities this composition added. */
  dispose(): Promise<void>;
}

const DEFAULT_CLI_RUNTIMES = [
  { runtime_id: "claude-code", display_name: "Claude Code", command: "claude" },
] as const;

/**
 * Build the Agent Host and register its Capabilities against `localHost`.
 *
 * Prologue is registered when its owning server supplies storage and secrets.
 * Its capability matrix stays read-only until effect approval is connected.
 */
export function composeAgentHost(options: AgentHostCompositionOptions): AgentHostComposition {
  const agentHost = new AgentHost();

  for (const runtime of options.cliRuntimes ?? DEFAULT_CLI_RUNTIMES) {
    agentHost.register(new CliAgentAdapter({
      runtime_id: runtime.runtime_id,
      display_name: runtime.display_name,
      command: runtime.command,
      process: createNodeCliProcessPort(),
      // The model is a Host fact. No configuration means no model, and the
      // adapter reports that rather than picking one.
      model: async () => options.models?.resolveConfiguration()?.model.model_id ?? null,
    }));
  }

  let prologue: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  let ready: Promise<void> | undefined;
  const initialize = () => ready ??= options.prologue === undefined ? Promise.resolve() : createPrologueNodeAdapter({
      ...options.prologue,
      reviewQueue: agentHost.reviews,
      app: { appId: "io.molis.work", appVersion: "0.0.0" },
    }).then((adapter) => { prologue = adapter; agentHost.register(adapter); });
  const unregister = registerAgentHostCapabilities<MolisWorkProjectRuntime>(
    {
      register: (definition, handler) => options.localHost.registerCapability(definition, handler),
    },
    {
      agentHost: () => agentHost,
      authority: (runtime, pluginId) => startAuthority(runtime, pluginId, options.workspaceFor, options.workspacesFor),
      boardId: (runtime) => runtime.board_id,
    },
  );

  return { agentHost, get ready() { return initialize(); }, async dispose() {
    unregister();
    await ready?.catch(() => undefined);
    await prologue?.close();
  } };
}

/**
 * What one Plugin is allowed to start, resolved from its own declarations.
 *
 * A Plugin that declares no Agent gets an authority with no roles, so every
 * start attempt fails the first gate. A project with no workspace bound gets no
 * authorized directory, so it fails the third — both are true answers, and
 * neither invents a fallback.
 */
async function startAuthority(
  runtime: MolisWorkProjectRuntime,
  pluginId: string,
  workspaceFor: AgentHostCompositionOptions["workspaceFor"],
  workspacesFor?: AgentHostCompositionOptions["workspacesFor"],
): Promise<AgentStartAuthority> {
  const declared = BUILTIN_PLUGIN_AGENTS.get(pluginId);
  const workspace = await workspaceFor(runtime.project_id);
  const workspaces = workspacesFor ? await workspacesFor(runtime.project_id) : workspace ? [workspace] : [];
  return {
    manifest: declared?.manifest ?? { roles: [], prompts: [] },
    authorizedDirectories: workspaces.filter(entry => entry.realpath_verified).map(entry => entry.canonical_path),
    prompts: declared?.prompts ?? [],
    project_prompts: projectPrompts(runtime),
  };
}

/**
 * The project's own layer, from the guidance its user confirmed.
 *
 * Taken from the Host rather than from the Plugin package: conventions belong
 * to the project, and a Plugin able to ship them would be speaking for every
 * project it is installed in.
 *
 * A project with nothing confirmed contributes **nothing**. The guidance view
 * still renders a prefix in that case — one that says no guidance has been
 * confirmed — and passing that along would turn "this project has said nothing"
 * into an instruction, which is a different claim.
 */
function projectPrompts(runtime: MolisWorkProjectRuntime): AgentPromptText[] {
  let view: ProjectGuidanceView;
  try {
    view = runtime.coordinator.readProjectGuidance(runtime.board_id);
  } catch {
    // Guidance is an addition, not a precondition. A project whose guidance
    // cannot be read still starts Runs; it just starts them without this layer.
    return [];
  }
  if (view.entries.length === 0) return [];
  return [{
    prompt_id: "project-guidance",
    // The version moves with the content, so a frozen Run records which
    // guidance it actually ran with rather than just that some existed.
    version: view.entries.length,
    layer: "project",
    body: view.runtime_prompt_prefix,
  }];
}

/** The two catalog queries needed to answer "which directory is this project bound to". */
export interface WorkspaceLookupPorts {
  preferredWorkspacePath(projectId: string): string | null;
  listWorkspaceDirectory(projectId?: string): readonly ProjectWorkspaceRef[];
}

/**
 * The workspace a project is bound to, or null when it has none.
 *
 * Prefers the path the user set as preferred, and falls back to the single
 * bound directory when there is exactly one. With several bound and no
 * preference it returns null rather than picking: guessing which directory an
 * Agent may write in is not a choice this code gets to make.
 */
export function workspaceRefFor(
  ports: WorkspaceLookupPorts,
  projectId: string,
): ProjectWorkspaceRef | null {
  const bound = ports.listWorkspaceDirectory(projectId);
  if (bound.length === 0) return null;
  const preferred = ports.preferredWorkspacePath(projectId);
  if (preferred !== null) {
    return bound.find((entry) => entry.canonical_path === preferred) ?? null;
  }
  return bound.length === 1 ? bound[0]! : null;
}
