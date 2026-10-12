import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { grantMcpActions, readMcpActionAccess, type LocalHostHttpClient, type McpActionGrantRow } from "@molis-ai/molis-work-test-kit/local-host-http";
import { serveTestHost } from "./test-home.js";

/**
 * Where the grants are saved. A Home directory: a short-lived Host assembled the way the product assembles it serves that Home for
 * the length of the call, so the test's own Host is never reconfigured. A Home has one open Host at a time, so this is only for a
 * test whose own Host is not bound to that Home (it was made without a `homeDirectory`); otherwise the call fails with
 * `inference.home_in_use`. Or the test's own served Host (`serveTestHost`, `openTestHome`): needed when the Host is bound to the
 * Home, or when the actions to grant live on that Host (a provider the test registered on it).
 */
export type GoalsGrantTarget = string | { readonly web: LocalHostHttpClient };

/**
 * Grant a Runtime client every Goals action it may use in a project, through the access settings a person uses: the request is
 * checked against the project in the catalog, the plugin it needs and the actions it depends on, exactly as in the app. `also`
 * grants other actions beside Goals' (an action that writes through Goals needs both). An `also` action the client is not
 * offered is an error, not a skipped line: the project lacks its plugin, or it is not an action a model's client may hold.
 */
export async function grantGoalsMcp(where: GoalsGrantTarget, project: { project_id: string }, clientId = "runtime:codex",
  also: ReadonlyArray<{ capability_id: string }> = []): Promise<McpActionGrantRow[]> {
  const served = typeof where === "string" ? await serveTestHost(null, { home: where }) : null;
  try {
    const web = served?.web ?? (where as { web: LocalHostHttpClient }).web;
    // The project's actions and the Home's: the access page lists a scope at a time.
    const views = (await Promise.all([project.project_id, null].map(projectId => readMcpActionAccess(web, { clientId, projectId })))).flatMap(access => access.actions);
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
    return await grantMcpActions(web, { clientId, projectId: project.project_id, actions: views.filter(view => wanted.has(view.capability_id)) });
  } finally { await served?.close(); }
}
