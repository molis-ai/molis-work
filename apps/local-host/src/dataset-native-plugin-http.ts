import type { IncomingMessage, ServerResponse } from "node:http";
import {
  DatasetPluginRouteTable,
  createDatasetRouteHandlers,
  datasetRouteErrorResponse,
  openDatasetStore,
  type DatasetRoutePorts,
} from "@molis-ai/molis-work-plugin-dataset";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";

export async function handleDatasetNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string,
  ports: DatasetRoutePorts = {},
): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, {
    prefix: "/api/dataset",
    async handle(input) {
      const store = openDatasetStore(homeDirectory);
      try {
        return await new DatasetPluginRouteTable(createDatasetRouteHandlers(store, ports)).handle(input);
      } finally {
        store.close();
      }
    },
    mapError: datasetRouteErrorResponse,
  });
}
