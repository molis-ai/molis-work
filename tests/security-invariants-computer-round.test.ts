import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import { ComputerDesk, ComputerRecords, ComputerSettings } from "@molis-ai/molis-work-app-local-host";
import { isHostSurfaceRefusal, type HostSurfaceContext } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { helperTransport } from "./fixtures/surface-transport.js";
import { desktopState, observeSurface, performSurface, surfaceTarget } from "./fixtures/surface-target.js";

const latch = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
function context() {
  let live = true;
  const denial = new Error("original desktop round revoked");
  const control: HostSurfaceContext = { session_id: "same-session", beforeEffect() { control.assertCurrent(); }, assertCurrent() { if (!live) throw denial; } };
  return { control, denial, revoke() { live = false; } };
}

async function fixture(t: TestContext, document?: (home: string) => string) {
  const f = await helperTransport(t), started = f.helper.ensure(); await f.connected; f.hello(); await started;
  const settings = new ComputerSettings(f.home); settings.setEnabled(true);
  const records = new ComputerRecords(f.home), desk = new ComputerDesk({ helper: f.helper, settings, records });
  const surface = desk.driver(); t.after(async () => { await surface.close(); desk.close(); });
  const app = desktopState({ bundle_id: "com.apple.TextEdit", name: "TextEdit", pid: 42, front_pid: 42, active: true, hidden: false,
    window: { title: "Original document", frame: [100, 100, 500, 400], window_id: 7, document: document?.(f.home) ?? "/private/Original.txt" }, windows: [] });
  f.respondWith((op, params) => {
    if (op === "monitor") return { watching: params.on === true };
    if (op === "app.open" || op === "app.state") return app;
    if (op === "apps.running" || op === "apps.installed") return { apps: [app] };
    if (op === "focused.field") return { name: "Original field", secure: false };
    if (op === "document") return { path: app.window.document };
    if (op === "observe.tree") return { window: app.window, nodes: [{ role: "AXButton", name: "Save", depth: 0, frame: [110, 110, 50, 30] }], truncated: false, menus: [] };
    if (op === "observe.screenshot") return { png: Buffer.from("redacted original window").toString("base64"), included_pids: [42], password_fields: 0, masked: 0 };
    if (op === "observe.ocr") return { lines: [] };
    if (op.startsWith("input.")) return { done: true };
    return {};
  });
  const open = async (original: ReturnType<typeof context>) => {
    surface.describeRound!(original.control, { run_id: "run-original", project_id: "project", goal: "Edit original document" });
    await performSurface(surface, { what: "app", app: app.bundle_id }, original.control);
    const id = desk.state().record_id; assert.ok(id); return id;
  };
  return { ...f, desk, records, surface, settings, app, open,
    inputs: () => f.frames.filter(frame => frame.op.startsWith("input.") || frame.op === "app.open" || frame.op === "file.give") };
}

test("APR-11: desktop readiness losing its original authority starts no record and sends no monitor", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(), barrier = latch(), ensure = f.helper.ensure.bind(f.helper);
  t.mock.method(f.helper, "ensure", async () => { await barrier.promise; return ensure(); });
  const rejected = assert.rejects(observeSurface(f.surface, "accessibility-tree", original.control), error => error === original.denial);
  await setImmediate(); original.revoke(); barrier.release(); await rejected;
  assert.equal(f.desk.state().record_id, null); assert.equal(f.frames.length, 0);
});

test("APR-11: the native helper final socket fence rejects a revocation caused during serialization", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(); let dispatches = 0;
  await assert.rejects(f.helper.call("input.text", { toJSON() { original.revoke(); return { text: "never sent" }; } }, undefined,
    original.control.assertCurrent, () => { dispatches++; }), error => error === original.denial);
  assert.deepEqual(f.frames, []); assert.equal(dispatches, 0);
});

test("APR-11: desktop drivers are stable but records and targets belong to the exact same-session context", { timeout: 15_000 }, async t => {
  const f = await fixture(t), old = context(), next = context(); assert.equal(f.desk.driver(), f.surface);
  const oldId = await f.open(old); await assert.rejects(f.surface.identity(next.control), error => isHostSurfaceRefusal(error) && error.refusal === "driver-unavailable");
  await f.surface.release!(old.control, "completed");
  const newId = await f.open(next); assert.notEqual(newId, oldId);
  await f.surface.release!(old.control, "failed");
  assert.equal(f.desk.state().record_id, newId); assert.equal(f.desk.state().target?.bundle_id, f.app.bundle_id);
  await assert.rejects(observeSurface(f.surface, "screenshot", old.control), /已释放/u);
  assert.equal(f.records.get(newId)?.outcome, null); assert.equal(f.records.get(newId)?.ended_at, null);
  assert.ok(f.records.get(oldId)?.ended_at);
});

