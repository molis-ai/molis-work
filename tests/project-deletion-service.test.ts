import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import test, { after, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import { WebSocket } from "ws";
import { createHash, randomUUID } from "node:crypto";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer, ProjectDeletionService, createMolisWorkLocalHost, molisWorkHostProjectReference, type ProjectDeletionPorts } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { addTerminalGoal, goalTerminalsPath, linkTerminalFolder } from "./fixtures/goal-terminal.js";

/**
 * Deleting a project is one Host service whichever door asks: the settings page, the MCP tool and the CLI's `demo remove` (when a
 * Host runs) all stop while one of the project's terminals is alive, all let go of the project's open runtime before its
 * directory moves, and all record who asked.
 */
type Catalog = Awaited<ReturnType<typeof openMolisWorkProjectCatalog>>;
const TOKEN = "project-deletion-service-test-0123456789";
const deletion = (id: string, key = `delete-${id}`) => ({ project_id: id, actor_id: "test-user", delete_confirmed: true, idempotency_key: key });

// File teardown runs after the per-test sockets, MCP clients and resident Hosts have closed.
const scratchDirectories: string[] = [];
after(async () => { for (const directory of scratchDirectories) await rm(directory, { recursive: true, force: true }); });

async function scratchHome(t: TestContext): Promise<{ directory: string; home: string; catalog: Catalog }> {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-deletion-service-"));
  const home = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  scratchDirectories.push(directory);
  t.after(() => catalog.close());
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
  // Two terminal records, one in each project, as `services.terminal` writes them.
  const record = (projectId: string, panelId: string) => ({ panel_id: panelId, install_id: "fixture-install", project_id: projectId, actor_id: "test-user",
    key: panelId, subject: "goal-1", runtime: "command", launch_command: "/bin/cat", launch_args: [], title: "cat" });
  const panel = await catalog.commit(() => {
    catalog.terminalPanels.insert(record(other.project_id, "plugin-other-terminal"), directory);
    return catalog.terminalPanels.insert(record(project.project_id, "plugin-live-terminal"), directory);
  });
  const ports = recordingPorts(panelId => panelId === panel.panel_id);
  const service = new ProjectDeletionService(withMolisWorkProjectCatalog, ports);

  await assert.rejects(service.deleteProject(home, deletion(project.project_id)), { code: "catalog.project_terminal_live", message: /关闭.*终端/ });
  assert.deepEqual(ports.released, [], "the runtime is not let go of for a deletion that does not happen");
  assert.equal(existsSync(project.database_path), true);
  assert.equal(catalog.listProjectDeletions().length, 0, "no receipt is written");
  assert.deepEqual(catalog.terminalPanels.listIds(project.project_id), [panel.panel_id]);
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

  // The project's Runtime pick (BL-372) is a row in the project's own database: deleting the project takes it with the file, and the Home keeps no copy.
  const database = new DatabaseSync(project.database_path);
  database.exec(`CREATE TABLE project_runtime_settings (project_id TEXT PRIMARY KEY, runtime_id TEXT); INSERT INTO project_runtime_settings VALUES ('${project.project_id}', 'picked-engine')`);
  database.close();

  const result = await service.deleteProject(home, deletion(project.project_id));
  assert.equal(result.deletion.cleanup_state, "complete");
  assert.equal(result.deletion.actor_id, "test-user", "the receipt records the actor the door gave");
  assert.deepEqual(ports.released, [project.database_path]);
  assert.deepEqual(observed, [true], "the runtime was released while the project still existed");
  assert.equal(existsSync(project.database_path), false, "the file, with the Runtime pick in it, is gone");

  // A project that is already deleted replays its receipt: nothing is asked of the terminals or the runtime again.
  const asked = ports.asked.length;
  const replay = await service.deleteProject(home, deletion(project.project_id));
  assert.equal(replay.replayed, true);
  assert.deepEqual(ports.released, [project.database_path]);
  assert.equal(ports.asked.length, asked);
});

