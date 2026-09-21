import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { parseShelfTextMaterial } from "@molis-ai/molis-work-contracts/modules/shelf";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { shelfManifest } from "./manifest.js";
import { shelfUiContribution } from "./ui.js";
import { shelfSettingsUiContribution } from "./settings-ui.js";

function reference(value: unknown): ArtifactReference {
  const item = value as Partial<ArtifactReference> | null;
  if (!item || typeof item.artifact_id !== "string" || !item.artifact_id.trim() || item.artifact_id.length > 200
    || !Number.isSafeInteger(item.version) || item.version! < 1) throw new Error("材料版本无效");
  return { artifact_id: item.artifact_id, version: item.version! };
}

/** Project output uses the real Runtime grants and durable input graph. */
export function createShelfPlugin(): PluginDefinition {
  return { manifest: shelfManifest, async start(context) {
    for (const permission of shelfManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const outputs = context.services?.outputs;
    if (!outputs) throw new Error("项目材料输出尚未连接");
    return { kind: "app", views: [shelfUiContribution, shelfSettingsUiContribution], routes: [
      { route_id: "shelf.material-output", handle: () => ({ status: 200, body: { reference: outputs.reference("material") } }) },
      { route_id: "shelf.select-material-output", handle(request) {
        try {
          const body = request.body as Record<string, unknown> | null;
          const selected = reference(body?.reference);
          const expected = body?.expected_reference === null ? null : reference(body?.expected_reference);
          const record = context.services!.artifacts.read(selected);
          const material = parseShelfTextMaterial(record?.payload);
          if (selected.artifact_id !== "shelf-material:" + context.board_id + ":" + material.source.item_id) throw new Error("Shelf 材料身份不一致");
          return { status: 200, body: { reference: outputs.select({ port: "material", reference: selected, expected_reference: expected }) } };
        } catch (error) { return { status: 400, body: { error: error instanceof Error ? error.message : "材料输出未更新" } }; }
      } },
    ] };
  } };
}
