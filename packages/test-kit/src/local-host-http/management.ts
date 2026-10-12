import type { ActionReference, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalHostHttpClient, LocalHostHttpError } from "./client.js";
import { orderGrantViews } from "./order.js";

/*
 * The Host's management routes a test calls the way the settings pages do. Each route string names the file that owns it, so a
 * renamed route fails loudly (404) in every test that uses it, and the owner is one search away.
 */
/** apps/local-host/src/web-mcp-action-settings.ts */
const MCP_ACTION_SETTINGS = "/api/settings/mcp/actions";
/** apps/local-host/src/web-project-settings.ts */
const PROJECT_SETTINGS = "/api/settings/projects";

/** An action as the grant route names it: capability, version and the provider the grant is pinned to. */
export type GrantedAction = ActionReference & { readonly provider_id: string };

export interface McpGrantScope {
  readonly clientId: string;
  /** `null` is the Home. */
  readonly projectId: string | null;
}

/** A saved grant row, as the route answers it. */
export interface McpActionGrantRow {
  readonly client_id: string;
  readonly project_id: string | null;
  readonly capability_id: string;
  readonly version: number;
  readonly provider_id: string;
  readonly enabled: boolean;
  readonly permissions: readonly string[];
}

/** One row of the access page: the action as the client may see it, and what its grant is doing. */
export interface McpActionAccessEntry {
  readonly capability_id: string;
  readonly version: number;
  readonly provider_id: string;
  readonly status: string;
  readonly reason?: string;
  readonly can_enable: boolean;
  readonly can_revoke: boolean;
}

export interface McpActionAccess {
  readonly client_id: string;
  readonly project_id: string | null;
  readonly actions: readonly ActionView[];
  readonly grants: readonly McpActionGrantRow[];
  readonly entries: readonly McpActionAccessEntry[];
}

const body = (scope: McpGrantScope, action: GrantedAction, enabled: boolean) => ({
  client_id: scope.clientId, project_id: scope.projectId, capability_id: action.capability_id, version: action.version,
  provider_id: action.provider_id, enabled,
});

/** Save one grant through the settings route. `with` names the actions to save together with it (at most 16, in the same scope). */
export function grantMcpAction(client: LocalHostHttpClient, input: McpGrantScope & { readonly action: GrantedAction; readonly with?: readonly GrantedAction[] }): Promise<McpActionGrantRow> {
  return client.post<McpActionGrantRow>(MCP_ACTION_SETTINGS, {
    ...body(input, input.action, true),
    ...(input.with ? { with: input.with.map(entry => ({ capability_id: entry.capability_id, version: entry.version, provider_id: entry.provider_id })) } : {}),
  });
}

/** Turn a saved grant off through the same route. */
export function revokeMcpAction(client: LocalHostHttpClient, input: McpGrantScope & { readonly action: GrantedAction }): Promise<McpActionGrantRow> {
  return client.post<McpActionGrantRow>(MCP_ACTION_SETTINGS, body(input, input.action, false));
}

/**
 * Grant a set of actions of a directory the way a person would on the access page: one request each, in dependency order
 * (`orderGrantViews`), Home actions for the Home. A refusal is the Host's own and names the action it refused; nothing after it is sent.
 * A dependency the set leaves out is not added: the Host refuses (`mcp.grant_requires`), and the test lists it.
 */
export async function grantMcpActions(client: LocalHostHttpClient, input: McpGrantScope & { readonly actions: readonly ActionView[] }): Promise<McpActionGrantRow[]> {
  const saved: McpActionGrantRow[] = [];
  for (const view of orderGrantViews(input.actions)) {
    try {
      saved.push(await grantMcpAction(client, { clientId: input.clientId, projectId: view.action.scope === "home" ? null : input.projectId,
        action: { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id } }));
    } catch (error) {
      if (!(error instanceof LocalHostHttpError)) throw error;
      throw new LocalHostHttpError(error.status, error.code, `${view.capability_id}: ${error.message}`, error.method, error.path);
    }
  }
  return saved;
}

/** What a client may see and use in a scope, and its saved grants. */
export function readMcpActionAccess(client: LocalHostHttpClient, scope: McpGrantScope): Promise<McpActionAccess> {
  return client.get<McpActionAccess>(`${MCP_ACTION_SETTINGS}?client_id=${encodeURIComponent(scope.clientId)}&project_id=${encodeURIComponent(scope.projectId ?? "")}`);
}

export interface CreatedProject {
  readonly project_id: string;
  readonly display_name: string;
  readonly database_path: string;
}

/** Create a project in the Home's catalog as the person confirming it. */
export async function createProject(client: LocalHostHttpClient, displayName: string): Promise<CreatedProject> {
  const created = await client.post<{ project: CreatedProject }>(PROJECT_SETTINGS, { display_name: displayName, user_confirmed: true });
  return { project_id: created.project.project_id, display_name: created.project.display_name, database_path: created.project.database_path };
}

/** Install a bundled plugin in a project; answers the project's plugins after the change. */
export async function addProjectPlugin(client: LocalHostHttpClient, projectId: string, pluginId: string): Promise<string[]> {
  return (await client.post<{ plugins: string[] }>(`${PROJECT_SETTINGS}/${encodeURIComponent(projectId)}/plugins`, { plugin_id: pluginId })).plugins;
}