/** A running Web server (the resident Host) for the Home, with no terminal. */
async function residentHost(t: TestContext, home: string) {
  const localHost = createMolisWorkLocalHost({ homeDirectory: home });
  // No injected token: the server writes the Home's own token file, which is where an MCP process finds it.
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const token = (await readFile(join(home, "config", "web-control-token"), "utf8")).trim();
  const stop = async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await localHost.close();
  };
  return { localHost, origin, token, stop };
}

/** A running Web server (the resident Host) with one live terminal on the project: a Goal's, started by Goals in a folder linked to the project. RAC-2568: the
 * Host refuses to delete the project while it runs, whichever door asks, and the record goes with the project once it is closed. */
async function residentHostWithTerminal(t: TestContext, home: string, project: { project_id: string; database_path: string }, directory: string, catalog: Catalog) {
  const { localHost, origin, token, stop } = await residentHost(t, home);
  const folder = join(directory, "workspace");
  await mkdir(folder, { recursive: true });
  await linkTerminalFolder(catalog, project.project_id, await realpath(folder));
  addTerminalGoal(project, "goal-terminal");
  const opened = await fetch(origin + goalTerminalsPath(project.project_id, "goal-terminal"), { method: "POST",
    headers: { "content-type": "application/json", origin, "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() },
    body: JSON.stringify({ key: "deletion", command: "/bin/cat" }) });
  assert.equal(opened.status, 200, await opened.clone().text());
  const panel = { panel_id: (await opened.json() as { panel_id: string }).panel_id };
  const socket = new WebSocket(origin.replace("http:", "ws:") + "/pty");
  t.after(async () => {
    socket.terminate();
    await stop();
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
  assert.equal((await message({ type: "spawn", panelId: panel.panel_id, attachOnly: true }, "spawned")).attached, true, "Goals started it");
  const closeTerminal = async () => {
    socket.send(JSON.stringify({ type: "kill", panelId: panel.panel_id }));
    assert.equal((await message({ type: "spawn", panelId: panel.panel_id, attachOnly: true }, "spawned")).attached, false);
  };
  return { localHost, origin, token, closeTerminal, panelId: panel.panel_id };
}

const runtimeHost = (home: string) => ({ homeDirectory: home, runtimeContext: { runtime_id: "codex", stable_work_context_id: "deletion-service-session", host_declares_stable: true } });
const callTool = async (server: LocalMcpServer, name: string, args: Record<string, unknown>) => (await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) as
  { result: { isError: boolean; content: Array<{ text: string }> } }).result;

test("the MCP tool asks the resident Host: a live terminal stops it (409), and once it is closed the Host lets go of its runtime and deletes", { timeout: 60_000 }, async t => {
  const { directory, home, catalog } = await scratchHome(t);
  const project = await catalog.createProject({ display_name: "有终端的项目", actor_id: "test-user" });
  const { localHost, origin, closeTerminal, panelId } = await residentHostWithTerminal(t, home, project, directory, catalog);
  // The terminal's own work context is an alias of it; deleting the project takes the alias with it (RAC-2568).
  const aliases = () => {
    // The catalog's own SQLite (better-sqlite3), as the Host in this process opens it.
    const db = new Database(join(home, "projects", "catalog.db"), { readonly: true });
    try { return Number((db.prepare("SELECT COUNT(*) AS count FROM plugin_terminal_panel_aliases WHERE panel_id = ?").get(panelId) as { count: number }).count); }
    finally { db.close(); }
  };
  assert.equal(aliases(), 1);
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  // The forwarding process assembles protocol metadata without opening a Home or project runtime of its own.
  const mcpHost = createMolisWorkLocalHost({});
  t.after(() => mcpHost.close());
  const isOpen = (host: { status(): { projects: Array<{ project_id: string }> } }) => host.status().projects.some(row => row.project_id === project.project_id);
  await localHost.withProject(reference, () => undefined);
  // The Host also closes a deleted project's runtime afterwards (the "project-runtime" owner of the deletion hooks), so
  // "the runtime is gone" would hold without the service's own release. What the service adds is the order: it lets go
  // before the project's directory moves. Each close the resident Host is asked for records whether the project was still there.
  const residentCloses: boolean[] = [];
  const closeResidentRuntime = localHost.closeProject.bind(localHost);
  localHost.closeProject = target => { residentCloses.push(existsSync(project.database_path)); return closeResidentRuntime(target); };
  assert.equal(isOpen(localHost), true, "the resident Host has the project's runtime open");
  assert.equal(isOpen(mcpHost), false, "the forwarding MCP starts with no project runtime");
  const mcp = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null, runtimeHost(home), mcpHost, origin);
  t.after(() => mcp.close());
  const request = { project_id: project.project_id, delete_confirmed: true, idempotency_key: "mcp-live-terminal-delete" };

  const blocked = await callTool(mcp, "molis_work_v1_project_delete", request);
  assert.equal(blocked.isError, true);
  assert.match(blocked.content[0]?.text ?? "", /关闭.*终端/);
  assert.match(blocked.content[0]?.text ?? "", /catalog\.project_terminal_live/);
  assert.equal(existsSync(project.database_path), true);
  assert.equal(isOpen(localHost), true, "a refused deletion leaves the resident Host's runtime open");
  assert.deepEqual(residentCloses, [], "a refused deletion does not ask the resident Host to close anything");
  assert.equal(isOpen(mcpHost), false, "a refused deletion never opens a local project runtime");
  assert.equal(catalog.listProjectDeletions().length, 0);

  await closeTerminal();
  const deleted = await callTool(mcp, "molis_work_v1_project_delete", request);
  assert.equal(deleted.isError, false, deleted.content[0]?.text);
  const receipt = (JSON.parse(deleted.content[0]!.text) as { replayed: boolean; deletion: { actor_id: string; cleanup_state: string } });
  assert.equal(receipt.replayed, false);
  assert.equal(receipt.deletion.actor_id, "runtime:codex:deletion-service-session", "the actor is the MCP client and the Runtime Session of the call");
  assert.equal(existsSync(project.database_path), false);
  assert.equal(isOpen(localHost), false, "the resident Host let go of its runtime");
  assert.equal(residentCloses[0], true, "the resident Host's service let go of the runtime while the project's directory was still in place");
  assert.equal(isOpen(mcpHost), false, "successful forwarding never opened a local project runtime");
  assert.deepEqual(catalog.terminalPanels.listIds(project.project_id), [], "RAC-2568: the project's terminal records went with it");
  assert.equal(aliases(), 0, "RAC-2568: and the aliases of its work contexts");

  const replay = await callTool(mcp, "molis_work_v1_project_delete", request);
  assert.equal(replay.isError, false, replay.content[0]?.text);
  assert.equal((JSON.parse(replay.content[0]!.text) as { replayed: boolean }).replayed, true);
});

test("the settings page and the MCP tool refuse the same live terminal with the same code", { timeout: 60_000 }, async t => {
  const { directory, home, catalog } = await scratchHome(t);
  const project = await catalog.createProject({ display_name: "有终端的项目", actor_id: "test-user" });
  const { localHost, origin, token, closeTerminal } = await residentHostWithTerminal(t, home, project, directory, catalog);
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

test("RAC-105-A-09: without a resident the forwarding MCP refuses deletion and preserves the local project and runtime", { timeout: 60_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  const project = await catalog.createProject({ display_name: "没有常驻服务", actor_id: "test-user" });
  const localHost = createMolisWorkLocalHost({ homeDirectory: home });
  t.after(() => localHost.close());
  await localHost.withProject(molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }), () => undefined);
  // The address of a Web server that is not running: the Home has no control token either.
  const mcp = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null, runtimeHost(home), localHost, "http://127.0.0.1:9");
  t.after(() => mcp.close());

  const deleted = await callTool(mcp, "molis_work_v1_project_delete", { project_id: project.project_id, delete_confirmed: true, idempotency_key: "mcp-no-resident-host" });
  assert.equal(deleted.isError, true, deleted.content[0]?.text);
  assert.match(deleted.content[0]?.text ?? "", /actions.service_unavailable/);
  assert.equal(existsSync(project.database_path), true);
  assert.equal(localHost.status().projects.some(row => row.project_id === project.project_id), true, "a refused transfer never closes or deletes through the injected local Host");
  assert.deepEqual(catalog.listProjectDeletions(), []);
});

