import { LocalMcpServer } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { serveMcpStdio } from "@molis-ai/molis-work-app-mcp";

const [home, projectId, client, databasePath, origin] = process.argv.slice(2);
if (!home || !projectId || !client || !databasePath || !origin) throw new Error("Missing resident fixture identity");
// RAC-105-A-16: model behavior belongs to the one resident; this client only forwards authenticated MCP calls.
const server = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", { projectId, databasePath, webBaseUrl: origin },
  { homeDirectory: home, webBaseUrl: origin, runtimeContext: { runtime_id: client, stable_work_context_id: null, host_declares_stable: false } }, undefined, origin);
try { await serveMcpStdio({ handleMessage: message => server.handleMessage(message) }); }
finally { await server.close(); }
