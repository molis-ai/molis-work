import type { IncomingMessage, ServerResponse } from "node:http";
import { JellyPluginRouteTable, jellyRouteErrorResponse, openJellyStore, type JellyAiPorts } from "@molis-ai/molis-work-plugin-jelly";
import { extractJellyMaterial, readStoredJellyMaterial, type JellyMaterialUpload } from "./jelly-native-material.js";
import { dispatchNativePluginJsonHttp, readNativePluginJsonBody, type NativePluginJsonResult } from "./native-plugin-http.js";
import { readJellyMaterialSource } from "./jelly-source-providers.js";
import { createJellyCompletion, readJellyModelSettings, saveJellyModelSettings, type JellyModelInput } from "./jelly-model.js";

export async function handleJellyNativePluginHttp(request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string, ports: JellyAiPorts = {}): Promise<boolean> {
  const handle = async (input: { method: "GET" | "POST"; pathname: string; query: URLSearchParams; body: Record<string, unknown> }, progress?: JellyAiPorts["onProgress"]): Promise<NativePluginJsonResult | null> => {
    const controller = new AbortController();
    const cancel = () => { if (!response.writableEnded) controller.abort(); };
    response.once("close", cancel);
    try {
      if (input.method === "POST" && input.pathname === "/api/jelly/material") return { status: 200, body: await extractJellyMaterial(homeDirectory, input.body as unknown as JellyMaterialUpload, { signal: controller.signal, onProgress: progress }) };
      if (input.method === "POST" && input.pathname === "/api/jelly/material/reread") return { status: 200, body: await readStoredJellyMaterial(homeDirectory, input.body as unknown as { file_name: string; sha256: string; allow_model_download?: boolean }, { signal: controller.signal, onProgress: progress }) };
      if (input.method === "POST" && input.pathname === "/api/jelly/source") {
        if (typeof input.body.url !== "string" || (input.body.allow_model_download !== undefined && typeof input.body.allow_model_download !== "boolean")) throw new Error("来源地址或下载选项无效");
        return { status: 200, body: await readJellyMaterialSource(homeDirectory, input.body.url, { allow_model_download: input.body.allow_model_download as boolean | undefined, signal: controller.signal, onProgress: progress }) };
      }
      if (input.pathname === "/api/jelly/model-settings") return { status: 200, body: input.method === "GET" ? readJellyModelSettings(homeDirectory) : saveJellyModelSettings(homeDirectory, input.body as JellyModelInput) };
      const store = openJellyStore(homeDirectory);
      try {
        return await new JellyPluginRouteTable(store, {
          readSource: source => readJellyMaterialSource(homeDirectory, source, { signal: controller.signal, onProgress: progress }),
          ...ports, completeText: ports.completeText ?? createJellyCompletion(homeDirectory), signal: controller.signal, onProgress: progress,
        }).handle(input);
      } finally { store.close(); }
    } finally { response.off("close", cancel); }
  };
  if (request.method === "POST" && ["/api/jelly/material", "/api/jelly/material/reread", "/api/jelly/source", "/api/jelly/ai"].includes(url.pathname) && url.searchParams.get("stream") === "1") {
    const write = (value: unknown) => { if (!response.destroyed) response.write(JSON.stringify(value) + "\n"); };
    try {
      const body = await readNativePluginJsonBody(request, 36_000_000);
      response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      write({ type: "progress", stage: url.pathname.endsWith("/ai") ? "summarizing" : "extracting", progress: 0 });
      const result = await handle({ method: "POST", pathname: url.pathname, query: url.searchParams, body }, progress => write({ type: "progress", ...progress }));
      if (result) write({ type: "result", result: result.body });
    } catch (error) {
      if (!response.headersSent) response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" });
      const result = jellyRouteErrorResponse(error); write({ type: "error", status: result.status, ...result.body as object });
    } finally { if (!response.destroyed) response.end(); }
    return true;
  }
  return dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/jelly", maxBodyBytes: 36_000_000, handle, mapError: jellyRouteErrorResponse });
}
