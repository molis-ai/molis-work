import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { WebSocket } from "ws";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer, ProjectDeletionService, createMolisWorkLocalHost, molisWorkHostProjectReference, type ProjectDeletionPorts } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

/**
 * Deleting a project is one Host service whichever door asks: the settings page and the MCP tool both stop while one of the
 * project's terminals is alive, both let go of the project's open runtime before its directory moves, and both record who asked.
 */
type Catalog = Awaited<ReturnType<typeof openMolisWorkProjectCatalog>>;
const TOKEN = "project-deletion-service-test-0123456789";
const deletion = (id: string, key = `delete-${id}`) => ({ project_id: id, actor_id: "test-user", delete_confirmed: true, idempotency_key: key });

async function scratchHome(t: TestContext): Promise<{ directory: string; home: string; catalog: Catalog }> {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-deletion-service-"));
  const home = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  t.after(async () => { catalog.close(); await rm(directory, { recursive: true, force: true }); });
  return { directory, home, catalog };
}
function recordingPorts(alive: (panelId: string) => boolean = () => false): ProjectDeletionPorts & { released: string[]; asked: string[] } {
  const released: string[] = [], asked: string[] = [];
  return { released, asked, isPanelAlive(panelId) { asked.push(panelId); return alive(panelId); }, async releaseProject(databasePath) { released.push(databasePath); } };
}

test("the service stops while a terminal of the project is alive, and changes nothing", async t => {
  const { directory, home, catalog } = await scratchHome(t);
  const project = await catalog.createProject({ display_name: "有终端的项目", actor_id: "test-user" });
  const other = await catalog.createProject({ display_name: "另一个项目", actor_id: "test-user" });
  const panel = catalog.openDesktopPanel({ project_id: project.project_id, goal_id: "goal-1", runtime_kind: "generic", launch_command: "/bin/cat", cwd: directory, actor_id: "test-user", user_confirmed: true });
  catalog.openDesktopPanel({ project_id: other.project_id, goal_id: "goal-1", runtime_kind: "generic", launch_command: "/bin/cat", cwd: directory, actor_id: "test-user", user_confirmed: true });
  const ports = recordingPorts(panelId => panelId === panel.panel_id);
  const service = new ProjectDeletionService(withMolisWorkProjectCatalog, ports);

  await assert.rejects(service.deleteProject(home, deletion(project.project_id)), { code: "catalog.project_terminal_live", message: /关闭.*终端/ });
  assert.deepEqual(ports.released, [], "the runtime is not let go of for a deletion that does not happen");
  assert.equal(existsSync(project.database_path), true);
  assert.equal(catalog.listProjectDeletions().length, 0, "no receipt is written");
  assert.deepEqual(catalog.listDesktopPanels(project.project_id).map(item => item.panel_id), [panel.panel_id]);
  assert.ok(ports.asked.every(panelId => panelId === panel.panel_id), "only the project's own terminals are asked about");
});

test("the service lets go of the project's runtime before the directory moves, and only for a confirmed request", async t => {
  const { home, catalog } = await scratchHome(t);
  const project = await catalog.createProject({ display_name: "要删除的项目", actor_id: "test-user" });
  const ports = recordingPorts();
  const observed: boolean[] = [];
  const service = new ProjectDeletionService(withMolisWorkProjectCatalog, { ...ports, async releaseProject(databasePath) { observed.push(existsSync(databasePath)); await ports.releaseProject(databasePath); } });

  await assert.rejects(service.deleteProject(home, { ...deletion(project.project_id), delete_confirmed: false }), { code: "catalog.delete_confirmation_required" });
  assert.deepEqual(ports.released, [], "an unconfirmed request does not touch the runtime");

  const result = await service.deleteProject(home, deletion(project.project_id));
  assert.equal(result.deletion.cleanup_state, "complete");
  assert.equal(result.deletion.actor_id, "test-user", "the receipt records the actor the door gave");
  assert.deepEqual(ports.released, [project.database_path]);
  assert.deepEqual(observed, [true], "the runtime was released while the project still existed");
  assert.equal(existsSync(project.database_path), false);

  // A project that is already deleted replays its receipt: nothing is asked of the terminals or the runtime again.
  const asked = ports.asked.length;
  const replay = await service.deleteProject(home, deletion(project.project_id));
  assert.equal(replay.replayed, true);
  assert.deepEqual(ports.released, [project.database_path]);
  assert.equal(ports.asked.length, asked);
});