test("removing the demo from the settings page is the same service: a live terminal stops it (409), then the Host lets go of the runtime and deletes", { timeout: 60_000 }, async t => {
  const { directory, home, catalog } = await scratchHome(t);
  const demo = (await catalog.ensureDemoProject({ actor_id: "test-user", user_confirmed: true })).project;
  const { localHost, origin, token, closeTerminal } = await residentHostWithTerminal(t, home, demo, directory, catalog);
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

// ---- When the resident Host does not answer, and when its answer is a failure ---------------------------------------------

const freePort = (): Promise<number> => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address() as { port: number }; probe.close(() => resolve(port)); });
});
/** What a Home keeps once a Host has run in it: the control token stays after the Host has stopped. */
async function leaveTokenBehind(home: string): Promise<void> {
  await mkdir(join(home, "config"), { recursive: true });
  await writeFile(join(home, "config", "web-control-token"), `${TOKEN}\n`, { mode: 0o600 });
}

test("RAC-105-A-09: a stopped Host's token does not permit the forwarding MCP to delete in its own process", { timeout: 60_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  const project = await catalog.createProject({ display_name: "常驻服务已经停了", actor_id: "test-user" });
  const localHost = createMolisWorkLocalHost({ homeDirectory: home });
  t.after(() => localHost.close());
  await localHost.withProject(molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }), () => undefined);
  // The normal state of a Home after Molis Work has run and stopped: the token file is there, nothing listens at the address.
  await leaveTokenBehind(home);
  const mcp = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null, runtimeHost(home), localHost, `http://127.0.0.1:${await freePort()}`);
  t.after(() => mcp.close());

  const deleted = await callTool(mcp, "molis_work_v1_project_delete", { project_id: project.project_id, delete_confirmed: true, idempotency_key: "mcp-stale-token" });
  assert.equal(deleted.isError, true, deleted.content[0]?.text);
  assert.match(deleted.content[0]?.text ?? "", /actions.service_unavailable/);
  assert.equal(existsSync(project.database_path), true);
  assert.equal(localHost.status().projects.some(row => row.project_id === project.project_id), true);
  assert.deepEqual(catalog.listProjectDeletions(), []);
});

