import assert from "node:assert/strict";
import test from "node:test";
import { LocalHost } from "@molis-ai/molis-work-app-local-host";

// HOST-CLOSE-01: closing the Host while a project is still opening. The open fails (it sees the Host closed, as
// registerProvider does) and tells its own caller; the Host still closes, and closes the projects that did open.
test("HOST-CLOSE-01 an open that fails while the Host closes does not fail the close; the projects that opened are closed", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const closed: string[] = [];
  const host = new LocalHost<{ id: string }>({
    instanceId: "test-local-host-close",
    runtimeFactory: {
      open: async reference => {
        if (reference.project_id === "slow") { await gate; if (host.lifecycle() !== "running") throw new Error("the Host closed while opening"); }
        return { id: reference.project_id };
      },
      close: runtime => { closed.push(runtime.id); },
    },
  });
  assert.equal(await host.withRuntime({ project_id: "ready", storage_key: "memory:ready" }, runtime => runtime.id), "ready");
  const opening = host.withRuntime({ project_id: "slow", storage_key: "memory:slow" }, runtime => runtime.id);
  const closing = host.close();
  release();
  await assert.rejects(opening, /the Host closed while opening/, "the open's caller hears why");
  await closing;
  assert.deepEqual(closed, ["ready"], "the project that opened is closed; the one that never opened has nothing to close");
  assert.equal(host.lifecycle(), "closed");
  assert.deepEqual(host.status().projects, []);
});

// B103-01: an open project nobody has used for a while, with nothing running, is put to sleep; a call that comes while it closes waits and
// opens it again instead of being refused as closing, and a project in use or with work running stays open.
test("B103-01 an idle project is put to sleep only when nothing of it runs; a call during its close opens it again", async () => {
  const opened: string[] = [], closed: string[] = [];
  let releaseClose!: () => void;
  const closeGate = new Promise<void>(resolve => { releaseClose = resolve; });
  let holdClose = false;
  const host = new LocalHost<{ id: string }>({
    instanceId: "test-local-host-sleep",
    runtimeFactory: {
      open: reference => { opened.push(reference.project_id); return { id: reference.project_id }; },
      close: async runtime => { if (holdClose) await closeGate; closed.push(runtime.id); },
    },
  });
  const reference = { project_id: "p1", storage_key: "memory:p1" };
  try {
    await host.withRuntime(reference, () => undefined);
    assert.equal(await host.sleepIfIdle(reference.storage_key, 60_000, async () => false), false, "used just now: stays open");
    assert.equal(await host.sleepIfIdle(reference.storage_key, 0, async () => true), false, "work still running: stays open");
    let inside!: () => void;
    const busy = host.withRuntime(reference, () => new Promise<void>(resolve => { inside = resolve; }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(await host.sleepIfIdle(reference.storage_key, 0, async () => false), false, "a call under way: stays open");
    inside(); await busy;
    assert.deepEqual(closed, []);
    holdClose = true;
    const sleeping = host.sleepIfIdle(reference.storage_key, 0, async () => false);
    await new Promise(resolve => setImmediate(resolve));
    const call = host.withRuntime(reference, runtime => runtime.id);
    releaseClose();
    assert.equal(await sleeping, true);
    assert.equal(await call, "p1", "the call that came during the close is not refused");
    assert.deepEqual(closed, ["p1"]);
    assert.deepEqual(opened, ["p1", "p1"], "it opened the project again");
  } finally { releaseClose(); await host.close(); }
});
