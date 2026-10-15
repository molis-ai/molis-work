import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import {
  grantMcpAction, isLocalHostHttpError, localHostHttpError, orderGrantViews, readMcpActionAccess,
  type GrantedAction, type LocalHostHttpClient, type McpActionGrantRow,
} from "@molis-ai/molis-work-test-kit/local-host-http";
import { serveTestHost } from "./test-home.js";

/**
 * Where the grants are saved. A Home directory: a short-lived Host assembled the way the product assembles it serves that Home for
 * the length of the call, so the test's own Host is never reconfigured. A Home has one open Host at a time, so this is only for a
 * test whose own Host is not bound to that Home (it was made without a `homeDirectory`); otherwise the call fails with
 * `agent.inference.home_in_use`. Or the test's own served Host (`serveTestHost`, `openTestHome`): needed when the Host is bound to the
 * Home, or when the actions to grant live on that Host (a provider the test registered on it).
 */
export type GoalsGrantTarget = string | { readonly web: LocalHostHttpClient };

/** What the access settings save in one request: the action and up to 16 others, checked as one set (`with`, in the same scope). */
const SAVED_TOGETHER = 17;

const reference = (view: ActionView): GrantedAction => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });

/**
 * Grant a Runtime client every Goals action it may use in a project, through the access settings a person uses: the request is
 * checked against the project in the catalog, the plugin it needs and the actions it depends on, exactly as in the app. `also`
 * grants other actions beside Goals' (an action that writes through Goals needs both). An `also` action the client is not
 * offered is an error, not a skipped line: the project lacks its plugin, or it is not an action a model's client may hold.
 *
 * Goals declares about sixty actions, and every request costs the Host a full directory, so consecutive actions of one scope go
 * in together (`with`), in dependency order: an action goes after the ones it needs, in the same request or an earlier one.
 * An action that needs a scene binding is saved on its own.
 */
export async function grantGoalsMcp(where: GoalsGrantTarget, project: { project_id: string }, clientId = "runtime:codex",
  also: ReadonlyArray<{ capability_id: string }> = []): Promise<McpActionGrantRow[]> {
  const served = typeof where === "string" ? await serveTestHost(null, { home: where }) : null;
  try {
    const web = served?.web ?? (where as { web: LocalHostHttpClient }).web;
    const scopes = [project.project_id, null];
    // The project's actions and the Home's: the access page lists a scope at a time.
    const views = (await Promise.all(scopes.map(projectId => readMcpActionAccess(web, { clientId, projectId })))).flatMap(access => access.actions);
    const goals = new Set(Object.values(goalsActions).map(action => action.capability_id));
    const wanted = new Set([...goals, ...also.map(action => action.capability_id)]);
    if (!views.some(view => view.action.scope === "project" && goals.has(view.capability_id))) {
      throw new Error(`No Goals action is offered to ${clientId} in project ${project.project_id}: is the project in the Home's catalog?`);
    }
    for (const asked of also) {
      if (!views.some(view => view.capability_id === asked.capability_id)) {
        throw new Error(`${asked.capability_id} is not offered to ${clientId} in project ${project.project_id}: is its plugin installed there, and is it an action a model's client may hold?`);
      }
    }
    const ordered = orderGrantViews(views.filter(view => wanted.has(view.capability_id)));
    for (let from = 0; from < ordered.length;) {
      const first = ordered[from]!;
      let to = from + 1;
      while (to < ordered.length && to - from < SAVED_TOGETHER && !first.action.required_scene && !ordered[to]!.action.required_scene
        && ordered[to]!.action.scope === first.action.scope) to++;
      const group = ordered.slice(from, to), selected = group[group.length - 1]!;
      try {
        await grantMcpAction(web, { clientId, projectId: selected.action.scope === "home" ? null : project.project_id, action: reference(selected),
          ...(group.length > 1 ? { with: group.slice(0, -1).map(reference) } : {}) });
      } catch (error) {
        if (!isLocalHostHttpError(error)) throw error;
        throw localHostHttpError(error.status, error.code, `${group.map(view => view.capability_id).join(", ")}: ${error.message}`, error.method, error.path);
      }
      from = to;
    }
    const saved = await Promise.all(scopes.map(projectId => readMcpActionAccess(web, { clientId, projectId })));
    return saved.flatMap(access => access.grants).filter(row => wanted.has(row.capability_id));
  } finally { await served?.close(); }
}
