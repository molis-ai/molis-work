import type http from "node:http";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { PeriodicTasks } from "./periodic-tasks.js";
import { hostLog } from "./host-log.js";

/**
 * Deletions other processes left pending (the CLI, MCP, an earlier Host) wait for owners only a Host has: the Agent
 * runtime's memory and the search index. A Web server runs them as it starts and then every minute while it runs, so a
 * deletion made by another process is finished here without a restart; one that is deferred again (another process
 * holds the runtime) is simply tried at the next tick.
 */
export function finishLeftOverDeletions(server: http.Server, home: string, catalog: { warm(): Promise<unknown>; withCatalog: LocalWebCatalogRunner }, periodic: PeriodicTasks, intervalMs = 60_000): void {
  let closed = false, running = false, warned = "";
  const finish = async () => {
    if (closed || running) return;
    running = true;
    try { await runWithMolisWorkHome(home, () => catalog.withCatalog({ homeDirectory: home }, opened => opened.projectDeletion.finishAll())); }
    catch (error) {
      // Once per kind of failure, not every minute: the same deletion fails the same way until something changes.
      const kind = `${error instanceof Error ? error.name : typeof error}:${String((error as { code?: unknown } | null)?.code ?? "")}`;
      if (!closed && kind !== warned) { warned = kind; hostLog.warn("projects", "leftover_deletion_unfinished", error); }
    } finally { running = false; }
  };
  const cancel = periodic.every({ id: "projects.deletions", title: "完成上次没删完的项目", owner: "local-host", intervalMs, run: finish });
  server.once("close", () => { closed = true; cancel(); });
  void catalog.warm().then(finish, () => undefined);
}
