import { projectActionAvailability } from "../../apps/local-host/src/project-action-availability.js";
import { join } from "node:path";
import { LocalMcpServer, MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { serveMcpStdio } from "@molis-ai/molis-work-app-mcp";
const [home, project, client, databasePath, boardId = project] = process.argv.slice(2);
if (!home || !project || !client) throw new Error("Missing fixture identity");
const host = new MolisWorkLocalHost({ homeDirectory: home, actionAvailability: projectActionAvailability(withMolisWorkProjectCatalog, home) });
const reference = molisWorkHostProjectReference({ databasePath: databasePath ?? join(home, `${project}.sqlite`), boardId, projectId: project });
if (!databasePath) await host.withProject(reference, runtime => runtime.coordinator.initializeBoard({ board_id: boardId, title: "MCP grants", actor_id: "setup", idempotency_key: "initialize" }));
const server = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", { projectId: project, boardId,
  databasePath: reference.storage_key, webBaseUrl: "http://127.0.0.1:4173" },
  { homeDirectory: home, runtimeContext: { runtime_id: client, stable_work_context_id: null, host_declares_stable: false } }, host);
try { await serveMcpStdio({ handleMessage: message => server.handleMessage(message) }); }
finally { await server.close(); await host.close(); }
