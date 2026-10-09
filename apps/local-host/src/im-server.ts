import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { openServerDatabase, Identity, ServerEvents, ContinuityService, createServerRequestHandler, createImDomain } from "@molis-ai/molis-work-server";
import { renderImPage, IM_STYLES, IM_CLIENT_SCRIPT } from "@molis-ai/molis-work-im-ui";
import { isLoopbackHostname } from "@molis-ai/molis-work-contracts/platform/loopback";

/** Only the IM surface is mounted here; the shared server owns identity and transport. */
export function createLocalImServer(homeDirectory: string, projectFor?: (id: string) => Promise<{ id: string; title: string } | null>) {
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
      return { storage, events, identity, continuity, options: { identity, events, continuity,
        im: createImDomain({ db: storage.db, identity, events }),
        imAssets: { html: renderImPage({ embedded: true }), css: IM_STYLES, script: IM_CLIENT_SCRIPT },
      } };
    } catch (error) { storage.close(); throw error; }
  }

  return {
    async handle(request: IncomingMessage, response: ServerResponse, url: URL, listeningOrigin: string): Promise<boolean> {
      const connect = url.pathname.match(/^\/projects\/([^/]+)\/api\/im\/connect$/);
      if (!connect && url.pathname !== "/im" && !url.pathname.startsWith("/im/")) return false;
      if (stopping) {
        response.writeHead(503, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify({ code: "im.stopping", error: "工作台正在关闭，请稍后重新连接" }));
        return true;
      }
      const host = request.headers.host;
      let origin: string;
      try {
        const address = new URL(`http://${host ?? ""}`), listening = new URL(listeningOrigin);
        if (!host || host !== address.host || !isLoopbackHostname(address.hostname)
          || (address.port || "80") !== (listening.port || "80")) throw new Error("host mismatch");
        origin = address.origin;
      } catch {
        response.writeHead(403, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify({ code: "server.host_denied", error: "群聊服务地址不匹配" }));
        return true;
      }
      const current = resources ??= initialize();
      // The caller has already verified the local control token and Origin. This
      // operator bridge is unavailable on the shared/public Server transport.
      if (connect) {
        try {
          if (request.method !== 'POST' || !projectFor) throw new Error('不支持此项目连接');
          const project = await projectFor(decodeURIComponent(connect[1]!));
          if (!project) throw new Error('找不到此项目');
          let session = current.identity.session(request);
          const stored = current.storage.db.prepare('SELECT owner_id FROM mw_projects WHERE id=?').get(project.id) as {owner_id: string} | undefined;
          // Possession of the host control token authorizes this local operator.
          // The persisted project owner is the authority; no browser-supplied ID/name is accepted.
          if (!session?.member_id && stored) {
            const owner = current.storage.db.prepare('SELECT display_name FROM mw_members WHERE id=?').get(stored.owner_id) as {display_name: string};
            const {code} = current.identity.code('bootstrap', stored.owner_id);
            session = current.identity.connect({code, display_name: owner.display_name, device_label: '本机工作台'}, request, response, false);
          }
          if (session?.member_id) {
            const member = current.identity.requireMember(session);
            if (!stored) current.continuity.registerProject({id:project.id,title:project.title,goal_ids:[],artifacts:[]},member.id);
            current.identity.access(session,project.id);
          }
          // A new project without an owner still needs the normal name form.
          response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
          response.end(JSON.stringify({ok:true}));
        } catch (error) {
          response.writeHead(403,{'content-type':'application/json','cache-control':'no-store'});
          response.end(JSON.stringify({error:error instanceof Error ? error.message : '项目连接失败'}));
        }
        return true;
      }
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
