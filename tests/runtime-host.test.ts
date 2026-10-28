import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";

test("Terminal PTY supports attach, input, process exit cleanup, and a fresh recovery spawn", async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "molis-work-runtime-host-"));
  const output: string[] = [];
  const exits: Array<{ panelId: string; code: number }> = [];
  let wake: () => void = () => undefined;
  const changed = () => new Promise<void>((resolve) => { wake = resolve; });
  const host = new MolisWorkPtyHost({
    onData(panelId, data) {
      output.push(`${panelId}:${data}`);
      wake();
    },
    onExit(panelId, exit) {
      exits.push({panelId, code: exit.exitCode});
      wake();
    },
  });

  try {
    host.spawn({ panelId: "live", command: "/bin/sh", args: ["-c", 'printf "ready:%s\\n" "$$"; exec cat'], cwd });
    await waitUntil(() => /ready:(\d+)/.test(output.join("")), changed);
    const pid = Number(/ready:(\d+)/.exec(output.join(""))![1]);
    const attached = host.spawn({ panelId: "live", attachOnly: true, cols: 100, rows: 30 });
    assert.equal(attached.attached, true);
    assert.match(attached.replay, /ready/);
    host.write("live", "hello\n");
    await waitUntil(() => output.join("").includes("hello"), changed);
    host.kill("live");
    assert.equal(host.alive("live"), false);
    await waitUntil(() => processExited(pid), changed);

    host.spawn({ panelId: "live", command: "/bin/sh", args: ["-c", "exit 17"], cwd });
    await waitUntil(() => exits.some(exit => exit.panelId === "live"), changed);
    assert.deepEqual(exits, [{panelId:"live",code:17}]);
    assert.equal(host.alive("live"), false);
    host.spawn({ panelId: "live", command: "/bin/sh", args: ["-c", "printf restarted"], cwd });
    await waitUntil(() => exits.length === 2, changed);
    assert.deepEqual(exits[1], {panelId:"live",code:0});
    assert.match(output.join(""), /restarted/);
  } finally {
    host.killAll();
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("Terminal PTY forwards Ctrl-C and killAll terminates every active process", async () => {
  const output = new Map<string, string>();
  const exited = new Set<string>();
  const host = new MolisWorkPtyHost({
    onData(id, data) { output.set(id, (output.get(id) ?? "") + data); },
    onExit(id) { exited.add(id); },
  });
  const tick = () => new Promise<void>(resolve => setTimeout(resolve, 25));
  try {
    host.spawn({
      panelId: "interrupt", command: "/bin/sh", cwd: os.tmpdir(),
      args: ["-c", "trap 'printf interrupted; exit 0' INT; printf ready; while :; do sleep 1; done"],
    });
    await waitUntil(() => (output.get("interrupt") ?? "").includes("ready"), tick);
    host.write("interrupt", "\u0003");
    await waitUntil(() => exited.has("interrupt"), tick);
    assert.match(output.get("interrupt") ?? "", /interrupted/);
    assert.equal(host.alive("interrupt"), false);

    for (const id of ["one", "two"]) {
      host.spawn({panelId:id, command:"/bin/sh", cwd:os.tmpdir(), args:["-c", 'printf "pid:%s\\n" "$$"; exec cat']});
    }
    await waitUntil(() => ["one", "two"].every(id => /pid:(\d+)/.test(output.get(id) ?? "")), tick);
    const pids = ["one", "two"].map(id => Number(/pid:(\d+)/.exec(output.get(id)!)![1]));
    host.killAll();
    await waitUntil(() => pids.every(processExited), tick);
    assert.equal(host.alive("one"), false);
    assert.equal(host.alive("two"), false);
  } finally { host.killAll(); }
});

test("RAC-1604: a terminal's replay keeps only its newest 200,000 characters, while the live output carries everything", async () => {
  // horizontal/runtime-host/README.md「重放缓冲有上限」: REPLAY_LIMIT in src/adapters/terminal-pty.ts:16.
  const LIMIT = 200_000;
  let output = "";
  const host = new MolisWorkPtyHost({
    onData(_panelId, data) { output += data; },
    onExit() { /* the terminal stays open until killAll */ },
  });
  const tick = () => new Promise<void>(resolve => setTimeout(resolve, 25));
  try {
    host.spawn({
      panelId: "long", command: "/bin/sh", cwd: os.tmpdir(),
      args: ["-c", `head -c ${LIMIT + 100_000} /dev/zero | tr '\\000' x; printf END; exec cat`],
    });
    await waitUntil(() => output.endsWith("END"), tick);
    assert.equal(output, "x".repeat(LIMIT + 100_000) + "END", "the live output is never clipped");
    const attached = host.spawn({ panelId: "long", attachOnly: true });
    assert.equal(attached.attached, true);
    assert.equal(attached.replay.length, LIMIT, "the replay stops at the limit");
    assert.equal(attached.replay, "x".repeat(LIMIT - 3) + "END", "the replay keeps the newest output");
  } finally { host.killAll(); }
});

function processExited(pid: number): boolean {
  try { process.kill(pid, 0); return false; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
    throw error;
  }
}

async function waitUntil(
  predicate: () => boolean,
  changed: () => Promise<void>,
  timeoutMs = 8_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Runtime Host test timed out");
    await Promise.race([
      changed(),
      new Promise<void>((resolve) => setTimeout(resolve, 50)),
    ]);
  }
}
test("RAC-1645: a terminal process that exits by itself leaves no replay behind, and attaching afterwards still gets nothing", async () => {
  // docs/horizontal/runtime-host.md「有限 replay 与退出清理」: the exit handler in src/adapters/terminal-pty.ts drops the replay with the handle.
  let output = "";
  const exited: string[] = [];
  const host = new MolisWorkPtyHost({
    onData(_panelId, data) { output += data; },
    onExit(panelId) { exited.push(panelId); },
  });
  const tick = () => new Promise<void>(resolve => setTimeout(resolve, 25));
  try {
    host.spawn({ panelId: "self", command: "/bin/sh", cwd: os.tmpdir(), args: ["-c", "printf done"] });
    assert.equal(host["replay"].has("self"), true, "a started terminal has a replay");
    await waitUntil(() => exited.includes("self"), tick);
    assert.match(output, /done/);
    assert.equal(host.alive("self"), false);
    assert.equal(host["replay"].has("self"), false, "the replay leaves with the process that exited by itself");
    assert.deepEqual(host.spawn({ panelId: "self", attachOnly: true }), { attached: false, started: false, replay: "" }, "attaching after the exit still gets nothing");
  } finally { host.killAll(); }
});

