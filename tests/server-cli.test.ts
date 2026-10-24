import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const entry = join(root, "apps/server/dist/main.js"); // The package's documented `start` entry, launched as a program.
assert.ok(existsSync(entry), "Server CLI build is missing; run pnpm build before tests/server-cli.test.ts");
const fixture = fileURLToPath(new URL("./fixtures/server-cli-close.mjs", import.meta.url));
const stdoutFixture = fileURLToPath(new URL("./fixtures/server-cli-stdout.mjs", import.meta.url));
const help = "serve --state DIR --config FILE --host-home DIR [--host-url http://127.0.0.1:4173] [--port 4187]\n"
  + "For LAN add --hostname ADDRESS --origin https://ADDRESS:PORT --cert FILE --key FILE\n"
  + "authorize --state DIR --member ID --project ID --control-token-file FILE [--host-url URL] [--revoke]\n"
  + "members --state DIR\nrestore --bundle FILE --destination DIR\nread-assets --destination DIR --project SOURCE_PROJECT_ID\n";

function home(t: TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), "molis-server-cli-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function command(directory: string, args: string[], options: { preload?: boolean; env?: Record<string, string> } = {}) {
  const result = spawnSync(process.execPath, ["--no-warnings", "--unhandled-rejections=strict",
    ...(options.preload ? ["--import", fixture] : []), entry, ...args], {
    cwd: root, encoding: "utf8", timeout: 30_000,
    env: { ...process.env, MOLIS_WORK_HOME: directory, MOLIS_WORK_DEBUG: "", ...options.env },
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, result.stderr);
  return result;
}

function serve(t: TestContext, mode: string, signal = "SIGINT", repeat = false, debug = false, origin?: string) {
  const directory = home(t), state = join(directory, "server"), report = join(directory, "close.json");
  const config = join(directory, "config.json");
  writeFileSync(config, JSON.stringify({ projects: [] }));
  const result = command(directory, ["serve", "--state", state, "--config", config, "--host-home", directory, "--port", "0", ...(origin ? ["--origin", origin] : [])], {
    preload: true,
    env: { MOLIS_WORK_DEBUG: debug ? "server" : "", MOLIS_WORK_TEST_SERVER_CLOSE: mode, MOLIS_WORK_TEST_SERVER_SIGNAL: signal,
      MOLIS_WORK_TEST_SERVER_REPEAT: repeat ? "yes" : "no", MOLIS_WORK_TEST_SERVER_REPORT: report },
  });
  const observed = JSON.parse(readFileSync(report, "utf8"));
  assert.deepEqual(observed, repeat ? { transport: 1, storage: 0, storageClosed: false, order: ["transport"] }
    : { transport: 1, storage: 1, storageClosed: mode !== "storage" && mode !== "both",
    order: ["transport", "transport_done", "storage"] });
  return { result, directory, state };
}

function assertForcedLog(stderr: string, signal: string): void {
  const records = stderr.trim().split("\n").map(line => JSON.parse(line));
  assert.equal(records.length, 1);
  const { at, ...record } = records[0];
  assert.ok(!Number.isNaN(Date.parse(at)));
  assert.deepEqual(record, { level: "warn", area: "server", event: "shutdown_forced",
    fields: { signal, remaining_cleanup_skipped: true } });
}

function closedPipe(t: TestContext, args: (directory: string) => string[]) {
  const directory = mkdtempSync(join(tmpdir(), "molis-server-pipe-"));
  const child = spawn(process.execPath, ["--no-warnings", "--unhandled-rejections=strict", "--import", stdoutFixture, entry, ...args(directory)], {
    cwd: root, stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { ...process.env, MOLIS_WORK_HOME: directory, MOLIS_WORK_DEBUG: "" },
  });
  let stderr = "";
  child.stderr!.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
    rmSync(directory, { recursive: true, force: true });
  });
  // Close the real pipe's read end before the product imports finish, without mocking stdout.write.
  child.stdout!.destroy();
  return { child, exited, stderr: () => stderr };
}

