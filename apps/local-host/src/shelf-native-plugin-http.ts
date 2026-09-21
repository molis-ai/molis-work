import type { IncomingMessage, ServerResponse } from "node:http";
import {
  ShelfPluginRouteTable,
  createShelfRouteHandlers,
  shelfRouteErrorResponse,
  type ShelfPluginRouteResponse,
} from "@molis-ai/molis-work-plugin-shelf";
import { openShelfStore, type ShelfRuntimeProbe } from "@molis-ai/molis-work-module-shelf";
import { dispatchNativePluginJsonHttp, writeNativePluginJsonResponse } from "./native-plugin-http.js";

export async function handleShelfNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string,
): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, {
    prefix: "/api/shelf",
    maxBodyBytes: 48_000_000,
    async handle(input) {
      const store = openShelfStore(homeDirectory, shelfRuntimeProbe());
      return new ShelfPluginRouteTable(createShelfRouteHandlers({
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
