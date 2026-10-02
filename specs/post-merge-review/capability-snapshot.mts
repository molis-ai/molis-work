/**
 * Capability snapshot of a checkout: the action catalogue each audience discovers (Home and a seeded project),
 * the stdio MCP tool list, and the plugin assembly lists. Usage:
 *   node --import tsx capability-snapshot.mts <checkout-root> <out.json>
 * Runs on a throwaway Home; nothing real is opened.
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2]!;
const out = process.argv[3]!;
const at = (rel: string) => import(pathToFileURL(join(root, rel)).href);

const { MolisWorkLocalHost, molisWorkHostProjectReference } = await at("apps/local-host/src/project-host.ts");
const { seedDemoBoard, DEMO_BOARD_ID } = await at("apps/local-host/src/demo-seed.ts");
const { MolisWorkServer } = await at("apps/desktop/launchers/mcp/server.ts");

const home = mkdtempSync(join(tmpdir(), "capability-snapshot-"));
const dbPath = join(home, "project.db");
seedDemoBoard(dbPath);
const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
const PROJECT = "project-snapshot";
const reference = molisWorkHostProjectReference({ databasePath: dbPath, boardId: DEMO_BOARD_ID, projectId: PROJECT });
const audiences = ["user", "agent", "workflow", "plugin", "mcp"] as const;
const view = (v: any) => ({
  capability_id: v.capability_id, version: v.version, provider: v.provider?.provider_id, title: v.action?.title,
  kind: v.action?.kind ?? v.kind, scheduling: v.action?.scheduling, audience: v.action?.audience,
  available: v.availability?.available, reason: v.availability?.available ? undefined : v.availability?.code,
});
const snapshot: Record<string, unknown> = { root, taken_at: new Date().toISOString() };
try {
  for (const audience of audiences) {
    const caller = { actor_id: "snapshot", project_id: null, audience, permissions: [] };
    snapshot[`home:${audience}`] = (await host.inspectActions(caller)).map(view)
      .sort((a: any, b: any) => (a.capability_id + a.version).localeCompare(b.capability_id + b.version));
    const projectCaller = { ...caller, project_id: PROJECT };
    snapshot[`project:${audience}`] = (await host.inspectActions(projectCaller, reference)).map(view)
      .sort((a: any, b: any) => (a.capability_id + a.version).localeCompare(b.capability_id + b.version));
  }
  const server = new MolisWorkServer("runtime", null, { homeDirectory: home,
    runtimeContext: { runtime_id: "codex", stable_work_context_id: "snapshot", host_declares_stable: true }, webBaseUrl: "http://127.0.0.1:9" });
  const listed = await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) as any;
  snapshot["mcp:tools"] = (listed?.result?.tools ?? []).map((t: any) => t.name).sort();
} finally {
  await host.close();
  rmSync(home, { recursive: true, force: true });
}
// Assembly lists, read from source so the snapshot also records which path each plugin takes.
const gate = readFileSync(join(root, "tests/builtin-plugin-assembly-gate.test.ts"), "utf8");
snapshot["assembly:gate-source"] = gate.match(/\[[^\]]*"[a-z-]+"[^\]]*\]/g)?.slice(0, 3) ?? [];
writeFileSync(out, JSON.stringify(snapshot, null, 2));
const counts = Object.fromEntries(Object.entries(snapshot).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length]));
console.log(JSON.stringify(counts));
process.exit(0);
