import type { IncomingMessage, ServerResponse } from "node:http";
import { DatasetPluginRouteTable, createDatasetRouteHandlers, datasetRouteErrorResponse,
  type DatasetRoutePorts, type DatasetPluginRouteRequest } from "@molis-ai/molis-work-plugin-dataset";
import { dispatchNativePluginJsonHttp, writeNativePluginJsonResponse } from "./native-plugin-http.js";
import { withRewrittenPluginApi } from "./native-plugin-api.js";

export async function handleDatasetNativePluginHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  ports: (input: DatasetPluginRouteRequest, transport: { signal: AbortSignal }) => DatasetRoutePorts | Promise<DatasetRoutePorts>): Promise<boolean> {
  const routed = withRewrittenPluginApi(url);
  if (routed.pathname !== "/api/dataset" && !routed.pathname.startsWith("/api/dataset/")) return false;
  const controller = new AbortController(), cancel = () => { if (!response.writableEnded) controller.abort(); };
  response.once("close", cancel);
  try { return await dispatchNativePluginJsonHttp(request, response, routed, {
    prefix: "/api/dataset",
    async handle(input) { return new DatasetPluginRouteTable(createDatasetRouteHandlers(await ports(input, { signal: controller.signal }))).handle(input); },
    mapError: datasetRouteErrorResponse,
  }); } catch (error) { writeNativePluginJsonResponse(response, datasetRouteErrorResponse(error)); return true; }
  finally { response.off("close", cancel); }
}
