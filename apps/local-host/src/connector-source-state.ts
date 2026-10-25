import { existsSync } from "node:fs";
import { resolve, sep, join } from "node:path";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { listProjectDatabasePaths } from "@molis-ai/molis-work-module-projects";
import { fromBetterSqlite, refreshSourceConnectionState } from "@molis-ai/molis-work-plugin-feed/store";
import { withConnectorConnections } from "./connector-connection-store.js";

/** Keep Feed's saved source status in step with the selected Home connection. */
export function refreshFeedConnectionState(homeDirectory: string, connectionId: string): void {
  const available = withConnectorConnections(homeDirectory, (store) => {
    const connection = store.get(connectionId);
    return connection !== null && store.state(connection) === "connected";
  });
  const catalogPath = join(homeDirectory, "projects", "catalog.db");
  if (!existsSync(catalogPath)) return;
  const catalog = new LocalSqliteStorage(catalogPath, { readonly: true });
  try {
    const root = resolve(homeDirectory, "projects") + sep;
    for (const databasePath of listProjectDatabasePaths(catalog.db)) {
      const path = resolve(databasePath);
      if (!path.startsWith(root) || !existsSync(path)) continue;
      const project = new LocalSqliteStorage(path, { fileMustExist: true });
      try {
        // A library whose Feed has not made its tables yet (Feed's declaration makes them) has no sources to refresh.
        if (!project.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'feed_sources'").get()) continue;
        refreshSourceConnectionState(fromBetterSqlite(project.db), { connection_id: connectionId, available });
      } finally { project.close(); }
    }
  } finally { catalog.close(); }
}

