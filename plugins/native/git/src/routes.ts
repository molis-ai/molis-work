import type { PluginRouteBinding, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { gitActions } from "./action-definitions.js";

type InputOf<T> = T extends ActionDefinition<infer Input, unknown> ? Input : never;

/** The folder a page read names (page state), or none for the project's output. */
const named = (request: { query?: Record<string, string | undefined> }) => request.query?.workspace_id ? { workspace_id: request.query.workspace_id } : {};

export function gitRoutes(context: PluginStartContext): PluginRouteBinding[] {
  return [bindPluginActionRoute(context, gitActions.state, named),
    bindPluginActionRoute(context, gitActions.results, named),
    bindPluginActionRoute(context, gitActions.selectDiff, request => request.body as InputOf<typeof gitActions.selectDiff>),
    bindPluginActionRoute(context, gitActions.prepareIndex, request => request.body as InputOf<typeof gitActions.prepareIndex>),
    bindPluginActionRoute(context, gitActions.saveResult, request => request.body as InputOf<typeof gitActions.saveResult>),
    // Source control: the repository's state, whether a PR can be opened, the operations asked for, and a new one.
    bindPluginActionRoute(context, gitActions.summary, named),
    bindPluginActionRoute(context, gitActions.prSupport, named),
    bindPluginActionRoute(context, gitActions.conflict, request => ({ path: String(request.query?.path ?? ""), ...named(request) })),
    bindPluginActionRoute(context, gitActions.operations, named),
    bindPluginActionRoute(context, gitActions.prepareOperation, request => request.body as InputOf<typeof gitActions.prepareOperation>)];
}
