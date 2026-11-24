import type { IncomingMessage, ServerResponse } from "node:http";
import { LOCAL_PERSON_ACTOR_ID, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { blueprintActions as a } from "@molis-ai/molis-work-contracts/services/blueprints";
import { onBlueprintProgress } from "./blueprint-host.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { LocalWebComposition } from "./web-composition.js";
import { responseAbortSignal } from "./web-entry-actions.js";
import { readLocalWebBody, refuseLocalWebRequest, respondLocalWebRefusal, sendLocalWebJson } from "./web-http.js";
import { captureWebSessionAuthority, webManagementAuthenticated } from "./web-sessions.js";

/** Baseline and subsequent events share the same actor, preview and page session. Listener setup precedes the asynchronous read. */
async function progress(host: MolisWorkLocalHost, client: BoundActionClient, response: ServerResponse, previewId: string, project: string | null,
  assertCurrent: () => void, opening: string | null) {
  let ready = false, changed = false;
  const send = (event: string, value: unknown) => {
    if (response.destroyed || response.writableEnded) return;
    try { assertCurrent(); response.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`); }
    catch { response.end(); }
  };
  const stop = onBlueprintProgress(host, LOCAL_PERSON_ACTOR_ID, previewId, event => {
    if (!ready) { changed = true; return; }
    if (event.project_id && event.project_id !== project) {
      send("target", { adoption_id: event.adoption_id, project_id: event.project_id, target_created: event.kind !== "accepted" });
    } else send("progress", event);
  });
  response.once("close", stop);
  try {
    do {
      changed = false;
      const library = await client.invoke(a.library, opening === "adoption" ? { adoption_id: previewId } : { preview_id: previewId });
      const record = library.adoptions[0];
      const inTarget = record?.target.kind === "personal" || record?.target.kind === "project" && record.target.project_id === project;
      const status = record && inTarget ? await client.invoke(a.read, { adoption_id: record.adoption_id }) : null;
      const source = library.preview?.source;
      const draft = opening && !record && source?.kind === "draft" ? (await client.invoke(a.draftRead, { draft_id: source.draft_id })).draft : undefined;
      if (response.destroyed) { stop(); return; }
      if (changed) continue;
      assertCurrent();
      response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" });
      response.flushHeaders();
      send("snapshot", { record: record ?? null, target_created: library.target_created, status, ...(opening && { preview: library.preview, draft }) });
      ready = true;
    } while (!ready);
  } catch (error) {
    response.off("close", stop);
    stop();
    throw error;
  }
}

/** Home and project pages use the same actions, with authority derived from the actual request route. */
export async function handleBlueprintHttp(request: IncomingMessage, response: ServerResponse, url: URL, host: MolisWorkLocalHost,
  pageProof: string, composition: LocalWebComposition, reference?: LocalHostProjectReference, assertAccount?: () => void): Promise<boolean> {
  if (request.method === "GET" && url.pathname === "/onboarding" && url.searchParams.has("scene")) {
    if (pluginPageRequest(request)) { refuseLocalWebRequest(response); return true; }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": composition.PAGE_CSP });
    response.end(composition.workbenchRenderer.renderMolisWorkOnboarding({ mode: "scene", currentVersion: null,
      controlToken: pageProof, desktopShell: composition.isDesktopShellRequest(request, url), projectId: reference?.project_id }));
    return true;
  }
  const prefix = "/api/blueprints/";
  if (!url.pathname.startsWith(prefix)) return false;
  if (pluginPageRequest(request) || !webManagementAuthenticated(request)) { refuseLocalWebRequest(response); return true; }
  const session = captureWebSessionAuthority();
  const assertCurrent = () => { session(); assertAccount?.(); };
  const client = bindLocalWebActions(host, reference, LOCAL_OWNER_PERMISSIONS, { signal: responseAbortSignal(response), assertCurrent });
  const path = url.pathname.slice(prefix.length);
  try {
    assertCurrent();
    if (request.method === "GET") {
      const id = url.searchParams.get("id");
      const previewId = url.searchParams.get("preview");
      if (path === "library") sendLocalWebJson(response, 200, await client.invoke(a.library, id ? { adoption_id: id } : previewId ? { preview_id: previewId } : {}));
      else if (path === "draft" && id) sendLocalWebJson(response, 200, await client.invoke(a.draftRead, { draft_id: id }));
      else if (path === "events" && id) await progress(host, client, response, id, reference?.project_id ?? null, assertCurrent, url.searchParams.get("open"));
      else sendLocalWebJson(response, 404, {});
    } else if (request.method === "POST") {
      const input = await readLocalWebBody(request);
      const actions: readonly ActionDefinition[] = [a.preview, a.apply, a.revert, a.remove];
      const action = actions.find(item => item.capability_id === "blueprints.adoption." + path);
      if (!action) sendLocalWebJson(response, 404, {});
      else {
        const result = await client.invoke(action, input);
        if (!response.destroyed) sendLocalWebJson(response, 200, result);
        else if (!response.writableEnded) {
          response.statusCode = 200;
          response.end();
        }
      }
    } else sendLocalWebJson(response, 405, {});
  } catch (error) {
    if (!response.destroyed && !response.headersSent) respondLocalWebRefusal({ respond: (status, body) => sendLocalWebJson(response, status, body) }, error);
  }
  return true;
}