test("W3-02-G1-01 RAC-105-A-GW-01 real context deletion HTTP and its forwarding MCP retain owner conflict details without deleting", { timeout: 60_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  const project = await catalog.createProject({ display_name: "等待释放的项目", actor_id: "test-user" });
  const { localHost, origin, token, stop } = await residentHost(t, home);
  t.after(stop);
  const details = { current_phase: "busy", current_version: 3 };
  const original = localHost.closeProject.bind(localHost);
  const mcp = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null, runtimeHost(home), localHost, origin);
  t.after(() => mcp.close());
  try {
    localHost.closeProject = async () => { throw new ActionError("example.runtime_busy", "运行环境尚未释放", { kind: "conflict", details }); };
    const reply = await fetch(origin + "/api/internal/runtime-context", { method: "POST", headers: {
      origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID(),
    }, body: JSON.stringify({ operation: "tool", home_id: createHash("sha256").update(resolvePath(home)).digest("hex"), instance_id: localHost.instanceId,
      metadata: { runtimeContext: { runtime_id: "codex", stable_work_context_id: null, host_declares_stable: false } },
      protocol: { runtimeSessionId: null, runtimeSessionIdSource: null }, call_id: randomUUID(),
      tool: { name: "molis_work_v1_project_delete", arguments: { project_id: project.project_id, delete_confirmed: true, idempotency_key: "owner-refusal-http" } } }) });
    assert.equal(reply.status, 409);
    assert.deepEqual(await reply.json(), { error: "运行环境尚未释放", code: "example.runtime_busy", details, instance_id: localHost.instanceId, cache: { kind: "none" } });
    const forwarded = await callTool(mcp, "molis_work_v1_project_delete", {
      project_id: project.project_id, delete_confirmed: true, idempotency_key: "owner-refusal-mcp",
    });
    assert.equal(forwarded.isError, true);
    const text = forwarded.content[0]!.text;
    assert.deepEqual(JSON.parse(text), { error: "运行环境尚未释放", code: "example.runtime_busy", details });
    assert.deepEqual(catalog.listProjectDeletions(), []);
    assert.equal(existsSync(project.database_path), true);
  } finally { localHost.closeProject = original; }
});

