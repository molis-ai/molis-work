import { LocalMcpServer, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { serveMcpStdio } from "@molis-ai/molis-work-app-mcp";
const home = process.argv[2];
if (!home) throw new Error("Missing fixture Home");
// Only the remote judgment provider is a fixture; Host, catalog, transport and history are production code.
const host = new MolisWorkLocalHost({ homeDirectory: home, functions: {
  env: { TYPESAFE_API_KEY: "fixture-only" },
  provider: { async evaluate(_key, record) { return { primitive: record.primitive,
    choice: "yes", noul: null, score: null, legend: null, probabilities: { yes: 1 }, confidence: 1, model: "jev-1.13.0" }; } },
} });
const server = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null,
  { homeDirectory: home, runtimeContext: { runtime_id: "codex", stable_work_context_id: null, host_declares_stable: false } }, host);
try { await serveMcpStdio({ handleMessage: message => server.handleMessage(message) }); }
finally { await server.close(); await host.close(); }
