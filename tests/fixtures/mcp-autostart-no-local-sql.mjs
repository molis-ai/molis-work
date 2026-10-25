import { createRequire, syncBuiltinESMExports } from "node:module";

// Both installed launchers inherit this preload. Only the resident may open SQLite; the MCP and its Node wrapper cannot.
if (process.env.MOLIS_WORK_MCP_WEB_STARTUP !== "1") {
  const sqlite = createRequire(import.meta.url)("node:sqlite");
  sqlite.DatabaseSync = class extends sqlite.DatabaseSync {
    constructor() { throw new Error("Forwarding MCP attempted to open a local SQLite database"); }
  };
  syncBuiltinESMExports();
}