test("APR-11: an old desktop observation cannot record or deliver into the replacement round", { timeout: 15_000 }, async t => {
  const f = await fixture(t), old = context(), next = context(), oldId = await f.open(old);
  const barrier = f.holdNext("observe.screenshot");
  const rejected = assert.rejects(observeSurface(f.surface, "screenshot", old.control), /已释放/u);
  await barrier.reached; await f.surface.release!(old.control, "stopped");
  const oldSaved = f.records.get(oldId), newId = await f.open(next), newSaved = f.records.get(newId);
  let delivered = 0; const off = f.desk.onFrame(() => { delivered++; });
  barrier.release({ png: Buffer.from("late old frame").toString("base64"), included_pids: [42], password_fields: 0, masked: 0 }); await rejected; off();
  assert.equal(delivered, 0); assert.deepEqual(f.records.get(oldId), oldSaved); assert.deepEqual(f.records.get(newId), newSaved);
  assert.equal(f.surface.masked(new TextEncoder().encode("late old frame")), false);
});

test("APR-11: a delayed old monitor-off cannot disable monitoring for a later lease", { timeout: 15_000 }, async t => {
  const f = await fixture(t), old = context(), next = context(); await f.open(old);
  const barrier = latch(), reached = latch(), ensure = f.helper.ensure.bind(f.helper); let first = true;
  t.mock.method(f.helper, "ensure", async () => {
    if (first) { first = false; reached.release(); await barrier.promise; } return ensure();
  });
  await f.surface.release!(old.control); await reached.promise;
  await f.open(next); barrier.release(); await setImmediate(); await setImmediate();
  assert.equal(f.frames.filter(frame => frame.op === "monitor" && frame.params.on === false).length, 0);
  assert.equal(f.frames.filter(frame => frame.op === "monitor" && frame.params.on === true).length, 2);
});

test("APR-11: an exited app never silently retargets the approved action to a new process", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(); await f.open(original);
  const expected = await surfaceTarget(f.surface, original.control);
  const before = f.frames.length, barrier = f.holdNext("app.state");
  const rejected = assert.rejects(performSurface(f.surface, { what: "key", keys: ["Enter"] }, original.control, expected), /exited/u);
  await barrier.reached; barrier.reject("app.gone", "original app exited"); await rejected;
  assert.equal(f.frames.slice(before).some(frame => frame.op === "apps.running" || frame.op.startsWith("input.")), false);
  assert.equal(f.desk.target()?.pid, 42);
});

test("APR-13: desktop focus failures and malformed replies refuse instead of approving a blank field", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(); await f.open(original);
  const fail = f.holdNext("focused.field"), rejected = assert.rejects(surfaceTarget(f.surface, original.control).then(expected => f.surface.focusedField!(original.control, expected)), /unreadable/u);
  await fail.reached; fail.reject("field.none", "original field unreadable"); await rejected;
  const invalid = f.holdNext("focused.field"), malformed = assert.rejects(surfaceTarget(f.surface, original.control).then(expected => f.surface.focusedField!(original.control, expected)), /无法核对/u);
  await invalid.reached; invalid.release({}); await malformed;
  assert.equal(f.inputs().filter(frame => frame.op.startsWith("input.")).length, 0);
});

test("APR-11: a dispatched desktop key stays partial after revoke and adds no failed business record", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(), id = await f.open(original);
  const saved = f.records.get(id), barrier = f.holdNext("input.key");
  const rejected = assert.rejects(performSurface(f.surface, { what: "key", keys: ["Enter"] }, original.control), error => isHostSurfaceRefusal(error) && error.partial === true);
  await barrier.reached; assert.ok(f.desk.holding()?.lastInjectAt); original.revoke(); barrier.reject("helper.failed", "completion unknown"); await rejected;
  assert.deepEqual(f.records.get(id), saved);
  assert.equal(f.inputs().filter(frame => frame.op === "input.key").length, 1);
});

