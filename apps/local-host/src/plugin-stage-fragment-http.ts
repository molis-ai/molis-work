import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import type { MolisWorkWebView, WorkbenchRenderer } from "@molis-ai/molis-work-app-workbench";
import { sendLocalWebJson } from "./web-http.js";

export const PLUGIN_STAGE_PREFIX = "/api/stage/";

export interface PluginStageFragmentPorts {
  /** The plugins this project shows: a stage of one it does not have is refused, not drawn. */
  readonly shown: () => Promise<readonly string[]>;
  readonly renderer: Pick<WorkbenchRenderer, "renderInboxWorkbenchFragment">;
  readonly readWebView: () => Promise<MolisWorkWebView>;
  /** Drops the page's cached view: the page asks for a stage after it changed something, and must see that change. */
  readonly invalidateWebView: () => void;
}

/**
 * `GET /api/stage/<plugin>`: a stage the page redraws in place after a change, drawn by the shell from the same page view as the page
 * itself. The plugin owns what the stage shows (its actions and its routes under /api/plugins/<plugin_id>/); the shell owns drawing it.
 */
export async function handlePluginStageFragmentHttp(request: IncomingMessage, response: ServerResponse, url: URL, ports: PluginStageFragmentPorts): Promise<boolean> {
  if (request.method !== "GET" || !url.pathname.startsWith(PLUGIN_STAGE_PREFIX)) return false;
  const stage = url.pathname.slice(PLUGIN_STAGE_PREFIX.length);
  const draw = stage === "inbox" ? ports.renderer.renderInboxWorkbenchFragment : undefined;
  if (!draw) return false;
  try {
    if (!(await ports.shown()).includes(stage)) throw new ActionError("actions.plugin_disabled", "此项目未启用该插件");
    ports.invalidateWebView();
    const html = draw(await ports.readWebView());
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    response.end(html);
  } catch (error) {
    const refusal = actionErrorResponse(error);
    sendLocalWebJson(response, refusal.status, refusal.body);
  }
  return true;
}
