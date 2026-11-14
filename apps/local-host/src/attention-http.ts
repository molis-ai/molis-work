import type { IncomingMessage, ServerResponse } from "node:http";
import { sendLocalWebJson } from "./web-http.js";

/** Where each part of what waits on the person is read; every reader belongs to the part's owner. */
export interface AttentionSources {
  /**
   * Background tasks running or waiting on the person, in every open project, as the plugins that own them say (`home-background-tasks.ts`).
   * Only on the Home page, whose title bar lists them; a project page reads its own tasks with its line (specs/work-line §4.5).
   */
  backgroundTasks?(): unknown[] | Promise<unknown[]>;
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
  mainline?: { line(): Promise<unknown>; tasks(): Promise<unknown> } | null;
}

/**
 * `GET /api/attention`: what waits on the person, read in one request (W4-10). The page has a single subscription for it,
 * read while the page is visible and again when the person comes back, moves to another surface or acts; the Home page's
 * title bar, the Assistant's bell and its plugin notification count, and on a project page the work line and the task panel,
 * paint from the one answer. A part whose reader fails is null and
 * the page keeps what it last showed for that part, as each separate read did before; the others still answer.
 */
export async function handleAttentionHttp(request: IncomingMessage, response: ServerResponse, url: URL, sources: AttentionSources): Promise<boolean> {
  if (request.method !== "GET" || url.pathname !== "/api/attention") return false;
  const part = async <T>(read: () => T | Promise<T>): Promise<T | null> => {
    try { return await read(); } catch { return null; /* that part keeps its last answer on the page */ }
  };
  const surface = url.searchParams.get("surface") || null;
  const absent = Promise.resolve(null), mainline = sources.mainline;
  const [background_tasks, notices, plugin_events_pending, board_cursor, line, tasks] = await Promise.all([
    sources.backgroundTasks ? part(() => sources.backgroundTasks!()) : absent, part(() => sources.notices(surface)),
    sources.pluginEventsPending ? part(() => sources.pluginEventsPending!()) : Promise.resolve(0), sources.boardCursor ? part(() => sources.boardCursor!()) : absent,
    mainline ? part(() => mainline.line()) : absent, mainline ? part(() => mainline.tasks()) : absent]);
  sendLocalWebJson(response, 200, { background_tasks, notices, plugin_events_pending, board_cursor, line, tasks });
  return true;
}
