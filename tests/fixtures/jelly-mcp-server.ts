import { LocalMcpServer } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { serveMcpStdio } from "@molis-ai/molis-work-app-mcp";
const [home, client, origin] = process.argv.slice(2);
if (!home || !client || !origin) throw new Error("Missing resident fixture identity");
// RAC-105-A-16: one resident per Home; reconnecting a stdio client does not replace that owner.
const server = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null,
  { homeDirectory: home, webBaseUrl: origin, runtimeContext: { runtime_id: client, stable_work_context_id: null, host_declares_stable: false } }, undefined, origin);
try { await serveMcpStdio({ handleMessage: message => server.handleMessage(message) }); }
finally { await server.close(); }
