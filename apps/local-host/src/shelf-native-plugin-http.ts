import { SHELF_TEXT_MATERIAL_TYPE, type ShelfTextMaterial } from "@molis-ai/molis-work-contracts/modules/shelf";
import type { ArtifactsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  ShelfPluginRouteTable,
  createShelfRouteHandlers,
  shelfRouteErrorResponse,
  type ShelfPluginRouteResponse,
  type ShelfRouteHandlerPorts,
  shelfManifest,
} from "@molis-ai/molis-work-plugin-shelf";
import { openShelfStore, type ShelfRuntimeProbe } from "@molis-ai/molis-work-module-shelf";
import { dispatchNativePluginJsonHttp, writeNativePluginJsonResponse } from "./native-plugin-http.js";

export async function handleShelfNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string,
  projectMaterials?: ShelfRouteHandlerPorts["projectMaterials"],
): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, {
    prefix: "/api/shelf",
    maxBodyBytes: 48_000_000,
    async handle(input) {
      const store = openShelfStore(homeDirectory, shelfRuntimeProbe());
      return new ShelfPluginRouteTable(createShelfRouteHandlers({
        projectMaterials,
        snapshot: () => store.snapshot(),
        settings: () => store.settings(),
        saveSettings: (patch) => store.saveSettings(patch),
        admit: (input) => store.admit(input),
        admitText: (text, title, capture) => store.admitText(text, title, capture),
        admitFolder: (input) => store.admitFolder(input),
        readChild: (itemId, relative) => store.readChild(itemId, relative),
        seedSample: () => store.seedSample(),
        hide: (itemId) => store.hide(itemId),
        deleteCopy: (itemId) => store.deleteCopy(itemId),
        runJob: (job) => store.runJob(job),
        cancelJob: (jobId) => store.cancelJob(jobId),
        useAsMaterial: (itemId) => store.useAsMaterial(itemId),
        addClipboard: (text, extra) => store.addClipboard(text, extra),
        clipboardToMaterial: (clipId) => store.clipboardToMaterial(clipId),
        deleteClipboard: (clipId) => store.deleteClipboard(clipId),
        writeCopy: (itemId, text) => store.writeCopy(itemId, text),
        readFile: (itemId) => store.readFile(itemId),
      })).handle(input);
    },
    mapError: shelfRouteErrorResponse,
    write: (res, result) => writeShelfResponse(res, result as ShelfPluginRouteResponse),
  });
}

/**
 * Agent discovery follows the real PATH. An isolated trial or a test pins it,
 * the same way `--home` pins the shelf itself.
 */
export function shelfRuntimeProbe(): ShelfRuntimeProbe {
  const search = process.env.MOLIS_WORK_SHELF_AGENT_PATH;
  const preferred = process.env.MOLIS_WORK_SHELF_AGENT;
  if (preferred === "off") return { disabled: true };
  return {
    ...(search === undefined ? {} : { pathEnvironment: search }),
    ...(preferred ? { preferred } : {}),
  };
}

function writeShelfResponse(response: ServerResponse, result: ShelfPluginRouteResponse): void {
  if (result.bytes) {
    const filename = result.filename || "shelf-file";
    response.writeHead(result.status, {
      "content-type": result.mime || "application/octet-stream",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
      ...result.headers,
    });
    response.end(Buffer.from(result.bytes));
    return;
  }
  writeNativePluginJsonResponse(response, result);
}

/** Composition joins personal Shelf copies to the existing project Artifact store. */
export function shelfProjectMaterials(artifacts: ArtifactsApplicationApi, boardId: string, actorId: string, title: string) {
  return { title, publish(payload: ShelfTextMaterial) {
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
  } };
}