test("W3-02-G1-01 an uncoded resident deletion failure keeps its message through MCP and uses the common internal code", { timeout: 60_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  const project = await catalog.createProject({ display_name: "目录不见了", actor_id: "test-user" });
  const { localHost, origin, stop } = await residentHost(t, home);
  t.after(stop);
  const mcp = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null, runtimeHost(home), localHost, origin);
  t.after(() => mcp.close());
  // The project's directory was taken away from under the catalog, so the Host cannot move it aside.
  await rm(dirname(project.database_path), { recursive: true, force: true });

  const failed = await callTool(mcp, "molis_work_v1_project_delete", { project_id: project.project_id, delete_confirmed: true, idempotency_key: "mcp-host-failure" });
  assert.equal(failed.isError, true);
  assert.match(failed.content[0]?.text ?? "", /ENOENT/, "the message names what failed");
  assert.match(failed.content[0]?.text ?? "", /"code":"actions\.execution_failed"/, "an uncoded file failure uses the common internal code");
  assert.doesNotMatch(failed.content[0]?.text ?? "", /transport_failed/);
  assert.equal(catalog.listProjectDeletions().length, 0, "nothing was recorded: the MCP process did not go on to delete in its own process");
});

// ---- `molis-work demo remove`: the resident Host's deletion when one answers, this process's when none does -----------------

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
/** The public CLI as a child process, asynchronously: the resident Host under test runs in this process and must keep answering. */
async function demoRemoveCli(home: string, hostUrl: string | null, ...flags: string[]): Promise<{ status: number; stdout: string; stderr: string }> {
  const env = { ...process.env, MOLIS_WORK_SECRET_BACKEND: "file", ...(hostUrl === null ? {} : { MOLIS_WORK_WEB_URL: hostUrl }) };
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [join(root, "dist", "cli", "main.js"), "demo", "remove", "--home", home, "--confirm", ...flags], { cwd: root, env });
    return { status: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { status: typeof failed.code === "number" ? failed.code : 1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
}

test("the CLI's demo remove asks the resident Host: a live terminal stops it, and once it is closed the Host lets go of the runtime and deletes as the person on this machine", { timeout: 120_000 }, async t => {
  const { directory, home, catalog } = await scratchHome(t);
  const demo = (await catalog.ensureDemoProject({ actor_id: "test-user", user_confirmed: true })).project;
  const { localHost, origin, closeTerminal } = await residentHostWithTerminal(t, home, demo, directory, catalog);
  await localHost.withProject(molisWorkHostProjectReference({ databasePath: demo.database_path, projectId: demo.project_id }), () => undefined);

  const blocked = await demoRemoveCli(home, origin);
  assert.notEqual(blocked.status, 0, blocked.stdout);
  assert.match(blocked.stderr, /关闭.*终端/, "it says what the Host said");
  assert.equal(existsSync(demo.database_path), true, "the demo is still there");
  assert.equal(localHost.status().projects.some(row => row.project_id === demo.project_id), true, "a refused removal leaves the Host's runtime open");
  assert.equal(catalog.listProjectDeletions().length, 0, "no receipt is written");

  await closeTerminal();
  const removed = await demoRemoveCli(home, origin);
  assert.equal(removed.status, 0, removed.stderr);
  assert.match(removed.stdout, /可重建 demo 已删除/);
  assert.equal(existsSync(demo.database_path), false);
  assert.equal(localHost.status().projects.some(row => row.project_id === demo.project_id), false, "the Host let go of the demo's runtime");
  const receipts = catalog.listProjectDeletions();
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0]!.actor_id, LOCAL_PERSON_ACTOR_ID, "the Host records the person on this machine, whoever typed the command");
  assert.equal(receipts[0]!.cleanup_state, "complete");
});

