import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { TestContext } from "node:test";
import { WebSocket } from "ws";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { WEB_CONTROL_TOKEN_RELATIVE_PATH } from "@molis-ai/molis-work-app-local-host";
import { addTerminalGoal, goalTerminalsPath, linkTerminalFolder } from "./goal-terminal.js";

/** The Goal whose terminal the shutdown journeys keep running (only Goals starts one; the channel attaches). */
export const ENTRY_TERMINAL_GOAL = "SHUTDOWN";

export function entryRequestHeaders(home: string, origin: string): Record<string, string> {
  return { origin, "content-type": "application/json", "x-molis-work-control-token": readFileSync(join(home, WEB_CONTROL_TOKEN_RELATIVE_PATH), "utf8").trim(), "x-molis-work-idempotency-key": randomUUID() };
}

export async function seedEntryProject(homeDirectory: string): Promise<string> {
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  try {
    const project = await catalog.createProject({ display_name: "Shutdown stream fixture", actor_id: "test-user" });
    catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "files", actor_id: "test-user" });
    const folder = join(homeDirectory, "entry-workspace");
    mkdirSync(folder, { recursive: true });
    await linkTerminalFolder(catalog, project.project_id, realpathSync(folder));
    addTerminalGoal(project, ENTRY_TERMINAL_GOAL);
    return project.project_id;
  } finally { await catalog.close(); }
}

/** The actual IM HTTP/session/room/SSE owners; no replacement stream handler. */
export async function openEntryEventStream(t: TestContext, origin: string, home: string, projectId: string) {
  const session = await fetch(origin + "/im/api/session");
  assert.equal(session.status, 200);
  const cookie = session.headers.get("set-cookie")!.split(";")[0]!;
  await session.text();
  const post = async (route: string, body: unknown) => {
    const response = await fetch(origin + route, { method: "POST", headers: { ...entryRequestHeaders(home, origin), cookie }, body: JSON.stringify(body) });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json() as Promise<{ room: { id: string } }>;
  };
  await post("/im/api/session", { display_name: "Shutdown fixture", client_id: randomUUID() });
  await post("/projects/" + projectId + "/api/im/connect", {});
  const { room } = await post("/im/api/projects/" + projectId + "/room", {});
  const response = await fetch(origin + "/im/api/rooms/" + room.id + "/events", { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/);
  const reader = response.body!.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /event: ready/);
  let ended = false;
  const closed = (async () => {
    try { while (!(await reader.read()).done) { /* A live SSE may heartbeat before shutdown. */ } }
    catch { /* A stopped transport may end with a reset rather than an SSE trailer. */ }
    ended = true;
  })();
  t.after(async () => { await reader.cancel().catch(() => undefined); await closed; });
  return { closed, ended: () => ended };
}

// The PTY child writes its pid with writeFileSync, which creates the file before it fills it: until the number is there, the file names
// no process (Number("") is 0). The same reading as pidIn in tests/ci-linux-probe.test.ts and waitForPid in tests/ci-product-subset.test.ts.
function pidIn(file: string): number {
  const pid = existsSync(file) ? Number(readFileSync(file, "utf8")) : 0;
  return Number.isSafeInteger(pid) && pid > 0 ? pid : 0;
}

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; return false; }
}

/** Real authenticated PTY WebSocket attached to a real child Goals started in the project (`seedEntryProject`), owned by the Host's PTY. */
export async function openEntryTerminal(t: TestContext, origin: string, home: string, projectId: string) {
  const socket = new WebSocket(origin.replace("http:", "ws:") + "/pty", { origin });
  const closed = new Promise<void>(resolve => { socket.once("close", resolve); });
  await once(socket, "open");
  const ready = once(socket, "message");
  socket.send(JSON.stringify({ type: "auth", token: readFileSync(join(home, WEB_CONTROL_TOKEN_RELATIVE_PATH), "utf8").trim() }));
  assert.equal(JSON.parse(String((await ready)[0])).type, "ready");
  const pidFile = join(home, "shutdown-pty.pid");
  let pid: number | undefined;
  t.after(async () => {
    socket.terminate(); await closed;
    const child = pid ?? pidIn(pidFile);
    if (child && processAlive(child)) process.kill(child, "SIGKILL");
  });
  const opened = await fetch(origin + goalTerminalsPath(projectId, ENTRY_TERMINAL_GOAL), { method: "POST", headers: entryRequestHeaders(home, origin),
    body: JSON.stringify({ key: "shutdown", command: process.execPath, args: ["-e", 'require("node:fs").writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)', pidFile] }) });
  assert.equal(opened.status, 200, await opened.clone().text());
  const spawned = once(socket, "message");
  socket.send(JSON.stringify({ type: "spawn", panelId: (await opened.json() as { panel_id: string }).panel_id, attachOnly: true }));
  const reply = JSON.parse(String((await spawned)[0]));
  const until = Date.now() + 2000;
  while (pidIn(pidFile) === 0 && Date.now() < until) await delay(20);
  const observedPid = pidIn(pidFile);
  if (observedPid) pid = observedPid;
  assert.equal(reply.type, "spawned");
  assert.ok(existsSync(pidFile), "the real PTY child started");
  assert.ok(Number.isSafeInteger(observedPid) && observedPid > 0 && processAlive(observedPid));
  const stopped = async () => {
    const deadline = Date.now() + 1500;
    while (processAlive(pid!) && Date.now() < deadline) await delay(20);
    assert.equal(processAlive(pid!), false, "the server close owner killed its real PTY child");
  };
  return { socket, closed, stopped };
}
