import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface NativeHttpAnswer {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/**
 * A loopback server around one native plugin HTTP handler (`handleXNativePluginHttp`), for tests of what the Host's edge
 * answers. A handler that rejects instead of answering is reported as status 599 with the error, so a test sees "the error
 * escaped the dispatcher" as a wrong status, not as a hung request.
 */
export async function serveNativeHttp(handle: (request: IncomingMessage, response: ServerResponse, url: URL) => Promise<boolean>): Promise<{
  post(path: string, body: string): Promise<NativeHttpAnswer>;
  /** The answer as text: for a route that streams lines (NDJSON) instead of one JSON document. */
  postText(path: string, body: string): Promise<{ readonly status: number; readonly text: string }>;
  close(): Promise<void>;
}> {
  const server = createServer((request, response) => {
    handle(request, response, new URL(request.url ?? "/", "http://127.0.0.1")).then(handled => {
      if (!handled) { response.statusCode = 404; response.end("{}"); }
    }, (error: unknown) => {
      response.statusCode = 599;
      response.end(JSON.stringify({ escaped: error instanceof Error ? error.message : String(error) }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    async post(path, body) {
      const response = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body });
      return { status: response.status, body: await response.json() as Record<string, unknown> };
    },
    async postText(path, body) {
      const response = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body });
      return { status: response.status, text: await response.text() };
    },
    close: () => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }),
  };
}