test("the CLI's demo remove --json prints the Host's receipt as the in-process delete prints it", { timeout: 120_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  const demo = (await catalog.ensureDemoProject({ actor_id: "test-user", user_confirmed: true })).project;
  const { origin, stop } = await residentHost(t, home);
  t.after(stop);

  const removed = await demoRemoveCli(home, origin, "--json");
  assert.equal(removed.status, 0, removed.stderr);
  const receipt = JSON.parse(removed.stdout) as { replayed: boolean; message?: string; deletion: { project_id: string; actor_id: string; cleanup_state: string } };
  assert.deepEqual([receipt.replayed, receipt.deletion.project_id, receipt.deletion.actor_id, receipt.deletion.cleanup_state], [false, demo.project_id, LOCAL_PERSON_ACTOR_ID, "complete"]);
  assert.equal(receipt.message, undefined, "the page's message is not part of the receipt");
});

test("the CLI's demo remove deletes in its own process when no Host answers: no token, or the token of a Host that has stopped", { timeout: 120_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  await catalog.ensureDemoProject({ actor_id: "test-user", user_confirmed: true });
  // No token file in the Home: there never was a Host.
  const first = await demoRemoveCli(home, null);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(catalog.listProjects().some(project => project.data_class === "regenerable_demo"), false);
  assert.equal(catalog.listProjectDeletions()[0]?.actor_id, "molis-work-cli", "an in-process delete records the CLI as it always did");

  // The token stays behind when a Host stops; the address it had is closed now.
  await catalog.ensureDemoProject({ actor_id: "test-user", user_confirmed: true });
  await leaveTokenBehind(home);
  const second = await demoRemoveCli(home, `http://127.0.0.1:${await freePort()}`);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(catalog.listProjects().some(project => project.data_class === "regenerable_demo"), false);
});

test("the CLI's demo remove does not delete behind the back of a Host that refuses it: the answer of another Home's Host is an error", { timeout: 120_000 }, async t => {
  const { directory, home, catalog } = await scratchHome(t);
  const demo = (await catalog.ensureDemoProject({ actor_id: "test-user", user_confirmed: true })).project;
  // A Host of another Home answers at the address; this Home's token means nothing to it.
  const elsewhere = join(directory, "elsewhere");
  const other = await residentHost(t, elsewhere);
  t.after(other.stop);
  await leaveTokenBehind(home);

  const refused = await demoRemoveCli(home, other.origin);
  assert.notEqual(refused.status, 0, refused.stdout);
  assert.match(refused.stderr, /MOLIS_WORK_WEB_URL/, "it says how to point the command at the right Host");
  assert.equal(existsSync(demo.database_path), true, "the demo is still there");
  assert.equal(catalog.listProjectDeletions().length, 0);
});

// ---- How each door hears a refusal: documented in CALL-CHAINS chain 2 step 7 -----------------------------------------------

