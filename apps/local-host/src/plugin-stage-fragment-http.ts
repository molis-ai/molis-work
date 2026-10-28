import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import type { MolisWorkWebView, WorkbenchRenderer } from "@molis-ai/molis-work-app-workbench";
import { sendLocalWebJson } from "./web-http.js";

export const PLUGIN_STAGE_PREFIX = "/api/stage/";

type FeedItemDetail = Parameters<WorkbenchRenderer["renderPersistedFeedItemDetail"]>[0];

export interface PluginStageFragmentPorts {
  /** The plugins this project shows: a stage of one it does not have is refused, not drawn. */
  readonly shown: () => Promise<readonly string[]>;
  readonly renderer: Pick<WorkbenchRenderer, "renderInboxWorkbenchFragment" | "renderFeedWorkbenchFragment" | "renderPersistedFeedItemDetail">;
  readonly readWebView: () => Promise<MolisWorkWebView>;
  /** Drops the page's cached view: the page asks for a stage after it changed something, and must see that change. */
  readonly invalidateWebView: () => void;
  readonly routePrefix: string;
  /** One Feed item as the person reads it, with what its reader offers: read through Feed's own actions, never from its library. */
  readonly feedItem: (itemId: string) => Promise<{ item: FeedItemDetail; inboxActive: boolean; promoteAvailable: boolean }>;
}

const FEED_ITEM_STAGE = /^feed\/items\/([^/]+)$/;

/**
 * `GET /api/stage/<plugin>`: a stage the page redraws in place after a change, drawn by the shell from the same page view as the page
 * itself; `GET /api/stage/feed/items/<item_id>` is one Feed item's reader. The plugin owns what the stage shows (its actions and its
 * routes under /api/plugins/<plugin_id>/); the shell owns drawing it.
 */
export async function handlePluginStageFragmentHttp(request: IncomingMessage, response: ServerResponse, url: URL, ports: PluginStageFragmentPorts): Promise<boolean> {
  if (request.method !== "GET" || !url.pathname.startsWith(PLUGIN_STAGE_PREFIX)) return false;
  const stage = url.pathname.slice(PLUGIN_STAGE_PREFIX.length);
  const itemId = FEED_ITEM_STAGE.exec(stage)?.[1];
  const plugin = itemId !== undefined ? "feed" : stage;
  const draw = itemId !== undefined ? () => feedItemDetail(decodeURIComponent(itemId), url, ports)
    : stage === "inbox" ? async () => ports.renderer.renderInboxWorkbenchFragment(await ports.readWebView())
    : stage === "feed" ? async () => ports.renderer.renderFeedWorkbenchFragment(await ports.readWebView())
    : undefined;
  if (!draw) return false;
  try {
    if (!(await ports.shown()).includes(plugin)) throw new ActionError("actions.plugin_disabled", "此项目未启用该插件");
    ports.invalidateWebView();
    const html = await draw();
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    response.end(html);
  } catch (error) {
    const refusal = actionErrorResponse(error);
    sendLocalWebJson(response, refusal.status, refusal.body);
  }
  return true;
}

async function feedItemDetail(itemId: string, url: URL, ports: PluginStageFragmentPorts): Promise<string> {
  const { item, inboxActive, promoteAvailable } = await ports.feedItem(itemId);
  return ports.renderer.renderPersistedFeedItemDetail(item, ports.routePrefix, { entryId: itemId, inboxActive, promoteAvailable, inboxEntry: null,
    surface: url.searchParams.get("surface") === "frame-block" ? "frame-block" : undefined });
}
