import assert from "node:assert/strict";
import test from "node:test";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryServiceHome } from "./fixtures/memory-service-home.js";
import { openTestHome } from "./fixtures/test-home.js";
import { person } from "./fixtures/home-runtime.js";

// MEM-CLASS-01 / MEM-24: explicit-only stops automatic/task reads, while authorized human recall and management remain real SDK paths.
test("explicit-only stops task bodies but preserves authorized person recall and category-off management", async t => {
  const f = await memoryServiceHome(t, { projects: [] }), service = await f.open();
  const owner = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui" as const, person: true };
  const worker = { ...owner, consumer: "agent" as const, person: false, current_scene: "common" };
  const saved = await service.write(owner, { scope: "personal", text: "每次发布先核对发布清单", kind: "convention" });
  assert.ok(saved.memory);
  service.savePrefs(owner, "personal", { class_restrictions: [{ selector: { consumer: "agent", current_scene: "common" }, read: "explicit-only", form: "inherit" }] });
  assert.equal((await service.forRun(worker, { query: "发布清单" }))?.task, false);
  assert.deepEqual((await service.recall({ ...worker, purpose: "task" }, { scopes: ["personal"], query: "发布清单" }, { readMode: "task" })).items, []);
  assert.equal((await service.recall({ ...worker, person: true, purpose: "management" }, { scopes: ["personal"], query: "发布清单" }, { readMode: "explicit" })).items[0]?.memory_id, saved.memory.memory_id);
  service.savePrefs(owner, "personal", { class_restrictions: [{ selector: { consumer: "ui", current_scene: "common" }, read: "off", form: "off" }] });
  assert.equal((await service.page(owner, { scope: "personal" })).items[0]?.memory_id, saved.memory.memory_id);
  await service.change({ ...owner, operation_id: "person-remove-after-class-off" }, { memory_id: saved.memory.memory_id, expected_version: saved.memory.version, action: "remove" });
  assert.deepEqual((await service.page(owner, { scope: "personal" })).items, []);
});

// MEM-CLASS-02: trusted actor_kind identifies a Runtime even when its actor_id has no agent prefix.
test("a Runtime without the original Run recipe cannot become the person through a non-agent actor id", async t => {
  const f = await openTestHome(t), client = f.host.homeActionClient();
  const human = person(MEMORY_PERMISSIONS);
  const runtime: ActionCallContext = { ...human, actor_kind: "runtime", actor_id: LOCAL_PERSON_ACTOR_ID };
  await assert.rejects(client.invoke(runtime, memoryActions.list, { scope: "personal" }), { code: "memory.unavailable" });
  assert.deepEqual((await client.invoke(human, memoryActions.list, { scope: "personal" })).items, []);
});

// MEM-CLASS-01: an external MCP Runtime keeps its separately granted explicit consumer identity; it does not borrow a local Run.
test("external MCP Runtime recall uses its original scope grant without a local Agent recipe", async t => {
  const f = await openTestHome(t), human = person(MEMORY_PERMISSIONS), client = bindActionClient(f.host.homeActionClient(), () => human);
  const saved = await client.invoke(memoryActions.write, { scope: "personal", text: "每次检查日志先看错误码", kind: "convention" });
  await client.invoke(memoryActions.savePrefs, { scope: "personal", prefs: { consumers: { assistant: true, agent: true, ui: true, plugin: true, mcp: true } } });
  const external: ActionCallContext = { ...human, audience: "mcp", actor_kind: "runtime", actor_id: "mcp:isolated-external", runtime_session_id: "external-session" };
  const recalled = await f.host.homeActionClient().invoke(external, memoryActions.recall, { scopes: ["personal"], query: "检查日志" });
  assert.equal(recalled.items[0]?.memory_id, saved.memory?.memory_id);
});

// MEM-23: changed preference shapes have one current public action version; old writes cannot alter persisted choices.
test("old preference action versions are rejected before changing the current nine-field profile", async t => {
  const f = await openTestHome(t), human = person(MEMORY_PERMISSIONS), client = f.host.homeActionClient();
  const before = await client.invoke(human, memoryActions.prefs, { scope: "personal" });
  assert.equal(Object.keys(before.prefs).length, 9);
  for (const version of [2, 3]) {
    await assert.rejects(client.invoke(human, { ...memoryActions.prefs, version }, { scope: "personal" }), { code: "actions.missing" });
    await assert.rejects(client.invoke(human, { ...memoryActions.savePrefs, version }, { scope: "personal", prefs: { form: false } }), { code: "actions.missing" });
  }
  assert.deepEqual(await client.invoke(human, memoryActions.prefs, { scope: "personal" }), before);
});
