import { bindActionClient, type ActionCallContext, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { shownProjectPlugins, type MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
import { observeGitOperations } from "./git-operation-notifications.js";
import { localWebActionContext, type bindLocalWebActions } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import type { bindGoalsWebActions } from "./goals-actions.js";
import { molisWorkHostProjectReference, type MolisWorkProjectRuntime } from "./project-host.js";
import type { projectFeedOptions } from "./workflow-feed-options.js";
import type { CodingSurfacePorts } from "./coding-surface.js";
import type { ContextualHttpPorts } from "./contextual/contextual-http.js";
import type { ResolvedWebBoardOptions } from "./web-types.js";
import type { WebRequestContext } from "./web-route-table.js";
import type { HomeRouteProjectPlugins } from "./home-plugin-http.js";

/** A request for one project that exists and has a database, before the project's runtime is opened. */
export interface ProjectRequestContext extends WebRequestContext {
  readonly options: ResolvedWebBoardOptions;
  readonly hostReference: LocalHostProjectReference;
  /** A web user's call into one surface's own actions, with whatever transport (cancellation) the surface adds. */
  readonly userActions: (permissions: readonly string[], transport?: Partial<ActionCallContext>) => ReturnType<typeof bindActionClient>;
  /** The plugins this project's page shows: personal ones included unless the person hid them here. */
  readonly shownPlugins: (projectId: string) => Promise<string[]>;
}

/** The same request inside the project's open runtime: the stores, and the ports the project's surfaces are given. */
export interface ProjectRuntimeContext extends ProjectRequestContext {
  readonly store: MolisWorkProjectRuntime["store"];
  readonly coordinator: MolisWorkProjectRuntime["coordinator"];
  readonly feedOptions: ReturnType<typeof projectFeedOptions>;
  /** Home shows and runs what any plugin offers the person here: native plugins by their manifests, Runtime plugins by their installed grants. */
  readonly homeActions: ReturnType<typeof bindLocalWebActions>;
  readonly goalActions: ReturnType<typeof bindGoalsWebActions>;
  readonly codingServices: ProjectCodingServices;
  readonly pluginPorts: CodingSurfacePorts;
  readonly readWebView: () => Promise<MolisWorkWebView>;
}

export type ProjectCodingServices = Pick<CodingSurfacePorts, "capabilities" | "actions" | "execution" | "homeDirectory" | "characterWorkspaces" | "characterSpawn" | "observeGitOperations">;

export function projectRequestContext(context: WebRequestContext, options: ResolvedWebBoardOptions): ProjectRequestContext {
  const { localHost, composition, serverOptions } = context;
  const hostReference = molisWorkHostProjectReference({ databasePath: options.databasePath, projectId: options.projectId });
  const userActions = (permissions: readonly string[], transport: Partial<ActionCallContext> = {}) => bindActionClient(localHost.actionClient(hostReference),
    () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: hostReference.project_id, audience: "user" as const, permissions: [...permissions], ...transport }));
  const shownPlugins = (projectId: string) => composition.withCatalog({ homeDirectory: serverOptions.homeDirectory },
    catalog => shownProjectPlugins(catalog.listProjectPlugins(projectId), catalog.listHiddenPlugins(projectId)));
  return { ...context, options, hostReference, userActions, shownPlugins };
}

/** What a Home plugin's route under `/projects/<id>/…` checks: the plugins that project shows, or null when there is no such project. */
export function homeRouteProjectPlugins({ composition, serverOptions }: WebRequestContext): HomeRouteProjectPlugins {
  return projectId => composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => {
    let databasePath: string;
    try { databasePath = catalog.getProject(projectId).database_path; } catch { return null; /* No such project: the route refuses, saying so. */ }
    return { database_path: databasePath, plugins: shownProjectPlugins(catalog.listProjectPlugins(projectId), catalog.listHiddenPlugins(projectId)) };
  });
}

/** `/projects/<id>` for a project page; empty for the board a fixture serves at the root. */
export const projectRoutePrefix = (options: ResolvedWebBoardOptions) => options.project ? `/projects/${encodeURIComponent(options.project.project_id)}` : "";

export function projectCodingServices({ localHost, hostReference, options, agentHost, ptyHost, composition, serverOptions, agentReady }: ProjectRequestContext): ProjectCodingServices {
  return {
    actions: { registry: localHost.actionRegistry(hostReference), client: { ...localHost.actionClient(hostReference), ...localHost.syncActionClient(hostReference) }, project_id: hostReference.project_id, inspect: caller => localHost.inspectActions(caller, hostReference) },
    observeGitOperations: listener => observeGitOperations(agentHost.reviews, options.projectId, listener),
    characterSpawn: request => ptyHost.spawn(request),
    characterWorkspaces: () => composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => options.project ? catalog.listWorkspaceDirectory(options.project.project_id) : []),
    homeDirectory: serverOptions.homeDirectory,
    capabilities: localHost.client(hostReference),
    execution: {
      ready: agentReady,
      models: () => composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, (catalog) => {
        const healthy = new Set(catalog.models.health().filter((entry) => entry.status === "ready").map((entry) => entry.provider_id));
        return catalog.models.list().filter((entry) => healthy.has(entry.provider_id)).flatMap((provider) =>
          provider.models.filter((model) => model.enabled).map((model) => ({ provider_id: provider.provider_id,
            model_id: model.model_id, label: `${provider.display_name} · ${model.display_name ?? model.model_id}`, reasoning_effort: model.reasoning_effort === true })));
      }),
    },
  };
}

/** The context row's ports for one project: the local person's own authority there, and H3's owner check for 「放进左边」. */
export function contextualPorts({ localHost, hostReference, serverOptions }: ProjectRequestContext): ContextualHttpPorts {
  const homeDirectory = serverOptions.homeDirectory;
  const context = () => localWebActionContext(localHost, hostReference, LOCAL_OWNER_PERMISSIONS);
  return {
    ...(homeDirectory ? { homeDirectory } : {}), scope: hostReference.project_id,
    actions: () => {
      const client = localHost.actionClient(hostReference);
      return { discover: async () => client.discover(await context()), invoke: async (reference, input) => client.invoke(await context(), reference, input) };
    },
    confirmReferences: async (picked, kinds) => localHost.search ? localHost.search.confirmReferences(hostReference.project_id, picked, kinds) : picked.map(() => false),
  };
}
