import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { request } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import { acquireStorageOwner } from "@molis-ai/molis-work-storage";
import { openEntryEventStream, openEntryTerminal, seedEntryProject, entryRequestHeaders } from "./fixtures/desktop-entry-streams.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const cliEntry = join(root, "dist/cli/main.js");
const webEntry = join(root, "dist/web/server.js");
const preload = fileURLToPath(new URL("./fixtures/desktop-entry-faults.mjs", import.meta.url));
for (const entry of [cliEntry, webEntry]) assert.ok(existsSync(entry), "Desktop launcher build is missing; run pnpm build");
const flags = ["--no-warnings", "--unhandled-rejections=strict", "--experimental-test-module-mocks"];

interface Observed {
  transport: number; transportClosed: boolean; host: number; hostClosed: boolean;
  args: string[]; order: string[];
  pendingClosed?: boolean;
  socketCloseDropped?: boolean;
}
interface Exit { code: number | null; signal: NodeJS.Signals | null }

function home(t: TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), "molis-desktop-entry-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function cli(t: TestContext, args: string[], mode?: string) {
  const directory = home(t), report = join(directory, "observed.json");
  const result = spawnSync(process.execPath, [...flags, ...(mode ? ["--import", preload] : []), cliEntry, ...args], {
    cwd: root, encoding: "utf8", timeout: 15_000,
    env: { ...process.env, MOLIS_WORK_HOME: directory, MOLIS_WORK_DEBUG: "",
      MOLIS_WORK_TEST_DESKTOP_FAULT: mode, MOLIS_WORK_TEST_DESKTOP_REPORT: report },
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, result.stderr);
  return { ...result, directory, observed: mode ? JSON.parse(readFileSync(report, "utf8")) as Observed : undefined };
}

async function message(child: ChildProcess, exited: Promise<Exit>): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    return await Promise.race([
      once(child, "message", { signal: controller.signal }).then(([value]) => value as Record<string, unknown>),
      exited.then(value => { throw new Error(`Desktop exited before its IPC handshake: ${JSON.stringify(value)}`); }),
    ]);
  } finally {
    clearTimeout(timer); controller.abort();
  }
}

async function web(t: TestContext, mode: string, prepare?: (directory: string) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "molis-desktop-entry-")), report = join(directory, "observed.json");
  try { await prepare?.(directory); }
  catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
  const child = spawn(process.execPath, [...flags, "--import", preload, webEntry, "--home", directory, "--port", "0"], {
    cwd: root, stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { ...process.env, MOLIS_WORK_HOME: directory, MOLIS_WORK_DEBUG: "",
      MOLIS_WORK_TEST_DESKTOP_FAULT: mode, MOLIS_WORK_TEST_DESKTOP_REPORT: report },
  });
  let stdout = "", stderr = "";
  child.stdout!.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  child.stderr!.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  const exited = new Promise<Exit>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const deadline = setTimeout(() => child.kill("SIGKILL"), 15_000);
  deadline.unref();
  child.once("close", () => clearTimeout(deadline));
  t.after(async () => {
    try {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await exited;
    } finally {
      clearTimeout(deadline); rmSync(directory, { recursive: true, force: true });
    }
  });
  const ready = await message(child, exited);
  assert.equal(ready.type, "ready", stderr);
  assert.equal(typeof ready.port, "number");
  return { directory, child, exited, origin: `http://127.0.0.1:${ready.port}`, stdout: () => stdout, stderr: () => stderr,
    observed: () => JSON.parse(readFileSync(report, "utf8")) as Observed };
}

function log(stderr: string, directory: string, event: string, area: string, error = true) {
  const lines = stderr.trim().split("\n").filter(Boolean);
  assert.equal(lines.length, 1, stderr);
  const { at, ...entry } = JSON.parse(lines[0]) as { at: string; [key: string]: unknown };
  assert.ok(!Number.isNaN(Date.parse(at)));
  assert.equal(entry.level, "error");
  assert.equal(entry.area, area);
  assert.equal(entry.event, event);
  assert.deepEqual(entry.error, error ? { name: "Error", code: "EIO" } : undefined);
  assert.doesNotMatch(stderr, /desktop-private|personal|stack|message/);
  assert.equal(stderr.includes(directory), false);
  return entry;
}