async function forceShutdown(t: TestContext, first: NodeJS.Signals, second: NodeJS.Signals) {
  const directory = home(t), report = join(directory, "close.json"), config = join(directory, "config.json");
  writeFileSync(config, JSON.stringify({ projects: [] }));
  const child = spawn(process.execPath, ["--no-warnings", "--unhandled-rejections=strict", "--import", fixture, entry,
    "serve", "--state", join(directory, "server"), "--config", config, "--host-home", directory, "--port", "0"], {
    cwd: root, stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { ...process.env, MOLIS_WORK_HOME: directory, MOLIS_WORK_DEBUG: "", MOLIS_WORK_TEST_SERVER_CLOSE: "blocked",
      MOLIS_WORK_TEST_SERVER_REPORT: report },
  });
  let stderr = "";
  child.stdout!.resume();
  child.stderr!.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  const exited = once(child, "close");
  const message = () => Promise.race([
    once(child, "message", { signal: t.signal }).then(([payload]) => payload),
    exited.then(result => { throw new Error(`Server exited before signal handshake: ${JSON.stringify(result)} ${stderr}`); }),
  ]);
  try {
    assert.equal(await message(), "ready");
    const closing = message();
    assert.equal(child.kill(first), true);
    assert.equal(await closing, "closing");
    assert.equal(child.exitCode, null, "the first signal must wait for the blocked cleanup");
    const forcedExit = once(child, "close", { signal: AbortSignal.timeout(3_000) });
    assert.equal(child.kill(second), true);
    const [code, signal] = await forcedExit;
    assert.equal(signal, null, stderr);
    assert.deepEqual(JSON.parse(readFileSync(report, "utf8")), {
      transport: 1, storage: 0, storageClosed: false, order: ["transport"],
    }, "a repeated signal must not start cleanup again or claim the skipped storage close ran");
    return { code, stderr };
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
  }
}

test("RAC-110: server help, JSON output and startup instructions retain stdout and stay out of stderr", t => {
  const directory = home(t);
  const result = command(directory, []);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, help);
  assert.equal(result.stderr, "");
  const members = command(directory, ["members", "--state", join(directory, "empty-server")]);
  assert.equal(members.status, 0, members.stderr);
  assert.equal(members.stdout, "[]\n");
  assert.equal(members.stderr, "");

  const started = serve(t, "ok");
  assert.equal(started.result.status, 0, started.result.stderr);
  assert.equal(started.result.stderr, "");
  const owner = JSON.parse(readFileSync(join(started.state, "owner.json"), "utf8"));
  const lines = started.result.stdout.split("\n");
  assert.match(lines[0], /^Molis Work Server: http:\/\/127\.0\.0\.1:[1-9]\d*\/continuity$/);
  assert.equal(lines[1], `Owner pairing code: ${join(started.state, "connect.json")} (10 minutes)`);
  assert.equal(lines[2], `Host action client: runtime:cross-device:${owner.id}`);
  assert.equal(lines[3], "Required action grants: goals.state.read@1, goals.progress.record@1, goals.progress.receipt@1, artifacts.read@1");
  assert.deepEqual(lines.slice(4), [""]);
  const listed = command(started.directory, ["members", "--state", started.state]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(listed.stderr, "");
  assert.equal(listed.stdout, JSON.stringify([{ id: owner.id, display_name: owner.display_name, project_id: null, role: null }], null, 2) + "\n");
});

test("RAC-110: the default startup guide preserves --origin instead of printing the bound address", t => {
  const origin = "http://work.example.test:4187";
  const { result } = serve(t, "ok", "SIGTERM", false, false, origin);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.split("\n")[0], `Molis Work Server: ${origin}/continuity`);
  assert.doesNotMatch(result.stdout, /http:\/\/(?:127\.0\.0\.1|0\.0\.0\.0):/);
});

test("RAC-110: listening diagnostics use the Host debug log without moving pairing details into it", t => {
  const { result } = serve(t, "ok", "SIGTERM", false, true);
  assert.equal(result.status, 0, result.stderr);
  const records = result.stderr.trim().split("\n").map(line => JSON.parse(line));
  assert.equal(records.length, 1);
  const { at, fields, ...record } = records[0];
  assert.ok(!Number.isNaN(Date.parse(at)));
  assert.deepEqual(record, { level: "debug", area: "server", event: "listening" });
  assert.ok(Number.isInteger(fields.port) && fields.port > 0 && fields.port <= 65535);
  assert.deepEqual({ ...fields, port: 0 }, { address: "127.0.0.1", port: 0, tls: false });
  assert.equal(result.stdout.split("\n")[0], `Molis Work Server: http://127.0.0.1:${fields.port}/continuity`);
  assert.doesNotMatch(result.stderr, /connect\.json|pairing|runtime:cross-device|Required action grants/);
});

