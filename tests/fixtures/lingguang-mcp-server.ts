import { LocalActionGatewayClient } from "@molis-ai/molis-work-app-local-host";
import { createActionMcpPorts, handleMcpMessage, serveMcpStdio } from "@molis-ai/molis-work-app-mcp";

// The external process forwards to the resident Host; only that Host runs the project's Runtime.
const [homeDirectory, url, projectId, clientId] = process.argv.slice(2);
if (!homeDirectory || !url || !projectId || !clientId) throw new Error("Missing fixture identity");
const ports = createActionMcpPorts({ service: new LocalActionGatewayClient({ homeDirectory, url, projectId, clientId }),
  serverInfo: { name: "lingguang-actions", version: "1" },
  context: () => ({ actor_id: clientId, project_id: projectId, audience: "mcp", permissions: [] }),
});
await serveMcpStdio({ handleMessage: message => handleMcpMessage(message, ports) });
