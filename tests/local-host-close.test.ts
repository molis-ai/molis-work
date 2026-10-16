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