test("a Host of another Home refuses the MCP tool at the control-token gate with the one opaque refusal code, which the client passes on before any deletion request, and nothing is deleted", { timeout: 60_000 }, async t => {
  const { directory, home, catalog } = await scratchHome(t);
  const project = await catalog.createProject({ display_name: "别的 Home 的服务", actor_id: "test-user" });
  const localHost = createMolisWorkLocalHost({ homeDirectory: home });
  t.after(() => localHost.close());
  const other = await residentHost(t, join(directory, "elsewhere"));
  t.after(other.stop);
  await leaveTokenBehind(home);
  const mcp = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null, runtimeHost(home), localHost, other.origin);
  t.after(() => mcp.close());

  const refused = await callTool(mcp, "molis_work_v1_project_delete", { project_id: project.project_id, delete_confirmed: true, idempotency_key: "mcp-other-home" });
  assert.equal(refused.isError, true, refused.content[0]?.text);
  // The call meets the gate while the MCP lists its tools (the action gateway's client), so it never reaches the deletion request.
  assert.match(refused.content[0]?.text ?? "", /"code":"host\.request_refused"/, "the gate's 403 carries the one opaque refusal code, which the gateway passes on as it is");
  assert.match(refused.content[0]?.text ?? "", /本地控制请求校验失败/);
  assert.doesNotMatch(refused.content[0]?.text ?? "", /home_mismatch/, "that code is only reached by a Host whose token matches");
  assert.equal(existsSync(project.database_path), true);
  assert.equal(catalog.listProjectDeletions().length, 0, "the MCP process did not go on to delete in its own process");
});

test("RAC-1333 an unexpected failure of the demo removal answers the Host's generic 500 with a diagnostic id, and the CLI prints that sentence without leaking ENOENT or the local path", { timeout: 120_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  const demo = (await catalog.ensureDemoProject({ actor_id: "test-user", user_confirmed: true })).project;
  const { origin, token, stop } = await residentHost(t, home);
  t.after(stop);
  // The demo's directory was taken away from under the catalog, so moving it aside fails inside the Host.
  await rm(dirname(demo.database_path), { recursive: true, force: true });
  const remove = () => fetch(`${origin}/api/settings/demo`, { method: "POST",
    headers: { "content-type": "application/json", origin, "x-molis-work-control-token": token, "x-molis-work-idempotency-key": `demo-remove-failure-${randomUUID()}` },
    body: JSON.stringify({ action: "remove", user_confirmed: true }) });

  const failed = await remove();
  const raw = await failed.text();
  const body = JSON.parse(raw) as { error?: string; code?: string; diagnostic_id?: string };
  assert.equal(failed.status, 500, raw);
  assert.equal(body.code, "actions.execution_failed", "the unexpected failure is the Host's own, not the deletion's");
  assert.equal(typeof body.diagnostic_id, "string");
  assert.ok(body.diagnostic_id, "the answer carries a diagnostic id to look the failure up");
  assert.doesNotMatch(raw, /ENOENT/, "the internal failure's own text is not passed on, anywhere in the JSON body");
  assert.ok(!raw.includes(home), "the answer names no local path, anywhere in the JSON body");

  const refused = await demoRemoveCli(home, origin);
  assert.notEqual(refused.status, 0, refused.stdout);
  assert.ok((body.error ?? "") !== "", "the Host's generic sentence is there for the CLI to print");
  assert.ok(refused.stderr.includes(body.error!), "the CLI prints the message the Host gave");
  assert.doesNotMatch(refused.stderr, /ENOENT/, "neither does the CLI pass on the internal text");
  assert.ok(!refused.stderr.includes(home), "nor the local path");
  assert.ok(!refused.stderr.includes(body.code ?? "actions.execution_failed"), "the CLI prints no code, including the one this answer carries");
  assert.doesNotMatch(refused.stderr, /project_deletion\.failed/, "and none of the old code names");
  assert.equal(catalog.listProjectDeletions().length, 0, "the CLI did not go on to delete in its own process");
});
