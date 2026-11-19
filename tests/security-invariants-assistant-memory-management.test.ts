import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ServerResponse } from "node:http";
import test from "node:test";
import { ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryChangeResult, MemoryWriteResult, MemoryPrefsView } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { openTestHome, type TestHome } from "./fixtures/test-home.js";
import { untilSetup } from "./fixtures/connector-assistant-model.js";

const path = "/api/assistant/memories";
const headers = (home: TestHome) => ({ origin: home.origin, "content-type": "application/json",
  "x-molis-work-control-token": home.controlToken, "x-molis-work-idempotency-key": randomUUID() });
const seed = (home: TestHome) => home.web.post<MemoryWriteResult>("/api/memory/items", { scope: "personal", text: "每次交付先列结果" });

// QEA-56: a retained HTTP entry must preserve the same confirmation version as memory.change.
for (const action of ["update", "disable", "enable", "remove"] as const) {
  test(`QEA-56 · retained Assistant ${action} refuses the original version after a real newer write`, { timeout: 60_000 }, async t => {
    const home = await openTestHome(t), first = (await seed(home)).memory!;
    const second = await home.web.post<MemoryChangeResult>("/api/memory/change", {
      memory_id: first.memory_id, expected_version: first.version,
      ...(action === "enable" ? { action: "disable" } : { action: "update", text: "每次交付先列验证结果" }) });
    assert.equal(second.memory!.version, first.version + 1);
    const before = await home.web.get("/api/memory/overview?scope=personal");
    const response = await fetch(home.origin + path, { method: "POST", headers: headers(home), body: JSON.stringify({
      memory_id: first.memory_id, expected_version: first.version, action, ...(action === "update" ? { text: "过时页面的文字" } : {}) }) });
    const result = await response.json();
    assert.deepEqual([response.status, result.code], [409, "memory.conflict"]);
    assert.deepEqual(await home.web.get("/api/memory/overview?scope=personal"), before);
    const accepted = await home.web.post<{ memories: Array<{ memory_id: string; version: number; disabled: boolean; text: string }> }>(path, {
      memory_id: first.memory_id, expected_version: second.memory!.version, action, ...(action === "update" ? { text: "当前页面明确保存的文字" } : {}) });
    const current = accepted.memories.find(row => row.memory_id === first.memory_id);
    if (action === "remove") assert.equal(current, undefined);
    else {
      assert.equal(current?.version, second.memory!.version + 1);
      assert.equal(current?.disabled, action === "disable");
      assert.equal(current?.text, action === "update" ? "当前页面明确保存的文字" : second.memory!.text);
    }
  });
}

test("QEA-56 · retained Assistant reads expose the actual version and unversioned writes cannot change it", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), first = (await seed(home)).memory!;
  const read = await home.web.get<{ memories: Array<{ memory_id: string; version: number }> }>(path);
  assert.equal(read.memories.find(row => row.memory_id === first.memory_id)?.version, first.version);
  const before = await home.web.get("/api/memory/overview?scope=personal");
  const response = await fetch(home.origin + path, { method: "POST", headers: headers(home), body: JSON.stringify({ memory_id: first.memory_id, action: "disable" }) });
  assert.deepEqual([response.status, (await response.json()).code], [400, "actions.input_invalid"]);
  assert.deepEqual(await home.web.get("/api/memory/overview?scope=personal"), before);
});

test("QEA-56 · retained Assistant management cannot reach another project's memory", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), a = await home.createProject("Memory A", []), b = await home.createProject("Memory B", []);
  const first = (await home.web.post<MemoryWriteResult>(`/projects/${a.project_id}/api/memory/items`, { scope: "project", text: "项目A发布前复核" })).memory!;
  const body = { memory_id: first.memory_id, expected_version: first.version, action: "disable" };
  for (const prefix of ["", `/projects/${b.project_id}`]) {
    const response = await fetch(home.origin + prefix + path, { method: "POST", headers: headers(home), body: JSON.stringify(body) });
    assert.deepEqual([response.status, (await response.json()).code], [404, "memory.not_found"]);
  }
  const result = await home.web.post<{ memories: Array<{ memory_id: string; disabled: boolean }> }>(`/projects/${a.project_id}${path}`, body);
  assert.equal(result.memories.find(row => row.memory_id === first.memory_id)?.disabled, true);
});

