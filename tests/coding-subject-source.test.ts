import assert from "node:assert/strict";
import test from "node:test";
import type { ActionSubjectContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { codingSdkRuntime } from "./fixtures/coding-sdk-runtime.js";
import { noEffect } from "./fixtures/coding-sessions.js";

test("A4-K changing next intent invalidates the source atomically; a KV failure and a concurrent archive leave its original material", async t => {
  let fail = false, hold = false;
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const f = await codingSdkRuntime(t, { wrapCoding: definition => ({ ...definition, start: context => {
    const services = context.services!;
    const storage = services.storage!, database = services.project_database!;
    return definition.start({ ...context, services: { ...services,
      storage: { ...storage, set: (key, value) => { storage.set(key, value); if (fail && key.startsWith("configuration:")) throw new Error("configuration write fault after SQL"); } },
      project_database: { ...database, transaction: (beforeEffect, write) => database.transaction(async () => { await beforeEffect(); if (hold) { hold = false; started.resolve(); await release.promise; } }, write) },
    } });
  } }) });
  const created = await f.create("s1"), pid = created.project_id;
  const config = (intent: string) => ({ intent, provider_id: "fixture", model_id: "fixture", workspace_id: "work" });
  const read = async () => (await f.call("/sessions/s1/subject"))!.body as ActionSubjectContext;
  const before = await read();
  const changed = await f.call("/sessions/s1", { configuration: config("discuss") }, "PATCH");
  assert.equal(changed!.status, 200); const first = f.sessions.get(pid, "s1"), material = await read();
  assert.notEqual(first.updated_at, created.updated_at); assert.notEqual(material.revision, before.revision);
  assert.match(material.content, /下一轮方式：discuss/);
  fail = true;
  const failed = await f.call("/sessions/s1", { configuration: config("review") }, "PATCH");
  assert.equal(failed!.status, 400); assert.match(JSON.stringify(failed!.body), /configuration write fault/); fail = false;
  assert.deepEqual(f.sessions.get(pid, "s1"), first, "the transaction's timestamp rolls back");
  assert.deepEqual(await read(), material, "the same actual SQLite transaction rolls back the private configuration write too");
  hold = true;
  const pending = f.call("/sessions/s1", { configuration: config("review") }, "PATCH");
  await started.promise; await f.sessions.archive(noEffect, pid, "s1", "2026-11-04T00:00:00Z"); release.resolve();
  const conflict = await pending;
  assert.equal(conflict!.status, 409);
  assert.equal(f.sessions.get(pid, "s1").archived, true);
  assert.deepEqual((await f.call("/sessions/s1/subject-state"))!.body, { subject: { kind: "coding_session", id: "s1" }, state: "archived" });
  // Details still reveal the saved next-round configuration to the owner; no new review intent was committed.
  const detail = await f.call("/sessions/s1");
  assert.equal(detail!.status, 200); assert.ok(JSON.stringify(detail!.body).includes('"intent":"discuss"'));
});


test("A4-K intent and unchanged title in one frozen-millisecond PATCH cannot restore the old source revision", async t => {
  const f = await codingSdkRuntime(t);
  const first = await f.create("s1"), at = new Date("2026-11-04T01:00:00.000Z");
  t.mock.timers.enable({ apis: ["Date"], now: at });
  const created = await f.sessions.create(noEffect, { project_id: first.project_id, session_id: "mixed", title: "mixed", runtime_id: "prologue", at: at.toISOString() });
  const before = await f.call("/search/entries");
  const changed = await f.call("/sessions/mixed", { title: "mixed", configuration: { intent: "review", provider_id: "fixture", model_id: "fixture", workspace_id: "work" } }, "PATCH");
  assert.equal(changed!.status, 200);
  assert.ok(f.sessions.get(first.project_id, "mixed").updated_at > created.updated_at, "the mixed request keeps its source invalidation");
  assert.notDeepEqual((await f.call("/search/entries"))!.body, before!.body);
});

test("A4-K the actual Coding subject reader rejects archive after its last asynchronous SDK history read", { timeout: 30_000 }, async t => {
  const { agentHostCapabilities } = await import("@molis-ai/molis-work-contracts/services/agent-host");
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); let hold = true;
  const f = await codingSdkRuntime(t, { wrapCoding: definition => ({ ...definition, start: context => {
    const services = context.services!, actions = services.actions!;
    const controlled = new Proxy({ ...actions }, { get(target, key, receiver) {
      if (key !== "invoke") return Reflect.get(target, key, receiver);
      return async (...args: Parameters<typeof actions.invoke>) => {
        const result = await actions.invoke(...args);
        if (hold && args[0].capability_id === agentHostCapabilities.readSession.capability_id) { hold = false; started.resolve(); await release.promise; }
        return result;
      };
    } });
    return definition.start({ ...context, services: { ...services, actions: controlled } });
  } }) });
  const row = await f.create("s1"), install = f.platform.supervisor.state("io.molis.work.coding")!.install_id!;
  const session = await f.adapter.createSession({ project_id: row.project_id, plugin_id: "io.molis.work.coding", install_id: install, actor_id: "web-user", directory: { canonical_path: f.home, realpath_verified: true }, title: "guarded source" });
  await f.sessions.setRuntimeSession(noEffect, row.project_id, row.session_id, session.session_id, new Date().toISOString());
  const pending = f.call("/sessions/s1/subject");
  const reached = await Promise.race([started.promise.then(() => true), pending.then(result => { t.diagnostic("A4_SOURCE_BEFORE_HOLD " + JSON.stringify(result)); return false; })]);
  assert.equal(reached, true, "the actual source reaches the controlled SDK history read");
  await f.sessions.archive(noEffect, row.project_id, row.session_id, new Date().toISOString()); release.resolve();
  const result = await pending;
  assert.equal(result!.status, 503);
  assert.ok(JSON.stringify(result!.body).includes("coding.subject_archived"));
  assert.ok(!JSON.stringify(result!.body).includes("状态："), "the captured original body is not delivered");
});
