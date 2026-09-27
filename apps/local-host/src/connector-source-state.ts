import { existsSync } from "node:fs";
import { resolve, sep, join } from "node:path";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { listProjectDatabasePaths } from "@molis-ai/molis-work-module-projects";
import { refreshSourceConnectionState } from "@molis-ai/molis-work-module-sources";
import { withConnectorConnections } from "./connector-connection-store.js";

/** Keep Feed's saved source status in step with the selected Home connection. */
export function refreshFeedConnectionState(homeDirectory: string, connectionId: string): void {
  const available = withConnectorConnections(homeDirectory, (store) => {
    const connection = store.require(connectionId);
    return store.state(connection) === "connected";
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
        refreshSourceConnectionState(project.db, { connection_id: connectionId, available });
      } finally { project.close(); }
    }
  } finally { catalog.close(); }
}

