import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const entry = join(root, "apps/server/dist/main.js"); // The package's documented `start` entry, launched as a program.
const fixture = fileURLToPath(new URL("./fixtures/server-cli-close.mjs", import.meta.url));
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