test("APR-11: a paused person's preview is bound to its original lease while a late input event cannot pause the next", { timeout: 15_000 }, async t => {
  const f = await fixture(t), old = context(), next = context(); await f.open(old); f.desk.pause();
  let frames = 0; const off = f.desk.onFrame(() => { frames++; });
  await f.desk.refreshFrame(); assert.equal(frames, 1); f.desk.handBack();
  const probe = f.holdNext("app.state");
  f.event({ event: "input", kind: "key", at: Date.now(), point: [0, 0], front_pid: 42 }); await probe.reached;
  await f.surface.release!(old.control); const id = await f.open(next), saved = f.records.get(id);
  probe.release(f.app); await setImmediate(); await setImmediate(); off();
  assert.equal(f.desk.state().control.mode, "assistant"); assert.deepEqual(f.records.get(id), saved);
});

test("APR-11: naming another desktop round never takes the lease or prevents the current browser-capable round from attaching", { timeout: 15_000 }, async t => {
  const f = await fixture(t), named = context(), used = context();
  f.surface.describeRound!(named.control, { run_id: "named-only", project_id: "one", goal: "Not using the computer" });
  assert.equal(f.desk.holding(), null);
  const id = await f.open(used);
  f.surface.noteRun!(named.control, "still-named-only");
  assert.equal(f.desk.state().record_id, id);
  await f.surface.release!(named.control); assert.equal(f.desk.state().record_id, id);
});

test("APR-11: concurrent same-round use waits for actual monitor confirmation and retries a refused installation", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(), monitor = f.holdNext("monitor");
  const one = assert.rejects(performSurface(f.surface, { what: "app", app: f.app.bundle_id }, original.control), /未能启用/u);
  await monitor.reached;
  const two = assert.rejects(observeSurface(f.surface, "accessibility-tree", original.control), /未能启用/u);
  await new Promise(resolve => setTimeout(resolve, 20)); assert.deepEqual(f.inputs(), []);
  assert.equal(f.frames.filter(frame => frame.op === "monitor").length, 1);
  monitor.release({ watching: false }); await one; await two; assert.deepEqual(f.inputs(), []);
  await f.open(original);
  assert.equal(f.frames.filter(frame => frame.op === "monitor").length, 2); assert.equal(f.inputs().length, 1);
});

test("APR-11: a pause and hand-back during a focused-field read cannot revive the original text operation", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(), id = await f.open(original), saved = f.records.get(id), field = f.holdNext("focused.field");
  const rejected = assert.rejects(performSurface(f.surface, { what: "text", text: "old text" }, original.control), /交还状态/u);
  await field.reached; f.desk.pause(); f.desk.handBack(); field.release(); await rejected;
  assert.equal(f.inputs().filter(frame => frame.op === "input.text").length, 0); assert.deepEqual(f.records.get(id), saved);
});

test("APR-11: forbidding the original app during a focused-field read rejects the final input frame", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(); await f.open(original);
  const field = f.holdNext("focused.field"), rejected = assert.rejects(performSurface(f.surface, { what: "text", text: "old text" }, original.control), /禁止/u);
  await field.reached; f.settings.forbid(f.app); field.release(); await rejected;
  assert.equal(f.inputs().filter(frame => frame.op === "input.text").length, 0);
});


test("APR-11: switching the same app during a focused-field read invalidates only the original operation", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(); await f.open(original);
  const field = f.holdNext("focused.field"), rejected = assert.rejects(performSurface(f.surface, { what: "text", text: "old text" }, original.control), /原桌面目标/u);
  await field.reached;
  await performSurface(f.surface, { what: "app", app: f.app.bundle_id }, original.control);
  const saved = f.records.get(f.desk.state().record_id!);
  field.release(); await rejected;
  assert.equal(f.inputs().filter(frame => frame.op === "input.text").length, 0);
  assert.deepEqual(f.records.get(saved!.id), saved);
});

test("APR-11: a reconnected helper requires a new confirmed monitor before another input", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(); await f.open(original);
  const generation = f.helper.generation, before = f.inputs().length, beforeFrames = f.frames.length;
  await f.disconnect();
  const next = f.nextConnection(), monitor = f.holdNext("monitor");
  const rejected = assert.rejects(performSurface(f.surface, { what: "key", keys: ["Enter"] }, original.control), /未能启用/u);
  await next; f.hello(); await monitor.reached;
  assert.equal(f.helper.generation, generation + 1); assert.equal(f.inputs().length, before);
  assert.deepEqual(f.frames.slice(beforeFrames).map(frame => frame.op), ["monitor"]);
  monitor.release({ watching: false }); await rejected;
  assert.equal(f.inputs().length, before);
  await performSurface(f.surface, { what: "key", keys: ["Enter"] }, original.control);
  assert.equal(f.frames.filter(frame => frame.op === "monitor" && frame.params.on === true).length, 3);
  assert.equal(f.inputs().length, before + 1);
});