test("RAC-110: help and members exit 0 without stderr when the stdout reader closes early", { timeout: 30_000 }, async t => {
  for (const args of [() => [], (directory: string) => ["members", "--state", join(directory, "server")]]) {
    const running = closedPipe(t, args);
    assert.deepEqual(await running.exited, { code: 0, signal: null }, running.stderr());
    assert.equal(running.stderr(), "");
  }
});

test("RAC-110: serve responds over HTTP after stdout closes and still shuts down normally", { timeout: 30_000 }, async t => {
  const running = closedPipe(t, directory => {
    const config = join(directory, "config.json");
    writeFileSync(config, JSON.stringify({ projects: [] }));
    return ["serve", "--state", join(directory, "server"), "--config", config, "--host-home", directory, "--port", "0"];
  });
  const [port] = await Promise.race([
    once(running.child, "message"),
    running.exited.then(result => { throw new Error(`Server exited before readiness: ${JSON.stringify(result)} ${running.stderr()}`); }),
  ]);
  assert.equal(typeof port, "number");
  const response = await fetch(`http://127.0.0.1:${port}/continuity/api/session`, { signal: AbortSignal.timeout(5_000) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { member: null, projects: [], devices: [] });
  assert.equal(running.child.exitCode, null);
  assert.equal(running.stderr(), "");
  running.child.kill("SIGTERM");
  assert.deepEqual(await running.exited, { code: 0, signal: null }, running.stderr());
  assert.equal(running.stderr(), "");
});

test("RAC-110: stdout errors other than EPIPE remain visible and fail the command", t => {
  const directory = home(t), file = join(directory, "read-only.txt");
  writeFileSync(file, "not a writable output");
  const fd = openSync(file, "r");
  try {
    const result = spawnSync(process.execPath, ["--no-warnings", entry], {
      cwd: root, stdio: ["ignore", fd, "pipe"], encoding: "utf8", timeout: 30_000,
      env: { ...process.env, MOLIS_WORK_HOME: directory, MOLIS_WORK_DEBUG: "" },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /EBADF/);
    assert.equal(readFileSync(file, "utf8"), "not a writable output");
  } finally { closeSync(fd); }
});

test("RAC-111: shutdown failure logs each phase without private details, closes storage and exits 1", t => {
  for (const mode of ["transport", "storage", "both"]) {
    const { result } = serve(t, mode);
    assert.equal(result.status, 1, result.stderr);
    const records = result.stderr.trim().split("\n").map(line => JSON.parse(line));
    const phases = mode === "both" ? ["transport", "storage"] : [mode];
    assert.deepEqual(records.map(({ at, ...record }) => {
      assert.ok(!Number.isNaN(Date.parse(at)));
      return record;
    }), phases.map(phase => ({ level: "error", area: "server", event: "shutdown_failed",
      error: { name: "Error", code: `server.${phase}_close_failed` }, fields: { phase } })));
    assert.doesNotMatch(result.stderr, /private shutdown|personal|\/tmp\/|stack|message/);
  }
});

test("RAC-111: SIGTERM closes normally; repeated signals still start transport cleanup only once", t => {
  const normal = serve(t, "ok", "SIGTERM");
  assert.equal(normal.result.status, 0, normal.result.stderr);
  assert.equal(normal.result.stderr, "");
  // The coordinator's decision changes the second signal to force exit; the one-close invariant is retained in serve().
  for (const mode of ["ok", "transport"]) {
    const interrupted = serve(t, mode, "SIGINT", true);
    assert.equal(interrupted.result.status, 143, interrupted.result.stderr);
    assertForcedLog(interrupted.result.stderr, "SIGTERM");
  }
});

test("RAC-111: a second OS signal exits blocked cleanup immediately and logs the skipped remainder once", { timeout: 60_000 }, async t => {
  for (const first of ["SIGINT", "SIGTERM"] as const) {
    for (const second of ["SIGINT", "SIGTERM"] as const) {
      await t.test(`${first} then ${second}`, async t => {
        const result = await forceShutdown(t, first, second);
        assert.equal(result.code, second === "SIGINT" ? 130 : 143, result.stderr);
        assertForcedLog(result.stderr, second);
      });
    }
  }
});
