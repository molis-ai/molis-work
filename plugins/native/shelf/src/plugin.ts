import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { shelfManifest } from "./manifest.js";
import { shelfRuntimeActionHandlers, shelfRuntimeActions } from "./runtime-actions.js";
import { SHELF_INSTRUCTIONS } from "./prompts.js";


/** Coding results offered to Shelf use the real Runtime grants and durable input graph. */
export function createShelfPlugin(): PluginDefinition {
  return { manifest: shelfManifest, instructions: SHELF_INSTRUCTIONS, async start(context) {
    for (const permission of shelfManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const body = (value: unknown) => (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    return { kind: "app",
      // Inputs nominate exact candidates; receiving always requires the explicit route confirmation.
      onUpstreamReady: () => {},
      actions: shelfRuntimeActionHandlers(context, shelfManifest),
      // The old routes only translate parameters; execution is the same registered action MCP and Agents call.
      routes: [
        bindPluginActionRoute(context, shelfRuntimeActions.results, () => ({}), "shelf.project-results"),
        bindPluginActionRoute(context, shelfRuntimeActions.preview, request => ({ reference: { artifact_id: request.query?.artifact_id ?? "", version: Number(request.query?.version) } }), "shelf.project-result-preview"),
        bindPluginActionRoute(context, shelfRuntimeActions.receive, request => ({ reference: body(request.body).reference as never,
          expected_fingerprint: String(body(request.body).expected_fingerprint ?? "") }), "shelf.project-result-receive"),
      ] };
  } };
}
