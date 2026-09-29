import type { ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { SHELF_ACTIONS, SHELF_PROJECT_ACTIONS, createShelfActionHandlers, createShelfProjectActionHandlers, shelfManifest } from "@molis-ai/molis-work-plugin-shelf";
import { openShelfStore } from "@molis-ai/molis-work-module-shelf";
import type { MolisWorkProjectRuntime } from "./project-host.js";
import { SHELF_TEXT_MATERIAL_TYPE, type ShelfTextMaterial, type ShelfMaterialPorts } from "@molis-ai/molis-work-contracts/modules/shelf";
import type { ArtifactsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { shelfRuntimeProbe } from "./shelf-native-plugin-http.js";
import { readMaterialWebsite } from "./material-web.js";
import { extractMaterial } from "./material-extraction.js";
import { materialImageTextAvailable } from "./material-native.js";

const provider = (projectId?: string) => ({ provider_id: shelfManifest.plugin_id, plugin_id: shelfManifest.plugin_id, title: shelfManifest.name,
  kind: "plugin" as const, ...(projectId ? { project_id: projectId } : {}) });

/** The personal Shelf belongs to this Home. Each call reads the current store and agent PATH, as the HTTP panel did. */
export function shelfActionProvider(home: string, materials: ShelfMaterialPorts = { readWebsite: readMaterialWebsite, extract: extractMaterial, imageTextAvailable: materialImageTextAvailable }): ActionProviderRegistration {
  const store = () => openShelfStore(home, shelfRuntimeProbe(), materials);
  return { provider: provider(), definitions: SHELF_ACTIONS, handlers: createShelfActionHandlers({
    snapshot: () => store().snapshot(),
    settings: () => store().settings(),
    saveSettings: patch => store().saveSettings(patch),
    admit: (input, control) => store().admitFile(input, control),
    admitText: (text, title, capture, control) => store().admitText(text, title, capture, control),
    admitFolder: input => store().admitFolder(input),
    readChild: (itemId, relative) => store().readChild(itemId, relative),
    seedSample: () => store().seedSample(),
    hide: itemId => store().hide(itemId),
    deleteCopy: itemId => store().deleteCopy(itemId),
    runJob: (job, control) => store().runJob(job, control),
    cancelJob: jobId => store().cancelJob(jobId),
    useAsMaterial: itemId => store().useAsMaterial(itemId),
    addClipboard: (text, extra) => store().addClipboard(text, extra),
    clipboardToMaterial: (clipId, control) => store().clipboardToMaterial(clipId, control),
    deleteClipboard: clipId => store().deleteClipboard(clipId),
    writeCopy: (itemId, text) => store().writeCopy(itemId, text),
    readFile: itemId => store().readFile(itemId),
  }) };
}

/** Saving a personal copy into a project goes through that project's Artifact store, owned by the confirming caller. */
export function shelfProjectActionProvider(runtime: MolisWorkProjectRuntime, home: string): ActionProviderRegistration {
  return { provider: provider(runtime.project_id), definitions: SHELF_PROJECT_ACTIONS, handlers: createShelfProjectActionHandlers(runtime.project_id, {
    readFile: itemId => openShelfStore(home, shelfRuntimeProbe()).readFile(itemId),
    publish: (payload, actorId) => publishShelfMaterial(runtime.coordinator.artifacts, runtime.board_id, actorId, payload),
  }) };
}

/** Joins a personal Shelf copy to the project Artifact store; the confirming caller owns every version. */
export function publishShelfMaterial(artifacts: ArtifactsApplicationApi, boardId: string, actorId: string, payload: ShelfTextMaterial): { artifact_id: string; version: number } {
  const artifactId = "shelf-material:" + boardId + ":" + payload.source.item_id;
  const latest = artifacts.query.latestArtifactVersion(boardId, artifactId);
  if (latest && (latest.owner_actor_id !== actorId || latest.producer_plugin_id !== shelfManifest.plugin_id
    || latest.producer_binding_signature !== shelfManifest.publisher.signature || latest.artifact_type_id !== SHELF_TEXT_MATERIAL_TYPE)) throw new Error("项目材料的原归属不一致");
  // Artifact storage canonicalizes object keys; compare data independently of property order.
  const same = (a: unknown, b: unknown): boolean => {
    const ordered = (v: unknown): string => JSON.stringify(v, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
    return ordered(a) === ordered(b);
  };
  if (latest && latest.lifecycle_state === "active" && latest.availability === "available" && same(latest.payload, payload)) return { artifact_id: latest.artifact_id, version: latest.version };
  const version = (latest?.version ?? 0) + 1;
  const result = artifacts.commands.registerVersion({ board_id: boardId, actor_id: actorId, artifact_id: artifactId, version,
    artifact_type_id: SHELF_TEXT_MATERIAL_TYPE, schema_version: 1,
    producer: { plugin_id: shelfManifest.plugin_id, plugin_version: shelfManifest.version, binding_signature: shelfManifest.publisher.signature },
    content: { kind: "inline", payload: JSON.parse(JSON.stringify(payload)) }, metadata: { title: payload.title, item_id: payload.source.item_id },
    scope: "personal", supersedes_version: latest?.version ?? null });
  return { artifact_id: result.artifact.artifact_id, version: result.artifact.version };
}
