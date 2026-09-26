import { bindPluginActionRoute } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { shelfManifest } from "./manifest.js";
import { shelfUiContribution } from "./ui.js";
import { shelfSettingsUiContribution } from "./settings-ui.js";
import { shelfRuntimeActionHandlers, shelfRuntimeActions, type ShelfResultPorts } from "./runtime-actions.js";

export type { ShelfResultPorts } from "./runtime-actions.js";

/** Project output uses the real Runtime grants and durable input graph. */
export function createShelfPlugin(results?: ShelfResultPorts): PluginDefinition {
  return { manifest: shelfManifest, async start(context) {
    for (const permission of shelfManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    if (!context.services?.outputs) throw new Error("项目材料输出尚未连接");
    const body = (value: unknown) => (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    return { kind: "app",
      // Inputs nominate exact candidates; receiving always requires the explicit route confirmation.
      onUpstreamReady: () => {},
      views: [shelfUiContribution, shelfSettingsUiContribution],
      actions: shelfRuntimeActionHandlers(context, results),
      // The old routes only translate parameters; execution is the same registered action MCP and Agents call.
      routes: [
        bindPluginActionRoute(context, shelfRuntimeActions.results, () => ({}), "shelf.project-results"),
        bindPluginActionRoute(context, shelfRuntimeActions.preview, request => ({ reference: { artifact_id: request.query?.artifact_id ?? "", version: Number(request.query?.version) } }), "shelf.project-result-preview"),
        bindPluginActionRoute(context, shelfRuntimeActions.receive, request => ({ reference: body(request.body).reference as never,
          expected_fingerprint: String(body(request.body).expected_fingerprint ?? "") }), "shelf.project-result-receive"),
        bindPluginActionRoute(context, shelfRuntimeActions.output, () => ({}), "shelf.material-output"),
        bindPluginActionRoute(context, shelfRuntimeActions.selectOutput, request => ({ reference: body(request.body).reference as never,
          // An explicit null means "no output yet"; a missing field stays missing and is rejected.
          expected_reference: body(request.body).expected_reference as never }), "shelf.select-material-output"),
      ] };
  } };
}
