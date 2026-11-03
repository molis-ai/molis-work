import { LocalMcpServer } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { serveMcpStdio } from "@molis-ai/molis-work-app-mcp";
const [home, project, client, databasePath, origin] = process.argv.slice(2);
if (!home || !project || !client || !databasePath || !origin) throw new Error("Missing resident fixture identity");
// The real stdio protocol forwards to the test's one resident Host; each client owns no Home or SDK storage.
const server = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", { projectId: project,
  databasePath, webBaseUrl: origin },
  { homeDirectory: home, webBaseUrl: origin, runtimeContext: { runtime_id: client, stable_work_context_id: null, host_declares_stable: false } }, undefined, origin);
try { await serveMcpStdio({ handleMessage: message => server.handleMessage(message) }); }
finally { await server.close(); }
