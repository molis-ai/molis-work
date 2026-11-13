import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { browserTransport, helperTransport } from "./fixtures/surface-transport.js";

test("APR-07/08: helper rejects after ensure before a frame, request id or response timer exists", { timeout: 15_000 }, async t => {
  const f = await helperTransport(t), denial = new Error("original round revoked");
  let current = true, timers = 0;
  const setTimer = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", (...args: Parameters<typeof setTimer>) => { if (args[1] === 1_357_911) timers++; return setTimer(...args); });
  const pending = f.helper.call("input.text", { text: "must not reach the helper" }, undefined, () => { if (!current) throw denial; });
  const rejected = assert.rejects(pending, error => error === denial);
  await f.connected; current = false; f.hello(); await rejected;
  assert.equal(f.frames.length, 0); assert.equal(timers, 0);
  await assert.rejects(f.helper.call("input.key", { keys: ["Return"] }, undefined, async () => {}), { code: "actions.async_required" });
  assert.equal(f.frames.length, 0); assert.equal(timers, 0);
  assert.deepEqual(await f.helper.call("status"), { accepted: true });
  assert.deepEqual(f.frames.map(frame => [frame.id, frame.op]), [[1, "status"]]); assert.equal(timers, 1);
});

test("APR-07/08: navigation refuses after page startup without changing the destination or sending it", { timeout: 15_000 }, async t => {
  const f = await browserTransport(t), denial = new Error("navigation revoked"), barrier = f.holdNext("Target.attachToTarget");
  let current = true;
  const guard = () => { if (!current) throw denial; };
  const rejected = assert.rejects(f.page.navigate("https://must-not-send.example/", guard), error => error === denial);
  await barrier.reached; current = false; barrier.release(); await rejected;
  assert.equal(f.frames.filter(frame => frame.method === "Page.navigate").length, 0);
  assert.equal(f.page.snapshot().url, ""); assert.equal(f.page.snapshot().loading, false);
  await assert.rejects(f.page.navigate("https://must-not-send.example/", async () => {}), { code: "actions.async_required" });
  await f.page.navigate("https://person.example/");
  assert.deepEqual(f.frames.filter(frame => frame.method === "Page.navigate").map(frame => frame.params.url), ["https://person.example/"]);
});

test("APR-07/08: a refused file handoff preserves the original chooser for a later explicit user selection", { timeout: 15_000 }, async t => {
  const f = await browserTransport(t), denial = new Error("upload revoked"); await f.page.ensure(); f.chooser();
  for (let n = 0; !f.page.snapshot().file_chooser && n < 1000; n++) await setImmediate();
  const chooser = f.page.snapshot().file_chooser; assert.ok(chooser);
  await assert.rejects(f.page.chooseFiles(chooser.id, ["/private/never-send.txt"], () => { throw denial; }), error => error === denial);
  await assert.rejects(f.page.chooseFiles(chooser.id, [], async () => {}), { code: "actions.async_required" });
  assert.deepEqual(f.page.snapshot().file_chooser, chooser);
  assert.equal(f.frames.filter(frame => frame.method === "DOM.setFileInputFiles").length, 0);
  await f.page.chooseFiles(chooser.id, []);
  assert.equal(f.page.snapshot().file_chooser, null);
  assert.deepEqual(f.frames.filter(frame => frame.method === "DOM.setFileInputFiles").map(frame => frame.params.files), [[]]);
});

test("APR-07/08: restarting a page cannot send its retained address after the original round is revoked", { timeout: 15_000 }, async t => {
  const f = await browserTransport(t); await f.page.navigate("https://previous.example/"); await f.host.restart();
  const barrier = f.holdNext("Page.enable"), denial = new Error("round ended during restart"); let current = true;
  const rejected = assert.rejects(f.page.ensure(() => { if (!current) throw denial; }), error => error === denial);
  await barrier.reached; current = false; barrier.release(); await rejected;
  assert.deepEqual(f.frames.filter(frame => frame.method === "Page.navigate").map(frame => frame.params.url), ["https://previous.example/"]);
  assert.equal(f.page.snapshot().url, "https://previous.example/"); assert.equal(f.page.snapshot().loading, false);
  await f.page.ensure();
  assert.deepEqual(f.frames.filter(frame => frame.method === "Page.navigate").map(frame => frame.params.url), ["https://previous.example/", "https://previous.example/"]);
});

test("APR-07/08: a revoked starter cannot lend its guard to or cancel a concurrent person's navigation", { timeout: 15_000 }, async t => {
  const f = await browserTransport(t); await f.page.navigate("https://previous.example/"); await f.host.restart();
  const barrier = f.holdNext("Page.enable"), denial = new Error("only the original agent revoked"); let current = true;
  const rejected = assert.rejects(f.page.ensure(() => { if (!current) throw denial; }), error => error === denial);
  await barrier.reached;
  const person = f.page.navigate("https://person.example/"); current = false; barrier.release();
  await rejected; await person;
  assert.deepEqual(f.frames.filter(frame => frame.method === "Page.navigate").map(frame => frame.params.url), [
    "https://previous.example/", "https://previous.example/", "https://person.example/",
  ]);
  assert.equal(f.page.snapshot().url, "https://person.example/");
});

test("APR-07/08: a sent restore is not relabelled as unsent when authority changes before its response", { timeout: 15_000 }, async t => {
  const f = await browserTransport(t); await f.page.navigate("https://previous.example/"); await f.host.restart();
  const barrier = f.holdNext("Page.navigate"), denial = new Error("revoked after send"); let current = true;
  const guard = () => { if (!current) throw denial; }, pending = f.page.ensure(guard);
  await barrier.reached; current = false; barrier.release(); await pending;
  await assert.rejects(f.page.navigate("https://must-not-send.example/", guard), error => error === denial);
  assert.deepEqual(f.frames.filter(frame => frame.method === "Page.navigate").map(frame => frame.params.url), ["https://previous.example/", "https://previous.example/"]);
});

test("APR-07/08: a late restore failure cannot replace a concurrent newer navigation's visible state", { timeout: 15_000 }, async t => {
  const f = await browserTransport(t); await f.page.navigate("https://previous.example/"); await f.host.restart();
  const startup = f.holdNext("Page.enable"), original = f.page.ensure(() => {});
  await startup.reached;
  const person = f.page.navigate("https://person.example/"); startup.release();
  const restore = f.holdNext("Page.navigate"); await restore.reached; await person;
  restore.release({ errorText: "old restore failed" }); await original;
  assert.deepEqual(f.frames.filter(frame => frame.method === "Page.navigate").map(frame => frame.params.url), [
    "https://previous.example/", "https://previous.example/", "https://person.example/",
  ]);
  assert.equal(f.page.snapshot().url, "https://person.example/");
  assert.equal(f.page.snapshot().loading, true); assert.equal(f.page.snapshot().problem, null);
});
