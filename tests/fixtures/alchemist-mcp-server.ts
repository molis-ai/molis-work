import { createActionMcpPorts, handleMcpMessage, serveMcpStdio } from "@molis-ai/molis-work-app-mcp";
import { LocalActionGatewayClient } from "@molis-ai/molis-work-app-local-host";

// Each real stdio client forwards to the one resident Host. Grants are read at the production gateway, never asserted by this process.
const [home, project, client, origin] = process.argv.slice(2);
if (!home || !project || !client || !origin) throw new Error("Missing fixture identity");
const ports = createActionMcpPorts({
  service: new LocalActionGatewayClient({ homeDirectory: home, projectId: project, clientId: client, url: origin }),
  serverInfo: { name: "alchemist-actions-fixture", version: "1" },
  context: () => ({ actor_id: client, project_id: project, audience: "mcp", permissions: [] }),
});
await serveMcpStdio({ handleMessage: message => handleMcpMessage(message, ports) });
