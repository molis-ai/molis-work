import { join } from "node:path";
import { createActionMcpPorts, handleMcpMessage, serveMcpStdio } from "@molis-ai/molis-work-app-mcp";
import { ALCHEMIST_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-alchemist";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { controlledAlchemistAi } from "./alchemist-actions.js";
import { initializeBoard } from "./goals-board.js";

// Production Host/service composition with explicit test grants and controlled external AI/source ports.
const [home, project, access, drain] = process.argv.slice(2);
if (!home || !project) throw new Error("Missing fixture identity");
const { ai } = controlledAlchemistAi();
// `drain` = "held": the studio never drains by itself, so a started job stays queued (the state between a start and `runPending`) until the process ends.
const host = new MolisWorkLocalHost({ homeDirectory: home, alchemist: { ai: () => ai, pulseSourceMode: "fixture", ...(drain === "held" ? { wrapStudio(runtime) { runtime.start = () => {}; } } : {}) } });
const ref = molisWorkHostProjectReference({ databasePath: join(home, `${project}.sqlite`), projectId: project });
await initializeBoard(host, ref, { actor_id: "fixture-owner", idempotency_key: "alchemist-mcp-init" });
const ports = createActionMcpPorts({ service: host.actionClient(ref), serverInfo: { name: "alchemist-actions-fixture", version: "1" },
  context: () => ({ actor_id: "fixture-owner", project_id: project, audience: "mcp", permissions: access === "read" ? ["alchemist:read"] : ALCHEMIST_ACTION_PERMISSIONS }) });
try { await serveMcpStdio({ handleMessage: message => handleMcpMessage(message, ports) }); }
finally { await host.close(); }