test("QEA-57 · retained Assistant preferences update personal and project defaults without replacing a project override", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), a = await home.createProject("Default memory", []), b = await home.createProject("Explicit memory", []);
  const projectPrefs = (id: string) => home.web.get<MemoryPrefsView>(`/projects/${id}/api/memory/overview?scope=project`);
  const bBefore = await projectPrefs(b.project_id);
  await home.web.post(`/projects/${b.project_id}/api/memory/prefs`, { scope: "project", prefs: bBefore.prefs });
  await home.web.post("/api/assistant/memory-prefs", { use_personal: false, use_project: false, learn_personal: false, learn_project: false });
  const personal = await home.web.get<MemoryPrefsView>("/api/memory/overview?scope=personal"), defaults = await projectPrefs(a.project_id);
  assert.equal(personal.prefs.consumers.assistant, false); assert.equal(personal.prefs.learn_from_work, false);
  assert.equal(defaults.prefs.consumers.assistant, false); assert.equal(defaults.prefs.learn_from_work, false);
  assert.deepEqual((await projectPrefs(b.project_id)).prefs, bBefore.prefs);
});

// S-assistant-memory-management: cancellation reaches the retained entry's original Memory execution fence.
for (const action of ["update", "remove"] as const) {
  test(`QEA-57 · retained Assistant ${action}: server-observed abandonment prevents business writes and a fresh request succeeds`, { timeout: 60_000 }, async t => {
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), finished = Promise.withResolvers<{ error?: unknown }>();
    const controller = new AbortController();
    t.after(() => { controller.abort(); release.resolve(); });
    const home = await openTestHome(t), first = (await seed(home)).memory!;
    const system = ensureSystemAgentService(home.host, home.home); await system.ready;
    const capability = system.agentHost.adapter("prologue").memory!, withCaller = capability.withCaller.bind(capability);
    const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui" as const, person: true,
      current_scene: "common", purpose: "management" as const };
    const read = async () => {
      const ledger = openMemoryLedger({ homeDirectory: home.home });
      try { return { entries: await withCaller(caller).list("user", LOCAL_PERSON_ACTOR_ID),
        changes: ledger.changes(LOCAL_PERSON_ACTOR_ID, 100), forgetting: ledger.forgetting.read() }; }
      finally { ledger.close(); }
    };
    const before = await read();
    let changing = false, held = false, closed = false, completedClosed = false;
    let signal: AbortSignal | undefined;
    const change = MemoryService.prototype.change;
    t.mock.method(MemoryService.prototype, "change", async function (this: MemoryService, ...args: Parameters<typeof change>) {
      if (args[1].memory_id !== first.memory_id) return Reflect.apply(change, this, args);
      changing = true; signal = args[0].signal;
      try { const result = await Reflect.apply(change, this, args); finished.resolve({}); return result; }
      catch (error) { finished.resolve({ error }); throw error; }
      finally { changing = false; }
    });
    const hold = async () => { if (changing && !held) { held = true; entered.resolve(); await release.promise; } };
    t.mock.method(capability, "withCaller", (owner: Parameters<typeof withCaller>[0]) => {
      const bound = withCaller(owner), withExecution = bound.withExecution!.bind(bound);
      bound.withExecution = control => {
        const controlled = withExecution({ beforeEffect: async () => { await control.beforeEffect(); if (action === "update") await hold(); }, assert_current: () => control.assert_current() });
        if (action === "remove") {
          const list = controlled.list.bind(controlled);
          controlled.list = async (...args: Parameters<typeof list>) => { const result = await list(...args); await hold(); return result; };
        }
        return controlled;
      };
      return bound;
    });
    const emit = ServerResponse.prototype.emit;
    t.mock.method(ServerResponse.prototype, "emit", function (this: ServerResponse, event: string | symbol, ...args: unknown[]) {
      const result = emit.call(this, event, ...args);
      if (event === "close" && this.req.url === path) { if (this.writableEnded) completedClosed = true; else closed = true; }
      return result;
    });
    const body = { memory_id: first.memory_id, expected_version: first.version, action, ...(action === "update" ? { text: "交付时列出实际通过的验证" } : {}) };
    const pending = fetch(home.origin + path, { method: "POST", headers: headers(home), signal: controller.signal, body: JSON.stringify(body) });
    const abandoned = assert.rejects(pending, { name: "AbortError" });
    await entered.promise; controller.abort(); await abandoned;
    await untilSetup(async () => closed || undefined, "server observes the abandoned management request");
    release.resolve(); const outcome = await finished.promise;
    assert.deepEqual(await read(), before, "abandonment changes neither formal facts nor accepted forgetting decisions");
    assert.ok(outcome.error); assert.equal(signal?.aborted, true);
    await home.web.post(path, body);
    await untilSetup(async () => completedClosed || undefined, "the successful response completes normally");
    assert.equal(signal?.aborted, false);
    const recovered = await read();
    assert.equal(recovered.entries.length, action === "remove" ? 0 : 1);
    if (action === "update") { assert.equal(recovered.entries[0]!.text, body.text); assert.equal(recovered.entries[0]!.version, first.version + 1); }
    assert.equal(recovered.changes.length, before.changes.length + 1);
  });
}
