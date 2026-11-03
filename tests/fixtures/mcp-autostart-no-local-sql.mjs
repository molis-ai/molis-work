import { createRequire, syncBuiltinESMExports } from "node:module";

// The MCP and its Node wrapper load this client-only probe; the resident must not inherit the client's NODE_OPTIONS.
if (process.env.MOLIS_WORK_MCP_WEB_STARTUP !== "1") {
  const sqlite = createRequire(import.meta.url)("node:sqlite");
  sqlite.DatabaseSync = class extends sqlite.DatabaseSync {
    constructor() { throw new Error("Forwarding MCP attempted to open a local SQLite database"); }
  };
  syncBuiltinESMExports();
}
