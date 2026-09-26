import type { PluginRouteBinding, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindPluginActionRoute, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { gitActions } from "./action-definitions.js";

type InputOf<T> = T extends ActionDefinition<infer Input, unknown> ? Input : never;

export function gitRoutes(context: PluginStartContext): PluginRouteBinding[] {
  return [bindPluginActionRoute(context, gitActions.state, () => ({})),
    bindPluginActionRoute(context, gitActions.results, () => ({})),
    bindPluginActionRoute(context, gitActions.selectDiff, request => request.body as InputOf<typeof gitActions.selectDiff>),
    bindPluginActionRoute(context, gitActions.prepareIndex, request => {
      // The legacy HTTP caller also sent its selected side; action/revision are authoritative.
      const input = { ...(request.body as InputOf<typeof gitActions.prepareIndex> & { side?: unknown }) };
      delete input.side;
      return input;
    }),
    bindPluginActionRoute(context, gitActions.saveResult, request => request.body as InputOf<typeof gitActions.saveResult>),
    // Source control: the repository's state, whether a PR can be opened, the operations asked for, and a new one.
    bindPluginActionRoute(context, gitActions.summary, () => ({})),
    bindPluginActionRoute(context, gitActions.prSupport, () => ({})),
    bindPluginActionRoute(context, gitActions.conflict, request => ({ path: String(request.query?.path ?? "") })),
    bindPluginActionRoute(context, gitActions.operations, () => ({})),
    bindPluginActionRoute(context, gitActions.prepareOperation, request => request.body as InputOf<typeof gitActions.prepareOperation>)];
}
