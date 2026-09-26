import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { openServerDatabase, Identity, ServerEvents, ContinuityService, createServerRequestHandler, createImDomain } from "@molis-ai/molis-work-server";
import { renderImPage, IM_STYLES, IM_CLIENT_SCRIPT } from "@molis-ai/molis-work-im-ui";

/** Only the IM surface is mounted here; the shared server owns identity and transport. */
export function createLocalImServer(homeDirectory: string) {
  let resources: ReturnType<typeof initialize> | null = null;
  let stopping = false;

  function initialize() {
    // The standalone launcher takes an explicit --state; use this directory to share state.
    const storage = openServerDatabase(join(homeDirectory, "server"));
    try {
      const identity = new Identity(storage.db), events = new ServerEvents(storage.db);
      const continuity = new ContinuityService(storage.db, identity, events, () => {
        throw new Error("The local IM mount does not expose project continuity actions");
      });
      return { storage, events, options: { identity, events, continuity,
        im: createImDomain({ db: storage.db, identity, events }),
        imAssets: { html: renderImPage({ embedded: true }), css: IM_STYLES, script: IM_CLIENT_SCRIPT },
      } };
    } catch (error) { storage.close(); throw error; }
  }

  return {
    async handle(request: IncomingMessage, response: ServerResponse, url: URL, listeningOrigin: string): Promise<boolean> {
      if (url.pathname !== "/im" && !url.pathname.startsWith("/im/")) return false;
      if (stopping) {
        response.writeHead(503, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify({ code: "im.stopping", error: "工作台正在关闭，请稍后重新连接" }));
        return true;
      }
      const host = request.headers.host;
      let origin: string;
      try {
        const address = new URL(`http://${host ?? ""}`), listening = new URL(listeningOrigin);
        if (!host || host !== address.host || !["127.0.0.1", "localhost", "[::1]"].includes(address.hostname)
          || (address.port || "80") !== (listening.port || "80")) throw new Error("host mismatch");
        origin = address.origin;
      } catch {
        response.writeHead(403, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify({ code: "server.host_denied", error: "群聊服务地址不匹配" }));
        return true;
      }
      const current = resources ??= initialize();
      // A per-request closure supports local aliases without sharing mutable Origin state.
      await createServerRequestHandler(current.options, () => origin)(request, response);
      return true;
    },
    /** End SSE before http.Server.close waits for its active connections. */
    stop(): void { stopping = true; resources?.events.close(); },
    /** The host calls this after HTTP requests finish; no request can use a closed DB. */
    close(): void {
      stopping = true;
      const current = resources;
      resources = null;
      if (current) { current.events.close(); current.storage.close(); }
    },
  };
}