/** A running Web server (the resident Host) with one live terminal on the project, the way the deletion page test makes it. */
async function residentHostWithTerminal(t: TestContext, home: string, projectId: string, cwd: string, catalog: Catalog) {
  const localHost = createMolisWorkLocalHost({ homeDirectory: home });
  // No injected token: the server writes the Home's own token file, which is where an MCP process finds it.
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const panel = catalog.openDesktopPanel({ project_id: projectId, goal_id: "goal-terminal", runtime_kind: "generic", launch_command: "/bin/cat", cwd, actor_id: "test-user", user_confirmed: true });
  const token = (await (await import("node:fs/promises")).readFile(join(home, "config", "web-control-token"), "utf8")).trim();
  const socket = new WebSocket(origin.replace("http:", "ws:") + "/pty");
  t.after(async () => {
    socket.terminate();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await localHost.close();
  });
  await once(socket, "open");
  const message = (value: Record<string, unknown>, type: string) => {
    const received = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => { socket.off("message", listener); reject(new Error(`Missing PTY ${type}`)); }, 5_000);
      const listener = (raw: unknown) => {
        const result = JSON.parse(String(raw));
        if (result.type !== type && result.type !== "error") return;
        clearTimeout(timeout);
        socket.off("message", listener);
        result.type === "error" ? reject(new Error(JSON.stringify(result))) : resolve(result);
      };
      socket.on("message", listener);
    });
    socket.send(JSON.stringify(value));
    return received;
  };
  await message({ type: "auth", token }, "ready");
  await message({ type: "spawn", panelId: panel.panel_id, command: "/bin/cat", cwd }, "spawned");
  const closeTerminal = async () => {
    socket.send(JSON.stringify({ type: "kill", panelId: panel.panel_id }));
    assert.equal((await message({ type: "spawn", panelId: panel.panel_id, attachOnly: true }, "spawned")).attached, false);
  };
  return { localHost, origin, token, closeTerminal };
}

const runtimeHost = (home: string) => ({ homeDirectory: home, runtimeContext: { runtime_id: "codex", stable_work_context_id: "deletion-service-session", host_declares_stable: true } });
const callTool = async (server: LocalMcpServer, name: string, args: Record<string, unknown>) => (await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) as
  { result: { isError: boolean; content: Array<{ text: string }> } }).result;

test("the MCP tool asks the resident Host: a live terminal stops it (409), and once it is closed the Host lets go of its runtime and deletes", { timeout: 60_000 }, async t => {
  const { directory, home, catalog } = await scratchHome(t);
  const project = await catalog.createProject({ display_name: "有终端的项目", actor_id: "test-user" });
  const { localHost, origin, closeTerminal } = await residentHostWithTerminal(t, home, project.project_id, directory, catalog);
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  await localHost.withProject(reference, () => undefined);
  assert.equal(localHost.status().projects.some(row => row.project_id === project.project_id), true, "the resident Host has the project's runtime open");
  // The stdio MCP process: its own Home and the resident Host's address, so deleting is the resident Host's to do.
  const mcp = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null, runtimeHost(home), localHost, origin);
  t.after(() => mcp.close());
  const request = { project_id: project.project_id, delete_confirmed: true, idempotency_key: "mcp-live-terminal-delete" };

  const blocked = await callTool(mcp, "molis_work_v1_project_delete", request);
  assert.equal(blocked.isError, true);
  assert.match(blocked.content[0]?.text ?? "", /关闭.*终端/);
  assert.match(blocked.content[0]?.text ?? "", /catalog\.project_terminal_live/);
  assert.equal(existsSync(project.database_path), true);
  assert.equal(localHost.status().projects.some(row => row.project_id === project.project_id), true, "a refused deletion leaves the runtime open");
  assert.equal(catalog.listProjectDeletions().length, 0);

  await closeTerminal();
  const deleted = await callTool(mcp, "molis_work_v1_project_delete", request);
  assert.equal(deleted.isError, false, deleted.content[0]?.text);
  const receipt = (JSON.parse(deleted.content[0]!.text) as { replayed: boolean; deletion: { actor_id: string; cleanup_state: string } });
  assert.equal(receipt.replayed, false);
  assert.equal(receipt.deletion.actor_id, "runtime:codex:deletion-service-session", "the actor is the MCP client and the Runtime Session of the call");
  assert.equal(existsSync(project.database_path), false);
  assert.equal(localHost.status().projects.some(row => row.project_id === project.project_id), false, "the resident Host let go of the runtime");
  assert.deepEqual(catalog.listDesktopPanels(project.project_id), []);

  const replay = await callTool(mcp, "molis_work_v1_project_delete", request);
  assert.equal(replay.isError, false, replay.content[0]?.text);
  assert.equal((JSON.parse(replay.content[0]!.text) as { replayed: boolean }).replayed, true);
});

