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

function serve(t: TestContext, mode: string, signal = "SIGINT", repeat = false) {
  const directory = home(t), state = join(directory, "server"), report = join(directory, "close.json");
  const config = join(directory, "config.json");
  writeFileSync(config, JSON.stringify({ projects: [] }));
  const result = command(directory, ["serve", "--state", state, "--config", config, "--host-home", directory, "--port", "0"], {
    preload: true,
    env: { MOLIS_WORK_TEST_SERVER_CLOSE: mode, MOLIS_WORK_TEST_SERVER_SIGNAL: signal,
      MOLIS_WORK_TEST_SERVER_REPEAT: repeat ? "yes" : "no", MOLIS_WORK_TEST_SERVER_REPORT: report },
  });
  const observed = JSON.parse(readFileSync(report, "utf8"));
  assert.deepEqual(observed, { transport: 1, storage: 1, storageClosed: mode !== "storage" && mode !== "both",
    order: ["transport", "transport_done", "storage"] });
  return { result, directory, state };
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
  assert.match(lines[0]!, /^Molis Work Server: http:\/\/127\.0\.0\.1:\d+\/continuity$/);
  assert.equal(lines[1], `Owner pairing code: ${join(started.state, "connect.json")} (10 minutes)`);
  assert.equal(lines[2], `Host action client: runtime:cross-device:${owner.id}`);
  assert.equal(lines[3], "Required action grants: goals.state.read@1, goals.progress.record@1, goals.progress.receipt@1, artifacts.read@1");
  assert.deepEqual(lines.slice(4), [""]);
  const listed = command(started.directory, ["members", "--state", started.state]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(listed.stderr, "");
  assert.equal(listed.stdout, JSON.stringify([{ id: owner.id, display_name: owner.display_name, project_id: null, role: null }], null, 2) + "\n");
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

test("RAC-111: SIGTERM also closes normally; repeated signals cannot close twice or hide a pending failure", t => {
  const normal = serve(t, "ok", "SIGTERM", true);
  assert.equal(normal.result.status, 0, normal.result.stderr);
  assert.equal(normal.result.stderr, "");
  const failed = serve(t, "transport", "SIGINT", true);
  assert.equal(failed.result.status, 1, failed.result.stderr);
  assert.equal(failed.result.stderr.trim().split("\n").length, 1);
  assert.equal(JSON.parse(failed.result.stderr).fields.phase, "transport");
});
