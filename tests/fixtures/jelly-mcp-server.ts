import { MolisWorkLocalHost } from "../../apps/local-host/src/project-host.js";
import { JELLY_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-jelly";
import { createActionMcpPorts, handleMcpMessage, serveMcpStdio } from "@molis-ai/molis-work-app-mcp";
const [home, access] = process.argv.slice(2);
if (!home) throw new Error("Missing fixture Home");
const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
// Explicit client grants for protocol verification; production grant configuration remains separate.
const ports = createActionMcpPorts({ service: host.homeActionClient(), serverInfo: { name: "jelly-actions", version: "1" },
  context: () => ({ actor_id: `fixture-${access}`, project_id: null, audience: "mcp", permissions: access === "read" ? ["jelly:read"] : JELLY_ACTION_PERMISSIONS }),
});
try { await serveMcpStdio({ handleMessage: message => handleMcpMessage(message, ports) }); }
finally { await host.close(); }
