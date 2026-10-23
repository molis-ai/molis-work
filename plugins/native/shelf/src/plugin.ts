import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginDefinition, PluginOwnerFilesDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { shelfErrors } from "@molis-ai/molis-work-module-shelf";
import { createShelfProjectActionHandlers, shelfProjectActions, type ShelfProjectActionPorts } from "./actions.js";
import { shelfManifest } from "./manifest.js";
import { shelfUiContribution } from "./ui.js";
import { shelfSettingsUiContribution } from "./settings-ui.js";
import { shelfRuntimeActionHandlers, shelfRuntimeActions, type ShelfResultPorts } from "./runtime-actions.js";

export type { ShelfResultPorts } from "./runtime-actions.js";

/** Shelf's own files under the Home: the catalog, the copies on the shelf and the folders of its jobs. Nothing else is Shelf's to write. */
export const SHELF_OWNER_FILES: PluginOwnerFilesDeclaration = {
  store_name: "shelf",
  entries: [{ name: "catalog.json", kind: "file" }, { name: "files", kind: "directory" }, { name: "jobs", kind: "directory" }],
  read_permission: "shelf:read",
  write_permission: "shelf:write",
};

const unassembled = (): never => { throw shelfErrors.unavailable("存到项目资料尚未装配"); };
const NO_MATERIAL: ShelfProjectActionPorts = { readFile: unassembled, publish: unassembled };

/**
 * Shelf's project half: Coding results offered to Shelf use the real Runtime grants and durable input graph, and a personal copy is
 * saved into this project's knowledge as the person who confirmed it.
 */
export function createShelfPlugin(results?: ShelfResultPorts): PluginDefinition {
  return { manifest: shelfManifest, async start(context) {
    for (const permission of shelfManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const body = (value: unknown) => (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    return { kind: "app",
      // Inputs nominate exact candidates; receiving always requires the explicit route confirmation.
      onUpstreamReady: () => {},
      views: [shelfUiContribution, shelfSettingsUiContribution],
      actions: [...shelfRuntimeActionHandlers(context, results, shelfManifest),
        ...createShelfProjectActionHandlers(context.project_id ?? "", results?.material ?? NO_MATERIAL)],
      // The routes only translate parameters; execution is the same registered action MCP and Agents call.
      routes: [
        bindPluginActionRoute(context, shelfRuntimeActions.results, () => ({}), "shelf.project-results"),
        bindPluginActionRoute(context, shelfRuntimeActions.preview, request => ({ reference: { artifact_id: request.query?.artifact_id ?? "", version: Number(request.query?.version) } }), "shelf.project-result-preview"),
        bindPluginActionRoute(context, shelfRuntimeActions.receive, request => ({ reference: body(request.body).reference as never,
          expected_fingerprint: String(body(request.body).expected_fingerprint ?? "") }), "shelf.project-result-receive"),
        bindPluginActionRoute(context, shelfProjectActions.previewMaterial, request => ({ item_id: request.params.item_id ?? "" }), "shelf.material.preview"),
        bindPluginActionRoute(context, shelfProjectActions.saveMaterial, request => ({ item_id: request.params.item_id ?? "",
          expected_fingerprint: String(body(request.body).expected_fingerprint ?? "") }), "shelf.material.save"),
      ] };
  } };
}
