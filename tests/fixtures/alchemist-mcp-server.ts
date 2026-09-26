import { join } from "node:path";
import { createActionMcpPorts, handleMcpMessage, serveMcpStdio } from "@molis-ai/molis-work-app-mcp";
import { ALCHEMIST_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-alchemist";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../../apps/local-host/src/project-host.js";
import { controlledAlchemistAi } from "./alchemist-actions.js";

// Production Host/service composition with explicit test grants and controlled external AI/source ports.
const [home, project, access] = process.argv.slice(2);
if (!home || !project) throw new Error("Missing fixture identity");
const { ai } = controlledAlchemistAi();
const host = new MolisWorkLocalHost({ homeDirectory: home, alchemist: { ai: () => ai, pulseSourceMode: "fixture" } });
const ref = molisWorkHostProjectReference({ databasePath: join(home, `${project}.sqlite`), boardId: project, projectId: project });
await host.withProject(ref, runtime => runtime.coordinator.initializeBoard({ board_id: project, title: "Alchemist MCP", actor_id: "fixture-owner", idempotency_key: "alchemist-mcp-init" }));
const ports = createActionMcpPorts({ service: host.actionClient(ref), serverInfo: { name: "alchemist-actions-fixture", version: "1" },
  context: () => ({ actor_id: "fixture-owner", project_id: project, audience: "mcp", permissions: access === "read" ? ["alchemist:read"] : ALCHEMIST_ACTION_PERMISSIONS }) });
try { await serveMcpStdio({ handleMessage: message => handleMcpMessage(message, ports) }); }
finally { await host.close(); }
