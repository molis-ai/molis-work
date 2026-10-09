import type http from "node:http";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

/**
 * Deletions other processes left pending (the CLI, MCP, an earlier Host) wait for owners only a Host has: the Agent
 * runtime's memory and the search index. A Web server runs them as it starts and then every minute while it runs, so a
 * deletion made by another process is finished here without a restart; one that is deferred again (another process
 * holds the runtime) is simply tried at the next tick.
 */
export function finishLeftOverDeletions(server: http.Server, home: string, catalog: { warm(): Promise<unknown>; withCatalog: LocalWebCatalogRunner }, intervalMs = 60_000): void {
  let closed = false, running = false, warned = "";
  const finish = async () => {
    if (closed || running) return;
    running = true;
    try { await runWithMolisWorkHome(home, () => catalog.withCatalog({ homeDirectory: home }, opened => opened.projectDeletion.finishAll())); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!closed && message !== warned) console.warn("[projects] 上次删除项目留下的清理没有做完", warned = message);
    } finally { running = false; }
  };
  const timer = setInterval(() => { void finish(); }, intervalMs);
  timer.unref();
  server.once("close", () => { closed = true; clearInterval(timer); });
  void catalog.warm().then(finish, () => undefined);
}
