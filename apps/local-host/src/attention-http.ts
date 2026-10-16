import type { IncomingMessage, ServerResponse } from "node:http";
import { sendLocalWebJson } from "./web-http.js";

/** Where each part of what waits on the person is read; every reader belongs to the part's owner. */
export interface AttentionSources {
  /** Coding sessions running or waiting on the person, in every project (the title bar's background tasks). */
  backgroundTasks(): unknown[] | Promise<unknown[]>;
  /** The Assistant's notices for the surface the person is on. */
  notices(surface: string | null): Promise<unknown[]>;
  /** Plugin deliveries waiting in the market; only where a project's plugins run. */
  pluginEventsPending?(): Promise<number>;
  /** The project's event cursor: the page refreshes what it shows from the board when it moved (only on a project page). */
  boardCursor?(): number;
}

/**
 * `GET /api/attention`: what waits on the person, read in one request (W4-10). The page has a single subscription for it,
 * read while the page is visible and again when the person comes back, moves to another surface or acts; the title bar,
 * the Assistant's bell and its plugin notification count paint from the one answer. A part whose reader fails is null and
 * the page keeps what it last showed for that part, as each separate read did before; the others still answer.
 */
export async function handleAttentionHttp(request: IncomingMessage, response: ServerResponse, url: URL, sources: AttentionSources): Promise<boolean> {
  if (request.method !== "GET" || url.pathname !== "/api/attention") return false;
  const part = async <T>(read: () => T | Promise<T>): Promise<T | null> => {
    try { return await read(); } catch { return null; /* that part keeps its last answer on the page */ }
  };
  const surface = url.searchParams.get("surface") || null;
  const [background_tasks, notices, plugin_events_pending, board_cursor] = await Promise.all([part(() => sources.backgroundTasks()), part(() => sources.notices(surface)),
    sources.pluginEventsPending ? part(() => sources.pluginEventsPending!()) : Promise.resolve(0), sources.boardCursor ? part(() => sources.boardCursor!()) : Promise.resolve(null)]);
  sendLocalWebJson(response, 200, { background_tasks, notices, plugin_events_pending, board_cursor });
  return true;
}
