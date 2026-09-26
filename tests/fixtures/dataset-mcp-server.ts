import { join } from "node:path";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../../apps/local-host/src/project-host.js";
import { DATASET_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-dataset";
import { createActionMcpPorts, handleMcpMessage, serveMcpStdio } from "@molis-ai/molis-work-app-mcp";

// Explicit fixture launch grants. Production client grant management is tested separately.
const [home, projectId, access] = process.argv.slice(2);
if (!home || !projectId) throw new Error("Missing fixture identity");
const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: async () => "MCP 列名" });
const ref = molisWorkHostProjectReference({ databasePath: join(home, `${projectId}.sqlite`), boardId: projectId, projectId });
await host.withProject(ref, runtime => runtime.coordinator.initializeBoard({ board_id: projectId, title: "MCP Dataset fixture", actor_id: `fixture-${projectId}`, idempotency_key: "dataset-mcp-fixture-init" }));
const ports = createActionMcpPorts({ service: host.actionClient(ref), serverInfo: { name: "dataset-actions", version: "1" },
  context: () => ({ actor_id: `fixture-${projectId}`, project_id: projectId, audience: "mcp", permissions: access === "read" ? ["dataset:read"] : DATASET_ACTION_PERMISSIONS }),
});
try { await serveMcpStdio({ handleMessage: message => handleMcpMessage(message, ports) }); }
finally { await host.close(); }
