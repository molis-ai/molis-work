import type { IncomingMessage, ServerResponse } from "node:http";
import type { HomeBackgroundTasksReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { sendLocalWebJson } from "./web-http.js";
import { pluginPageRequest } from "./plugin-page-authority.js";

/** Where each part of what waits on the person is read; every reader belongs to the part's owner. */
export interface AttentionSources {
  /**
   * Background tasks running or waiting on the person, in open and resting projects, as the plugins that own them say (`home-background-tasks.ts`).
   * Only on the Home page, whose title bar lists them; a project page reads its own tasks with its line (specs/work-line §4.5).
   */
  backgroundTasks?(): HomeBackgroundTasksReadResult | Promise<HomeBackgroundTasksReadResult>;
  /** The Assistant's notices for the surface the person is on. */
  notices(surface: string | null): Promise<unknown[]>;
  /** Plugin deliveries waiting in the market; only where a project's plugins run. */
  pluginEventsPending?(): Promise<number>;
  /** The project's event cursor: the page refreshes what it shows from the board when it moved (only on a project page). */
  boardCursor?(): number;
  /**
   * The project's work line and the tasks behind it, read as the person through the mainline service (only on a project page, and
   * not for a plugin's page). The bottom line, its waiting count and the task panel paint from this one read: none of them has a
   * beat of its own (specs/work-line contract-design §11).
   */
  mainline?: { line(): Promise<{ table: unknown }> } | null;
  /**
   * Hear that something this page shows may have changed (`attention-changes.ts`): the page's one stream (`GET /api/attention/events`)
   * says so with no content, and the page reads `/api/attention` again. The returned function stops it.
   */
  changes?(listener: () => void): () => void;
}

/**
 * `GET /api/attention`: what waits on the person, read in one request (W4-10). The page has a single subscription for it,
 * read while the page is visible and again when the person comes back, moves to another surface or acts; the Home page's
 * title bar, the Assistant's bell and its plugin notification count, and on a project page the work line and the task panel,
 * paint from the one answer. A part whose reader fails is null and
 * the page keeps what it last showed for that part; Home also marks its background list incomplete. The others still answer.
 */
export async function handleAttentionHttp(request: IncomingMessage, response: ServerResponse, url: URL, sources: AttentionSources): Promise<boolean> {
  if (request.method === "GET" && url.pathname === "/api/attention/events" && sources.changes) { attentionEvents(request, response, sources.changes); return true; }
  if (request.method !== "GET" || url.pathname !== "/api/attention") return false;
  const part = async <T>(read: () => T | Promise<T>): Promise<T | null> => {
    try { return await read(); } catch { return null; /* that part keeps its last answer on the page */ }
  };
  const surface = url.searchParams.get("surface") || null;
  const absent = Promise.resolve(null), mainline = sources.mainline;
  const [background_tasks, notices, plugin_events_pending, board_cursor, line] = await Promise.all([
    sources.backgroundTasks ? part(() => sources.backgroundTasks!()) : absent, part(() => sources.notices(surface)),
    sources.pluginEventsPending ? part(() => sources.pluginEventsPending!()) : Promise.resolve(0), sources.boardCursor ? part(() => sources.boardCursor!()) : absent,
    mainline ? part(() => mainline.line()) : absent]);
  // The task panel's table is the one the line was placed with: read once, sent beside the line it came with.
  sendLocalWebJson(response, 200, { background_tasks, notices, plugin_events_pending, board_cursor, line, tasks: line ? line.table : null });
  return true;
}

/**
 * `GET /api/attention/events`: the word that what waits on the person may have changed (WLN-27, user decision 2026-11-15), as one
 * `changed` event with no content; the page reads `/api/attention` again on it. The stream opens with one, so a page that comes back
 * reads at once, and the page tells a lost connection from the stream ending: there is no beat. A plugin's page has no such stream:
 * the line and the tasks are not in its answer either.
 */
function attentionEvents(request: IncomingMessage, response: ServerResponse, changes: NonNullable<AttentionSources["changes"]>): void {
  if (pluginPageRequest(request)) { sendLocalWebJson(response, 403, { error: "forbidden", message: "插件页面不读这个通道" }); return; }
  response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" });
  response.flushHeaders();
  const send = () => { if (!response.writableEnded) response.write("event: changed\ndata: {}\n\n"); };
  const stop = changes(send);
  response.once("close", stop);
  send();
}
