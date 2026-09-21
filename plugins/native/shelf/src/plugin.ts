import type { ArtifactReference, ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { parseShelfTextMaterial, type ShelfArtifactPreview, type ShelfItemRecord, type ShelfSnapshot } from "@molis-ai/molis-work-contracts/modules/shelf";
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

export interface ShelfResultPorts {
  references(): ArtifactReference[];
  preview(record: ArtifactVersionRecord): ShelfArtifactPreview;
  receive(preview: ShelfArtifactPreview): { item: ShelfItemRecord; snapshot: ShelfSnapshot };
}

/** Project output uses the real Runtime grants and durable input graph. */
export function createShelfPlugin(results?: ShelfResultPorts): PluginDefinition {
  return { manifest: shelfManifest, async start(context) {
    for (const permission of shelfManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const outputs = context.services?.outputs;
    if (!outputs) throw new Error("项目材料输出尚未连接");
    const preview = (ref: ArtifactReference) => {
      if (!results) throw new Error("项目成果接收尚未装配");
      const record = context.services!.artifacts.read(ref);
      if (!record || record.lifecycle_state !== "active" || record.availability !== "available") throw new Error("原成果已归档、不可用或不存在");
      return results.preview(record);
    };
    const guarded = (read: () => unknown) => {
      try { return { status: 200, body: read() }; }
      catch (error) { return { status: 400, body: { error: error instanceof Error ? error.message : "成果读取失败" } }; }
    };
    return { kind: "app",
      // Inputs nominate exact candidates; receiving always requires the explicit route confirmation.
      onUpstreamReady: () => {},
      views: [shelfUiContribution, shelfSettingsUiContribution], routes: [
      { route_id: "shelf.project-results", handle: () => guarded(() => {
        if (!results) throw new Error("项目成果接收尚未装配");
        const connected = ["coding-report", "coding-changeset"].flatMap(port => { const ref = context.services?.inputs?.reference(port); return ref ? [ref] : []; });
        const refs = [...connected, ...results.references()];
        const seen = new Set<string>();
        return { results: refs.flatMap(ref => {
          const key = JSON.stringify(ref); if (seen.has(key)) return []; seen.add(key);
          try { const value = preview(ref); return [{ reference: value.source.reference, title: value.title, connected: connected.some(item => item.artifact_id === ref.artifact_id && item.version === ref.version) }]; }
          catch { return []; }
        }) };
      }) },
      { route_id: "shelf.project-result-preview", handle: request => guarded(() => preview(reference({ artifact_id: request.query?.artifact_id, version: Number(request.query?.version) }))) },
      { route_id: "shelf.project-result-receive", handle: request => guarded(() => {
        const body = request.body as Record<string, unknown> | null;
        const value = preview(reference(body?.reference));
        if (body?.expected_fingerprint !== value.fingerprint) throw new Error("成果与已查看的版本不一致，请重新预览后接收");
        return results!.receive(value);
      }) },
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
