import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
const ref = { project_id: "a", board_id: "a", storage_key: "memory:a" };
const gate = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
const define = (id: string, scope: "home" | "project", concurrent: boolean): ActionDefinition => ({ capability_id: id, version: 1, operation: "command", action: {
  title: id, description: "Explicit owner-managed transactions", kind: "operation", scope, ...(concurrent ? { scheduling: "concurrent" as const } : {}), audiences: ["user"], permissions: ["edit"], subject_kinds: [], input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "integer" },
} });
for (const scope of ["home", "project"] as const) for (const fails of [false, true]) test(`${scope} concurrent action allows edits and close waits for ${fails ? "failure" : "success"}`, { timeout: 5000 }, async () => {
  const entered = gate(), released = gate(); let value = 0, closed = false;
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const slow = define("test.slow", scope, true), edit = define("test.edit", scope, false);
  const caller: ActionCallContext = { actor_id: "user", project_id: scope === "project" ? "a" : null, audience: "user", permissions: ["edit"] };
  const registry = host.actionRegistry(scope === "project" ? ref : undefined), client = scope === "project" ? host.actionClient(ref) : host.homeActionClient();
  registry.registerProvider({ provider: { provider_id: "test", title: "test", kind: "plugin" }, definitions: [slow, edit], handlers: [
    { ...slow, handle: async () => { entered.resolve(); await released.promise; if (fails) throw new Error("provider failure"); return value; } },
    { ...edit, handle: () => ++value },
  ] });
  const pending = client.invoke(caller, slow, {});
  const result = pending.then(value => ({ value }), error => ({ error }));
  try {
    await entered.promise;
    assert.equal(await client.invoke(caller, edit, {}), 1);
    const closing = host.close().then(() => { closed = true; });
    await setImmediate(); assert.equal(closed, false);
    await assert.rejects(client.invoke(caller, edit, {}), { code: "host.closed" });
    released.resolve();
    const finished = await result;
    if (fails) assert.match(String("error" in finished && finished.error), /provider failure/);
    else assert.deepEqual(finished, { value: 1 });
    await closing; assert.equal(closed, true);
  } finally { released.resolve(); await result; await host.close(); }
});
for (const scope of ["home", "project"] as const) test(`${scope} caller cannot forge concurrent scheduling on a serial registration`, { timeout: 5000 }, async () => {
  const entered = gate(), released = gate(); let count = 0;
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const serial = define("test.serial", scope, false), caller: ActionCallContext = { actor_id: "user", project_id: scope === "project" ? "a" : null, audience: "user", permissions: ["edit"] };
  host.actionRegistry(scope === "project" ? ref : undefined).registerProvider({ provider: { provider_id: "test", title: "test", kind: "plugin" }, definitions: [serial], handlers: [{ ...serial, handle: async () => { count++; if (count === 1) { entered.resolve(); await released.promise; } return count; } }] });
  const client = scope === "project" ? host.actionClient(ref) : host.homeActionClient();
  const first = client.invoke(caller, serial, {});
  try {
    await entered.promise;
    const second = client.invoke(caller, { ...serial, action: { ...serial.action, scheduling: "concurrent" } }, {});
    await setImmediate(); assert.equal(count, 1);
    released.resolve(); assert.deepEqual(await Promise.all([first, second]), [1, 2]);
    await assert.rejects(client.invoke({ ...caller, permissions: [] }, serial, {}), { code: "actions.forbidden" });
  } finally { released.resolve(); await first; await host.close(); }
});
