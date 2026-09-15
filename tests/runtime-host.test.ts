import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CodexRuntimeSessionAdapter,
  MolisWorkPtyHost,
  RuntimeHostRouter,
  type RuntimeSessionAdapter,
  type RuntimeSessionCapabilities,
} from "@molis-ai/molis-work-service-runtime-host";

const ALL_NATIVE: RuntimeSessionCapabilities = {
  create: "native",
  list: "native",
  discover: "native",
  read: "native",
  resume: "native",
  events: "native",
  handoff: "native",
};

test("Runtime Host registers a provider, exposes its matrix, and returns honest unsupported results", async () => {
  const calls: string[] = [];
  const adapter: RuntimeSessionAdapter = {
    runtime_id: "fake",
    capabilities: ALL_NATIVE,
    async invoke(capability, input) {
      calls.push(capability);
      return { status: "ok", source: "native", capability, value: input };
    },
  };
  const host = new RuntimeHostRouter();
  host.register(adapter);

  assert.deepEqual(host.matrix(["fake", "fake"]), [{ runtime_id: "fake", capabilities: ALL_NATIVE }]);
  const started = await host.invoke("fake", "create", { prompt: "go" });
  assert.equal(started.status, "ok");
  assert.deepEqual(calls, ["create"]);

  const missing = await host.invoke("missing", "resume", {});
  assert.equal(missing.status, "unsupported");
  if (missing.status === "unsupported") assert.equal(missing.code, "runtime.capability_unavailable");
});

test("Codex Adapter translates resume and returns a working event unsubscribe", async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  let listener: ((event: { method: string; params: unknown }) => void) | null = null;
  const adapter = new CodexRuntimeSessionAdapter({
    async request(method, params) {
      calls.push({ method, params });
      return { accepted: true };
    },
    subscribe(next) {
      listener = next;
      return () => { listener = null; };
    },
  });

  assert.equal((await adapter.invoke("resume", { threadId: "thread-a" })).status, "ok");
  const received: unknown[] = [];
  const events = await adapter.invoke("events", { listener: (event: unknown) => received.push(event) });
  assert.equal(events.status, "ok");
  assert.equal(typeof listener, "function");
  (listener as unknown as (event: unknown) => void)({ method: "changed", params: "output" });
  assert.deepEqual(received, [{ method: "changed", params: "output" }]);
  if (events.status === "ok") (events.value as { unsubscribe(): void }).unsubscribe();
  assert.equal(listener, null);
  assert.deepEqual(calls, [{ method: "thread/resume", params: { threadId: "thread-a" } }]);
});

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
