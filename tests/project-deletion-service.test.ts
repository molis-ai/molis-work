import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { WebSocket } from "ws";
import { createHash, randomUUID } from "node:crypto";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer, ProjectDeletionService, createMolisWorkLocalHost, molisWorkHostProjectReference, type ProjectDeletionPorts } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

/**
 * Deleting a project is one Host service whichever door asks: the settings page, the MCP tool and the CLI's `demo remove` (when a
 * Host runs) all stop while one of the project's terminals is alive, all let go of the project's open runtime before its
 * directory moves, and all record who asked.
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

/** A running Web server (the resident Host) with one live terminal on the project, the way the deletion page test makes it. */
async function residentHostWithTerminal(t: TestContext, home: string, projectId: string, cwd: string, catalog: Catalog) {
  const { localHost, origin, token, stop } = await residentHost(t, home);
  const panel = catalog.openDesktopPanel({ project_id: projectId, goal_id: "goal-terminal", runtime_kind: "generic", launch_command: "/bin/cat", cwd, actor_id: "test-user", user_confirmed: true });
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

test("with the control token of a Host that has stopped, the connection is refused and the MCP tool deletes in its own process", { timeout: 60_000 }, async t => {
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
  assert.equal(deleted.isError, false, deleted.content[0]?.text);
  assert.equal((JSON.parse(deleted.content[0]!.text) as { deletion: { actor_id: string } }).deletion.actor_id, "runtime:codex:deletion-service-session", "the receipt names the MCP client and its Session");
  assert.equal(existsSync(project.database_path), false);
  assert.equal(localHost.status().projects.some(row => row.project_id === project.project_id), false, "the process's own runtime of the project was let go of");
});

test("a failure inside the resident Host keeps its own code and message in the MCP tool's answer: it is not made a transport failure", { timeout: 60_000 }, async t => {
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
  assert.match(failed.content[0]?.text ?? "", /"code":"project_deletion\.failed"/, "the code is the deletion's own");
  assert.doesNotMatch(failed.content[0]?.text ?? "", /transport_failed/);
  assert.equal(catalog.listProjectDeletions().length, 0, "nothing was recorded: the MCP process did not go on to delete in its own process");
});

test("the resident Host answers a deletion that fails inside it with a 500 and the failure's own code, and keeps 409, 400 and 403 for their cases", { timeout: 60_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  const project = await catalog.createProject({ display_name: "目录不见了", actor_id: "test-user" });
  const { origin, token, stop } = await residentHost(t, home);
  t.after(stop);
  let sequence = 0;
  const post = (body: Record<string, unknown>) => fetch(`${origin}/api/internal/project-deletion`, { method: "POST",
    headers: { "content-type": "application/json", origin, "x-molis-work-control-token": token, "x-molis-work-idempotency-key": `gateway-failure-${++sequence}` },
    body: JSON.stringify(body) });
  const request = { home_id: createHash("sha256").update(resolvePath(home)).digest("hex"), client_id: "runtime:codex", project_id: project.project_id,
    delete_confirmed: true, idempotency_key: "gateway-failure" };

  const foreign = await post({ ...request, home_id: "another-home" });
  assert.equal(foreign.status, 403, "a Host of another Home is a refusal");
  assert.equal(((await foreign.json()) as { code: string }).code, "actions.home_mismatch");
  const malformed = await post({ ...request, delete_confirmed: "yes" });
  assert.equal(malformed.status, 400);
  assert.equal(((await malformed.json()) as { code: string }).code, "actions.input_invalid");
  const unconfirmed = await post({ ...request, delete_confirmed: false });
  assert.equal(unconfirmed.status, 400);
  assert.equal(((await unconfirmed.json()) as { code: string }).code, "catalog.delete_confirmation_required");

  // The project's directory was taken away from under the catalog, so moving it aside fails inside the Host.
  await rm(dirname(project.database_path), { recursive: true, force: true });
  const failed = await post(request);
  const body = await failed.json() as { code: string; error: string };
  assert.equal(failed.status, 500, JSON.stringify(body));
  assert.equal(body.code, "project_deletion.failed", "the deletion's own failure, not a transport failure");
  assert.match(body.error, /ENOENT/, "the message names what failed");
  assert.equal(catalog.listProjectDeletions().length, 0, "nothing was recorded");
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
  const { localHost, origin, closeTerminal } = await residentHostWithTerminal(t, home, demo.project_id, directory, catalog);
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

test("a Host of another Home refuses the MCP tool at the control-token gate without a code, which the client reports as a transport denial before any deletion request, and nothing is deleted", { timeout: 60_000 }, async t => {
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
  assert.match(refused.content[0]?.text ?? "", /"code":"actions\.transport_denied"/, "the gate's 403 has no code of its own");
  assert.match(refused.content[0]?.text ?? "", /本地控制请求校验失败/);
  assert.doesNotMatch(refused.content[0]?.text ?? "", /home_mismatch/, "that code is only reached by a Host whose token matches");
  assert.equal(existsSync(project.database_path), true);
  assert.equal(catalog.listProjectDeletions().length, 0, "the MCP process did not go on to delete in its own process");
});

test("the settings route gives only a live terminal its own code and status; any other failure of the demo removal is a 400 with the message and no code, and the CLI prints that message", { timeout: 120_000 }, async t => {
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
  const body = await failed.json() as { error?: string; code?: string };
  assert.equal(failed.status, 400, JSON.stringify(body));
  assert.match(body.error ?? "", /ENOENT/, "the message names what failed");
  assert.equal(Object.hasOwn(body, "code"), false, "the settings route carries a code only for a live terminal");

  const refused = await demoRemoveCli(home, origin);
  assert.notEqual(refused.status, 0, refused.stdout);
  assert.match(refused.stderr, /ENOENT/, "the CLI prints the message the Host gave");
  assert.doesNotMatch(refused.stderr, /project_deletion\.failed|catalog\.[a-z_]+/, "and no code");
  assert.equal(catalog.listProjectDeletions().length, 0, "the CLI did not go on to delete in its own process");
});
