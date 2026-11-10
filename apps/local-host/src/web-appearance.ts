import type { IncomingMessage, ServerResponse } from "node:http";
import type { WorkbenchAppearance, WorkbenchAppearancePorts } from "@molis-ai/molis-work-ui-host";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { appearanceSelectionActions as actions, type TextRef, type UiAppearanceReceipt, type UiDefinitionRef } from "@molis-ai/molis-work-contracts/platform/ui";
import { BASELINE_FONT, BASELINE_SKIN } from "@molis-ai/molis-work-design-system";
import { say } from "@molis-ai/molis-work-plugin-sdk/ui";
import { installedAppearanceChoices, type AppearanceOwner } from "@molis-ai/molis-work-service-appearance";
import { bindLocalWebAction } from "./local-web-actions.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { APPEARANCE_STYLESHEET_HREF } from "./web-assets.js";
import { readLocalWebBody, refuseLocalWebRequest, requestHost, respondLocalWebRefusal, sendLocalWebJson } from "./web-http.js";
import { appearanceLocale, type WebLocale } from "./web-locale.js";
import { captureWebSessionAuthority, webPageToken, webRequestAuthenticated } from "./web-sessions.js";

const selectionPath = "/api/ui/appearance";
const same = (first: UiDefinitionRef, second: UiDefinitionRef): boolean => first.id === second.id && first.revision === second.revision;
function documentAppearance(snapshot: WorkbenchAppearance["snapshot"], selection: WorkbenchAppearance["selection"], selection_revision: number | null): WorkbenchAppearance {
  const baseline = same(snapshot.skin, BASELINE_SKIN.ref) && same(snapshot.font.scheme, BASELINE_FONT.ref) && same(snapshot.font.mono, BASELINE_FONT.ref);
  return { snapshot, selection, selection_revision, stylesheet: baseline ? null : APPEARANCE_STYLESHEET_HREF };
}

const label = (ref: TextRef) => say.text("literal" in ref ? ref : { ...ref, owner: "workbench" });

export function createWorkbenchAppearancePorts(owner: AppearanceOwner<WebLocale>): WorkbenchAppearancePorts {
  return {
    current() {
      const { snapshot, selection, selection_revision } = owner.current(appearanceLocale());
      return documentAppearance(snapshot, selection, selection_revision);
    },
    choices() {
      const { skins, fonts } = installedAppearanceChoices();
      return { stylesheet: APPEARANCE_STYLESHEET_HREF, baseline: { skin: BASELINE_SKIN.ref, font: BASELINE_FONT.ref },
        skins: skins.map(skin => ({ ...skin, name: label(skin.name) })), fonts: fonts.map(font => ({ ...font, name: label(font.name) })) };
    },
  };
}

/** Own the HTTP response lifetime; subscriptions and choices themselves belong to the selected Home. */
export function createAppearanceHttp(owner: AppearanceOwner<WebLocale>, host: MolisWorkLocalHost, controlToken: string, assertAccountCurrent?: () => void) {
  const streams = new Set<ServerResponse>();
  const ports = createWorkbenchAppearancePorts(owner);

  function events(response: ServerResponse): void {
    const sessionCurrent = captureWebSessionAuthority();
    const send = (selection_revision: number) => {
      if (response.writableEnded || response.destroyed) return;
      try { sessionCurrent(); assertAccountCurrent?.(); }
      catch { response.end(); return; }
      response.write(`data: ${JSON.stringify({ selection_revision })}\n\n`);
    };
    const { selection_revision } = owner.current(appearanceLocale());
    const unsubscribe = owner.subscribe(send);
    streams.add(response);
    response.once("close", () => { streams.delete(response); unsubscribe(); });
    response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" });
    response.flushHeaders();
    if (selection_revision !== null) send(selection_revision);
  }

  async function handle(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
    const stream = url.pathname === `${selectionPath}/events`, undo = url.pathname === `${selectionPath}/undo`;
    if (!stream && !undo && url.pathname !== selectionPath) return false;
    // A stream carries the proof from the document that opened it. A current cookie by itself cannot reconnect an old document.
    if (pluginPageRequest(request) || !request.headers["x-molis-work-page-session"] || !webPageToken(request) || !webRequestAuthenticated(request, controlToken)
      || (request.headers.origin !== undefined && request.headers.origin !== `http://${requestHost(request)}`)
      || (request.headers["sec-fetch-site"] !== undefined && request.headers["sec-fetch-site"] !== "same-origin")) {
      refuseLocalWebRequest(response); return true;
    }
    assertAccountCurrent?.();
    if (stream && request.method === "GET") { events(response); return true; }
    const cancel = new AbortController();
    const entry = { signal: cancel.signal, assertCurrent: assertAccountCurrent };
    const disconnected = () => { if (!response.writableFinished) cancel.abort(new ActionError("actions.cancelled", "外观请求连接已断开")); };
    response.once("close", disconnected);
    try {
      if (!stream && !undo && request.method === "GET") {
        const requestId = url.searchParams.get("request_id");
        const view = await bindLocalWebAction(host, undefined, actions.get, entry).invoke(actions.get,
          requestId === null ? {} : { request_id: requestId });
        sendLocalWebJson(response, 200, { current: ports.current(),
          ...(requestId === null ? {} : { recovery: view.recovery, recovery_revision: view.selection_revision }) });
      } else if (!stream && request.method === "POST") {
        const definition: ActionDefinition<unknown, UiAppearanceReceipt> = undo ? actions.undo : actions.apply;
        const input = await readLocalWebBody(request, 8_192);
        const receipt = await bindLocalWebAction(host, undefined, definition, entry).invoke(definition, input);
        const { snapshot } = owner.preview(receipt.selection, appearanceLocale());
        if (!response.destroyed) sendLocalWebJson(response, 200, { receipt, current: documentAppearance(snapshot, receipt.selection, receipt.selection_revision) });
      } else {
        sendLocalWebJson(response, 405, { error: "不支持此操作。" });
      }
    } catch (error) {
      if (!response.destroyed) respondLocalWebRefusal({ respond: (status, body) => sendLocalWebJson(response, status, body) }, error);
    } finally {
      response.off("close", disconnected);
      if (response.destroyed && !response.writableEnded) {
        // The shared transport key settles when the response ends. The owner alone can confirm a dropped write.
        response.statusCode = 503;
        response.end();
      }
    }
    return true;
  }

  return { handle, close() { for (const stream of streams) stream.end(); } };
}
