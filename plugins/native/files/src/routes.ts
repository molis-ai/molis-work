import type { PluginRouteBinding, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindPluginActionRoute } from "@molis-ai/molis-work-contracts/platform/actions";
import { filesActions, type FileInput, type FileCaptureInput } from "./actions.js";

export function filesRoutes(context: PluginStartContext): PluginRouteBinding[] {
  return [bindPluginActionRoute(context, filesActions.state, () => ({})),
    bindPluginActionRoute(context, filesActions.directory, request => ({ workspace_id: request.query.workspace_id!, path: JSON.parse(request.query.path ?? "[]") })),
    bindPluginActionRoute(context, filesActions.open, request => request.body as FileInput),
    bindPluginActionRoute(context, filesActions.capture, request => request.body as FileCaptureInput)];
}