test("RAC-118 Desktop CLI preserves normal help, argument forwarding and returned exit codes", t => {
  const help = cli(t, ["--help"]);
  assert.equal(help.status, 0);
  assert.equal(help.stderr, "");
  assert.match(help.stdout, /^Molis Work commands:/);
  const forwarded = cli(t, ["probe", "desktop-private-argument"], "cli-success");
  assert.equal(forwarded.status, 7);
  assert.equal(forwarded.stderr, "");
  assert.deepEqual(forwarded.observed?.args, ["probe", "desktop-private-argument"]);
});

test("RAC-118 Desktop CLI unexpected rejection exits 1 with one safe structured diagnostic", t => {
  const failed = cli(t, ["probe", "desktop-private-argument"], "cli-reject");
  assert.equal(failed.status, 1);
  assert.equal(failed.stdout, "");
  assert.deepEqual(failed.observed?.args, ["probe", "desktop-private-argument"]);
  log(failed.stderr, failed.directory, "entry_failed", "cli");
});

test("RAC-119 Desktop Web normal signal waits for real HTTP and Host cleanup, then exits 0", async t => {
  const f = await web(t, "normal");
  const response = await fetch(`${f.origin}/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { desktop_tui: boolean }).desktop_tui, true);
  assert.equal(f.child.kill("SIGTERM"), true);
  assert.deepEqual(await f.exited, { code: 0, signal: null });
  assert.deepEqual(f.observed(), { transport: 1, transportClosed: true, host: 1, hostClosed: true, args: [], order: ["transport", "transport_done", "host"] });
  assert.equal(f.stderr(), "");
  assert.ok(f.stdout().includes(`Molis Work Web: ${f.origin}`));
  assert.ok(f.stdout().includes("项目列表（网页不会修改 Runtime Session 绑定）"));
});

test("RAC-119 Desktop Web stops live SSE and upgraded PTY connections with real cleanup and exit 0", async t => {
  let projectId = "";
  const f = await web(t, "live-streams", async directory => { projectId = await seedEntryProject(directory); });
  const stream = await openEntryEventStream(t, f.origin, f.directory, projectId);
  const terminal = await openEntryTerminal(t, f.origin, f.directory, projectId);
  const revision = await fetch(`${f.origin}/projects/${projectId}/api/plugins/io.molis.work.files/view-revision`);
  assert.equal(revision.status, 200);
  assert.equal(typeof (await revision.json() as { revision: string }).revision, "string", "view-revision answers JSON rather than holding a poll");
  assert.equal(stream.ended(), false);
  assert.equal(terminal.socket.readyState, terminal.socket.OPEN);
  assert.equal(f.child.kill("SIGTERM"), true);
  assert.deepEqual(await f.exited, { code: 0, signal: null }, JSON.stringify({ stderr: f.stderr(), observed: f.observed() }));
  await Promise.all([stream.closed, terminal.closed, terminal.stopped()]);
  assert.equal(f.observed().transport, 1);
  assert.equal(f.observed().transportClosed, true);
  assert.equal(f.observed().hostClosed, true);
  assert.doesNotMatch(f.stderr(), /"level":"error"|shutdown_timed_out|shutdown_failed/);
});

test("RAC-119 Desktop Web ends a real SSE whose owner has not ended it before HTTP close", async t => {
  let projectId = "";
  const f = await web(t, "live-sse", async directory => { projectId = await seedEntryProject(directory); });
  const stream = await openEntryEventStream(t, f.origin, f.directory, projectId);
  assert.equal(stream.ended(), false);
  assert.equal(f.child.kill("SIGTERM"), true);
  assert.deepEqual(await f.exited, { code: 0, signal: null }, JSON.stringify({ stderr: f.stderr(), observed: f.observed() }));
  await stream.closed;
  assert.equal(f.observed().transportClosed, true);
  assert.equal(f.observed().hostClosed, true);
  assert.doesNotMatch(f.stderr(), /"level":"error"|shutdown_timed_out|shutdown_failed/);
});

test("RAC-119 Desktop Web disconnects an unfinished authorized HTTP request before successful exit", async t => {
  const f = await web(t, "live-http");
  const entered = message(f.child, f.exited);
  let answered = false;
  const pending = request(`${f.origin}/api/settings/projects`, { method: "POST", headers: { ...entryRequestHeaders(f.directory, f.origin), "content-length": "128" } }, response => { answered = true; response.resume(); });
  const disconnected = new Promise<void>(resolve => { pending.once("close", resolve); });
  pending.on("error", () => { /* Shutdown may reset a request whose body has not finished. */ });
  t.after(() => { pending.destroy(); });
  pending.write('{"display_name":');
  assert.equal((await entered).type, "pending-request");
  assert.equal(pending.destroyed, false);
  assert.equal(answered, false);
  assert.equal(f.child.kill("SIGTERM"), true);
  assert.deepEqual(await f.exited, { code: 0, signal: null }, JSON.stringify({ stderr: f.stderr(), observed: f.observed() }));
  await disconnected;
  assert.equal(f.observed().pendingClosed, true, JSON.stringify({ stderr: f.stderr(), observed: f.observed() }));
  assert.equal(f.observed().transportClosed, true);
  assert.equal(f.observed().hostClosed, true);
  assert.doesNotMatch(f.stderr(), /"level":"error"|shutdown_timed_out|shutdown_failed/);
});

test("RAC-119 Desktop Web reports callback or Host cleanup failure without claiming success", async t => {
  for (const mode of ["transport-reject", "host-reject"]) await t.test(mode, async t => {
    const f = await web(t, mode);
    // RAC-105-A-19: the child really holds the Home, including before any Agent work.
    const storageRoot=join(f.directory,"agent-runtime");
    assert.ok(existsSync(join(storageRoot,".molis-runtime-owner.db")));
    assert.throws(()=>acquireStorageOwner(storageRoot),{code:"storage.owner.busy"});
    assert.equal(f.child.kill("SIGINT"), true);
    assert.deepEqual(await f.exited, { code: 1, signal: null });
    assert.deepEqual(f.observed(), mode==="transport-reject"
      ? { transport: 1, transportClosed: true, host: 0, hostClosed: false, args: [], order: ["transport", "transport_done"] }
      : { transport: 1, transportClosed: true, host: 1, hostClosed: true, args: [], order: ["transport", "transport_done", "host"] });
    // A transport refusal prevents actual resource disposal; only process exit releases this failed entry's owner.
    const released=acquireStorageOwner(storageRoot);released.release();
    log(f.stderr(), f.directory, "shutdown_failed", "web");
  });
});

test("RAC-119 Desktop Web synchronous close refusal is diagnosed once without raw details", async t => {
  const f = await web(t, "transport-throw");
  assert.equal(f.child.kill("SIGTERM"), true);
  assert.deepEqual(await f.exited, { code: 1, signal: null });
  assert.equal(f.observed().transport, 1);
  assert.equal(f.observed().host, 0);
  log(f.stderr(), f.directory, "shutdown_failed", "web");
});

test("RAC-119 Desktop Web unfinished cleanup keeps its deadline alive and repeated signals never repeat close", async t => {
  for (const mode of ["transport-blocked", "host-blocked", "socket-close-blocked"]) await t.test(mode, async t => {
    const f = await web(t, mode);
    if (mode === "socket-close-blocked") {
      const response = await fetch(`${f.origin}/health`);
      assert.equal(response.status, 200); await response.text();
    }
    const closing = message(f.child, f.exited);
    const started = Date.now();
    assert.equal(f.child.kill("SIGTERM"), true);
    assert.equal((await closing).type, "closing");
    if (mode === "transport-blocked") assert.equal(f.child.kill("SIGINT"), true);
    assert.deepEqual(await f.exited, { code: 1, signal: null });
    assert.ok(Date.now() - started >= 1800, "unfinished cleanup must retain the real two-second deadline");
    const observed = f.observed();
    assert.equal(observed.transport, 1);
    assert.equal(observed.host, mode === "transport-blocked" ? 0 : 1);
    assert.equal(observed.hostClosed, mode !== "transport-blocked");
    if (mode === "socket-close-blocked") assert.equal(observed.socketCloseDropped, true);
    assert.deepEqual(log(f.stderr(), f.directory, "shutdown_timed_out", "web", false).fields, {
      deadline_ms: 2000, remaining_cleanup_skipped: true,
    });
  });
});