test("the settings page and the MCP tool refuse the same live terminal with the same code", { timeout: 60_000 }, async t => {
  const { directory, home, catalog } = await scratchHome(t);
  const project = await catalog.createProject({ display_name: "有终端的项目", actor_id: "test-user" });
  const { localHost, origin, token, closeTerminal } = await residentHostWithTerminal(t, home, project.project_id, directory, catalog);
  const mcp = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null, runtimeHost(home), localHost, origin);
  t.after(() => mcp.close());
  let sequence = 0;
  const web = (key: string) => fetch(`${origin}/api/settings/projects/${project.project_id}/delete`, { method: "POST",
    headers: { "content-type": "application/json", origin, "x-molis-work-control-token": token, "x-molis-work-idempotency-key": `service-web-${++sequence}` },
    body: JSON.stringify({ delete_confirmed: true, idempotency_key: key }) });

  const page = await web("page-live-terminal");
  assert.equal(page.status, 409);
  const mcpBlocked = await callTool(mcp, "molis_work_v1_project_delete", { project_id: project.project_id, delete_confirmed: true, idempotency_key: "mcp-live-terminal" });
  assert.equal(mcpBlocked.isError, true);
  assert.match(mcpBlocked.content[0]?.text ?? "", /catalog\.project_terminal_live/);
  assert.match(((await page.json()) as { error: string }).error, /关闭.*终端/);

  await closeTerminal();
  assert.equal((await web("page-live-terminal")).status, 200);
  assert.equal(existsSync(project.database_path), false);
});

test("with no resident Host to ask, the MCP tool deletes in its own process: it lets go of its own runtime, and the receipt names its Session", { timeout: 60_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  const project = await catalog.createProject({ display_name: "没有常驻服务", actor_id: "test-user" });
  const localHost = createMolisWorkLocalHost({ homeDirectory: home });
  t.after(() => localHost.close());
  await localHost.withProject(molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }), () => undefined);
  // The address of a Web server that is not running: the Home has no control token either.
  const mcp = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null, runtimeHost(home), localHost, "http://127.0.0.1:9");
  t.after(() => mcp.close());

  const deleted = await callTool(mcp, "molis_work_v1_project_delete", { project_id: project.project_id, delete_confirmed: true, idempotency_key: "mcp-no-resident-host" });
  assert.equal(deleted.isError, false, deleted.content[0]?.text);
  assert.equal((JSON.parse(deleted.content[0]!.text) as { deletion: { actor_id: string } }).deletion.actor_id, "runtime:codex:deletion-service-session");
  assert.equal(existsSync(project.database_path), false);
  assert.equal(localHost.status().projects.some(row => row.project_id === project.project_id), false, "the process's own runtime of the project was let go of");
});

test("removing the demo from the settings page is the same service: a live terminal stops it (409), then the Host lets go of the runtime and deletes", { timeout: 60_000 }, async t => {
  const { directory, home, catalog } = await scratchHome(t);
  const demo = (await catalog.ensureDemoProject({ actor_id: "test-user", user_confirmed: true })).project;
  const { localHost, origin, token, closeTerminal } = await residentHostWithTerminal(t, home, demo.project_id, directory, catalog);
  await localHost.withProject(molisWorkHostProjectReference({ databasePath: demo.database_path, projectId: demo.project_id }), () => undefined);
  let sequence = 0;
  const remove = () => fetch(`${origin}/api/settings/demo`, { method: "POST",
    headers: { "content-type": "application/json", origin, "x-molis-work-control-token": token, "x-molis-work-idempotency-key": `demo-remove-${++sequence}` },
    body: JSON.stringify({ action: "remove", user_confirmed: true }) });

  const blocked = await remove();
  assert.equal(blocked.status, 409);
  const refusal = await blocked.json() as { code?: string; error: string };
  assert.equal(refusal.code, "catalog.project_terminal_live");
  assert.match(refusal.error, /关闭.*终端/);
  assert.equal(existsSync(demo.database_path), true);
  assert.equal(localHost.status().projects.some(row => row.project_id === demo.project_id), true, "a refused removal leaves the runtime open");
  assert.equal(catalog.listProjectDeletions().length, 0, "no receipt is written");

  await closeTerminal();
  const removed = await remove();
  assert.equal(removed.status, 200, JSON.stringify(await removed.clone().json()));
  const receipt = await removed.json() as { replayed: boolean; deletion: { cleanup_state: string } };
  assert.equal(receipt.deletion.cleanup_state, "complete");
  assert.equal(existsSync(demo.database_path), false);
  assert.equal(localHost.status().projects.some(row => row.project_id === demo.project_id), false, "the Host let go of the demo's runtime");
  assert.equal((await remove()).status, 404, "a demo that is gone answers the settings page as it did");
});