test("RAC-1646: when the old process of a restarted terminal exits late, the new process keeps its replay and stays alive", async () => {
  // kill() then spawn() on one panel is a restart; the guard at the top of the exit handler ignores the old process's exit.
  let output = "";
  const exited: string[] = [];
  const host = new MolisWorkPtyHost({
    onData(_panelId, data) { output += data; },
    onExit(panelId) { exited.push(panelId); },
  });
  const tick = () => new Promise<void>(resolve => setTimeout(resolve, 25));
  // The old shell ignores the SIGHUP and SIGTERM that kill() sends, so it outlives the restart until the test ends it.
  host.spawn({ panelId: "restart", command: "/bin/sh", cwd: os.tmpdir(), args: ["-c", 'trap "" HUP TERM; printf "old:%s\\n" "$$"; exec cat'] });
  const old = host["sessions"].get("restart");
  let next = old;
  let oldExited = false;
  old.onExit(() => { oldExited = true; });
  try {
    await waitUntil(() => /old:\d+\r?\n/.test(output), tick);
    host.kill("restart");
    host.spawn({ panelId: "restart", command: "/bin/sh", cwd: os.tmpdir(), args: ["-c", 'printf "new:%s\\n" "$$"; exec cat'] });
    next = host["sessions"].get("restart");
    await waitUntil(() => /new:\d+\r?\n/.test(output), tick);
    assert.equal(oldExited, false, "the old process is still running after the restart");
    assert.match(host["replay"].get("restart") ?? "", /new:\d+/, "the restarted terminal has its own replay");
    old.kill("SIGKILL");
    await waitUntil(() => oldExited, tick);
    assert.match(host["replay"].get("restart") ?? "", /new:\d+/, "the old process's exit leaves the new process's replay in place");
    assert.equal(host.alive("restart"), true, "the old process's exit leaves the new process running");
    assert.deepEqual(exited, [], "the old process's exit is not reported for the panel");
  } finally {
    host.killAll();
    old.kill("SIGKILL");
    next.kill();
  }
});