test("APR-11: a helper's explicit zero-effect refusal differs from an unknown dispatched input", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(); await f.open(original);
  const known = f.holdNext("input.key");
  const refused = assert.rejects(performSurface(f.surface, { what: "key", keys: ["Enter"] }, original.control), error => isHostSurfaceRefusal(error) && error.partial === false);
  await known.reached; known.reject("field.password", "protected field before input", false); await refused;
  const unknown = f.holdNext("input.key");
  const uncertain = assert.rejects(performSurface(f.surface, { what: "key", keys: ["Escape"] }, original.control), error => isHostSurfaceRefusal(error) && error.partial === true);
  await unknown.reached; unknown.reject("computer.crashed", "lost original response"); await uncertain;
  assert.equal(f.inputs().filter(frame => frame.op === "input.key").length, 2);
});


test("APR-11: revoking input-monitoring permission during a field read refuses the final frame even with watching true", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(), id = await f.open(original), saved = f.records.get(id);
  const field = f.holdNext("focused.field"), rejected = assert.rejects(performSurface(f.surface, { what: "text", text: "revoked text" }, original.control), /权限已被收回/u);
  await field.reached;
  const status = f.helper.status()!;
  f.event({ ...status, event: "status", watching: true, permissions: { ...status.permissions, input_monitoring: false } });
  await setImmediate(); await setImmediate(); field.release(); await rejected;
  assert.equal(f.inputs().filter(frame => frame.op === "input.text").length, 0); assert.deepEqual(f.records.get(id), saved);
});

test("APR-11: a destination created while reading the source refuses the copy with no partial write or injection timestamp", { timeout: 15_000 }, async t => {
  const f = await fixture(t, home => join(home, "original.txt")), original = context(); await f.open(original);
  t.mock.method(os, "homedir", () => f.home);
  const downloads = join(f.home, "Downloads"), source = join(f.home, "original.txt"), destination = join(downloads, "result.txt");
  await mkdir(downloads); await writeFile(source, "source content");
  const before = f.desk.holding()?.lastInjectAt, document = f.holdNext("document");
  const rejected = assert.rejects(performSurface(f.surface, { what: "download", to: ["result.txt"] }, original.control), error =>
    error instanceof Error && /EEXIST/u.test(error.message) && !isHostSurfaceRefusal(error));
  await document.reached; await writeFile(destination, "existing file stays"); document.release({ path: source }); await rejected;
  assert.equal(await readFile(destination, "utf8"), "existing file stays");
  assert.equal(f.desk.holding()?.lastInjectAt, before);
});


test("APR-11: a synchronous activity listener revoking the round refuses before the actual file copy", { timeout: 15_000 }, async t => {
  const f = await fixture(t, home => join(home, "source.txt")), original = context(); await f.open(original);
  t.mock.method(os, "homedir", () => f.home);
  const downloads = join(f.home, "Downloads"), source = join(f.home, "source.txt"), destination = join(downloads, "result.txt");
  await mkdir(downloads); await writeFile(source, "never copied");
  const before = f.desk.holding()?.lastInjectAt;
  const off = f.desk.onState(state => { if (state.control.activity?.summary.includes("取出")) original.revoke(); });
  const document = f.holdNext("document"), rejected = assert.rejects(performSurface(f.surface, { what: "download", to: ["result.txt"] }, original.control), error => error === original.denial);
  await document.reached; document.release({ path: source }); await rejected; off();
  await assert.rejects(readFile(destination), { code: "ENOENT" }); assert.equal(f.desk.holding()?.lastInjectAt, before);
});


test("APR-11: watch_failed on the same helper connection requires successful monitoring before the next input", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(); await f.open(original);
  const generation = f.helper.generation, before = f.inputs().length, beforeFrames = f.frames.length;
  f.event({ event: "watch_failed" }); await setImmediate(); await setImmediate();
  const monitor = f.holdNext("monitor");
  const next = performSurface(f.surface, { what: "key", keys: ["Enter"] }, original.control);
  await monitor.reached;
  assert.equal(f.helper.generation, generation); assert.equal(f.inputs().length, before);
  assert.deepEqual(f.frames.slice(beforeFrames).map(frame => frame.op), ["monitor"]);
  monitor.release({ watching: true }); await next;
  assert.equal(f.frames.filter(frame => frame.op === "monitor" && frame.params.on === true).length, 2);
  assert.equal(f.inputs().length, before + 1);
});
