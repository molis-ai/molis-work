import { LocalMcpServer } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { serveMcpStdio } from "@molis-ai/molis-work-app-mcp";
const [home, origin] = process.argv.slice(2);
if (!home || !origin) throw new Error("Missing resident fixture identity");
// RAC-105-A-17: the Host action client and MCP calls use the same resident provider and judgment history.
const server = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null,
  { homeDirectory: home, webBaseUrl: origin, runtimeContext: { runtime_id: "codex", stable_work_context_id: null, host_declares_stable: false } }, undefined, origin);
try { await serveMcpStdio({ handleMessage: message => server.handleMessage(message) }); }
finally { await server.close(); }
