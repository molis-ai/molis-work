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
