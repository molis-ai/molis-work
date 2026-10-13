import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, characterOwner, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, MEMORY_PROVIDER_ID, memoryActions, type MemoryWriteRequest } from "@molis-ai/molis-work-contracts/services/memory";
import { MolisWorkLocalHost } from "../apps/local-host/src/project-host.js";
import { prologueMemoryBackend } from "../apps/local-host/src/memory/memory-host.js";

async function memoryHome(t: { after(fn: () => Promise<void> | void): void }) {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-scopes-"));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.memory-scopes-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => null as never, resolveCredential: () => null });
  host.register(adapter);
  const ledger = openMemoryLedger({ homeDirectory: home });
  t.after(async () => { ledger.close(); await adapter.close(); await rm(home, { recursive: true, force: true }); });
  const service = new MemoryService({ backend: prologueMemoryBackend(async () => host.adapter("prologue").memory!), ledger, timeZone: "Asia/Shanghai",
    projectTitle: async id => id === "project-q4" ? "Q4 plan" : "Q1 plan" });
  return { service };
}

const work = (character: { id: string; title: string } | null, project = "project-q4"): MemoryCaller => ({ actor_id: "web-user", project_id: project, consumer: "assistant",
  work: { work_id: `work-${character?.id ?? "none"}-${project}`, title: "写周报" }, character });
// Real Character references look like this: a colon-separated artifact id.
const writer = { id: "character:project-onboarding-a2b1f6ba-bd73-43db-bcb7-e32f0d25fb3d:f7a122c9-7ea4-4dc8-8353-b49da5196add", title: "写作顾问" },
  analyst = { id: "character:project-onboarding-a2b1f6ba-bd73-43db-bcb7-e32f0d25fb3d:0b2c9d7e-1111-4a2b-9c3d-000000000002", title: "数据分析师" };
const personIn = (project: string | null): MemoryCaller => ({ actor_id: "web-user", project_id: project, consumer: "ui", person: true });
const texts = (items: ReadonlyArray<{ text: string }>) => items.map(item => item.text).sort();
/** The Assistant's way of keeping something: the Host hands the gate the messages the person typed (the third argument), and `said` points at one of them. These tests state that message in `said`. */
const keep = (service: MemoryService, caller: MemoryCaller, request: MemoryWriteRequest) => service.write(caller, request, { originals: request.said ? [request.said] : [] });

test("a Character's memory is used only in work that Character carries: not by another Character, not without one, not in another project; the person sees and switches it off in the project", { timeout: 60_000 }, async t => {
  const { service } = await memoryHome(t);
  await keep(service, work(null), { scope: "personal", text: "周报用要点列表", said: "周报用要点列表" });
  await keep(service, work(null), { scope: "project", text: "Q4 plan 的周报先写风险", said: "Q4 plan 的周报先写风险" });
  const kept = await keep(service, work(writer), { scope: "character", text: "写周报时语气克制，不用感叹号", said: "写周报时语气克制，不用感叹号" });
  assert.equal(kept.outcome, "written");
  assert.equal(kept.memory!.scope, "character");
  assert.equal(kept.memory!.character_id, writer.id);
  assert.equal(kept.memory!.character_title, "写作顾问");
  assert.match(kept.memory!.origin, /写周报/, "provenance names the work it was said in");
  // Without a Character carrying the work, there is nowhere to keep it.
  await assert.rejects(keep(service, work(null), { scope: "character", text: "x", said: "记住 x" }), /角色/);

  const query = { query: "写周报 语气 风险 要点" };
  assert.deepEqual(texts((await service.recall(work(writer), query)).items), ["Q4 plan 的周报先写风险", "写周报时语气克制，不用感叹号", "周报用要点列表"]);
  assert.deepEqual(texts((await service.recall(work(analyst), query)).items), ["Q4 plan 的周报先写风险", "周报用要点列表"], "another Character never gets it");
  assert.deepEqual(texts((await service.recall(work(null), query)).items), ["Q4 plan 的周报先写风险", "周报用要点列表"], "work no Character carries never gets it");
  assert.deepEqual(texts((await service.recall(work(writer, "project-q1"), query)).items), ["周报用要点列表"], "the same Character in another project: neither the project's nor its Q4 memories");

  // An Agent run carried by that Character is pinned the exact Prologue character-scope entry (kept per project).
  const run = await service.forRun({ ...work(writer), consumer: "agent" }, query);
  const pin = run.pinned.find(item => item.memory_id === kept.memory!.memory_id);
  assert.deepEqual(pin, { scope: "character", owner: characterOwner("project-q4", writer.id), memory_id: kept.memory!.memory_id });
  // A real Character reference is long: the owner stays a short key Prologue can store (at most 128 characters, one segment).
  assert.match(characterOwner("project-onboarding-a2b1f6ba-bd73-43db-bcb7-e32f0d25fb3d", "character:project-onboarding-a2b1f6ba-bd73-43db-bcb7-e32f0d25fb3d:f7a122c9-7ea4-4dc8-8353-b49da5196add"), /^pc-[0-9a-f]{40}$/);

  // The person sees it in the project's memories, named with its Character; not in another project.
  const listed = (await service.list(personIn("project-q4"))).items.find(item => item.scope === "character");
  assert.equal(listed?.character_title, "写作顾问");
  assert.equal(listed?.project_id, "project-q4");
  assert.equal((await service.list(personIn("project-q1"))).items.some(item => item.scope === "character"), false);
  // Switched off, it is no longer used even by its own Character.
  await service.change(personIn("project-q4"), { memory_id: kept.memory!.memory_id, action: "disable" });
  assert.deepEqual(texts((await service.recall(work(writer), query)).items), ["Q4 plan 的周报先写风险", "周报用要点列表"]);
  // Switching the project's “Agent 工作” off also closes that project's Character memories to Agent work.
  await service.change(personIn("project-q4"), { memory_id: kept.memory!.memory_id, action: "enable" });
  service.savePrefs(personIn("project-q4"), "project", { consumers: { agent: false } } as never);
  const agentRun = await service.recall({ ...work(writer), consumer: "agent" }, query);
  assert.deepEqual(texts(agentRun.items), ["周报用要点列表"]);
  assert.match(agentRun.reason ?? "", /项目记忆和角色记忆|角色记忆和项目记忆/);

  // Clearing the project clears what its page shows, its Characters' memories included; a change after the preview stops it.
  const preview = await service.previewScope(personIn("project-q4"), "project");
  assert.equal(preview.count, 2);
  await keep(service, work(analyst), { scope: "character", text: "图表先给结论", said: "图表先给结论" });
  await assert.rejects(service.clearScope(personIn("project-q4"), "project", preview.fingerprint), /重新预览/);
  assert.equal((await service.list(personIn("project-q4"))).items.filter(item => item.scope !== "personal").length, 3, "nothing went");
  const again = await service.previewScope(personIn("project-q4"), "project");
  assert.deepEqual(await service.clearScope(personIn("project-q4"), "project", again.fingerprint), { removed: 3 });
  assert.deepEqual(texts((await service.list(personIn("project-q4"))).items), ["周报用要点列表"]);
  assert.deepEqual(texts((await service.recall(work(writer), query)).items), ["周报用要点列表"]);
});

test("memories limited to a plugin, an object kind or a Goal come only where that holds; a plugin's own memories are read by that plugin alone and obey the person's switches", { timeout: 60_000 }, async t => {
  const { service } = await memoryHome(t);
  const person = personIn("project-q4");
  await service.write(person, { scope: "project", text: "表格插件里金额保留两位小数", applies: { plugin_ids: ["tables"] } });
  await service.write(person, { scope: "project", text: "改 Goal 的描述时保留原来的量化指标", applies: { object_kinds: ["goal"] } });
  await service.write(person, { scope: "project", text: "发布里程碑这个 Goal 用英文写进展", applies: { goal_ids: ["goal-launch"] } });
  await service.write(person, { scope: "project", text: "周报先写风险" });
  const at = (situation: object) => service.recall(work(null), { query: "金额 描述 进展 风险 周报", situation } as never).then(result => texts(result.items));
  assert.deepEqual(await at({}), ["周报先写风险"], "no plugin, object or Goal: only the unlimited one");
  assert.deepEqual(await at({ plugin_id: "tables" }), ["周报先写风险", "表格插件里金额保留两位小数"]);
  assert.deepEqual(await at({ plugin_id: "pages" }), ["周报先写风险"], "another plugin never gets it");
  assert.deepEqual(await at({ object_kind: "goal", goal_id: "goal-other" }), ["周报先写风险", "改 Goal 的描述时保留原来的量化指标"]);
  assert.deepEqual(await at({ object_kind: "goal", goal_id: "goal-launch" }), ["发布里程碑这个 Goal 用英文写进展", "周报先写风险", "改 Goal 的描述时保留原来的量化指标"]);

  // A plugin keeps its own memories (namespace = its identity from the Host); only it reads them.
  const tables: MemoryCaller = { actor_id: "web-user", project_id: "project-q4", consumer: "plugin", plugin_id: "tables" };
  const pages: MemoryCaller = { ...tables, plugin_id: "pages" };
  const own = await service.write(tables, { scope: "project", text: "上次导出用的是 CSV 格式", kind: "preference" });
  assert.equal(own.outcome, "written");
  assert.equal(own.memory!.source, "plugin");
  assert.equal(own.memory!.plugin_id, "tables");
  assert.deepEqual(own.memory!.approved_by, { by: "policy", policy: "plugin:tables", version: 1 });
  assert.match(own.memory!.origin, /插件「tables」记下/);
  assert.ok((await service.recall(tables, { query: "导出 格式" })).items.some(item => item.text === "上次导出用的是 CSV 格式"));
  assert.equal((await service.recall(pages, { query: "导出 格式" })).items.some(item => item.text === "上次导出用的是 CSV 格式"), false, "another plugin never reads it");
  assert.equal((await service.recall(work(null), { query: "导出 格式" })).items.some(item => item.text === "上次导出用的是 CSV 格式"), false, "nor the Assistant");
  assert.ok((await service.list(person)).items.some(item => item.text === "上次导出用的是 CSV 格式" && item.source === "plugin"), "the person sees everything kept for them");
  // The person's switches hold for plugins: this plugin blocked → it neither writes nor reads; switched off for plugins → the same.
  service.savePrefs(person, "project", { plugins: { tables: { allowed: false, kinds: ["preference"] } } } as never);
  await assert.rejects(service.write(tables, { scope: "project", text: "再记一条" }), /没有允许这个插件/);
  const blocked = await service.recall(tables, { query: "导出 格式 金额" });
  assert.deepEqual(blocked.items, [], "none of the project's memories, its own included");
  assert.match(blocked.reason ?? "", /插件.*项目记忆/);
  service.savePrefs(person, "project", { plugins: { tables: { allowed: true, kinds: ["preference", "convention"] } }, consumers: { plugin: false } } as never);
  await assert.rejects(service.write(tables, { scope: "project", text: "再记一条" }), /没有允许这个插件/);
  // A disabled plugin memory stays off even for its own plugin.
  service.savePrefs(person, "project", { consumers: { plugin: true } } as never);
  await service.change(person, { memory_id: own.memory!.memory_id, action: "disable" });
  assert.equal((await service.recall(tables, { query: "导出 格式" })).items.some(item => item.text === "上次导出用的是 CSV 格式"), false);
});

// Decision 19 (specs/repository-anti-corruption, W2-03): no plugin uses memory, and a plugin's call carries no Host-confirmed plugin identity
// today (the Studio's generated plugins carry none), so `memory.write` was refused and `memory.recall` and `memory.list` could not apply the
// person's rule for one plugin. The directory shows plugins none of them until a plugin really uses memory with a Host-confirmed identity;
// MemoryService above still holds a plugin to its own namespace and to the kinds the person allows, for that day. The Studio's capability
// board follows the directory: tests/agent-built-plugins-catalog.test.ts.
test("plugins are not an audience of memory yet: the directory offers them none of memory.*, and a call is refused", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-plugin-actions-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const client = host.homeActionClient();
  const plugin = (plugin_id: string): ActionCallContext => ({ actor_id: `plugin:${plugin_id}`, actor_kind: "runtime", project_id: null, audience: "plugin",
    host_plugin: { plugin_id, install_id: `install-${plugin_id}` } as never, permissions: [...MEMORY_PERMISSIONS] });
  const person: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: [...MEMORY_PERMISSIONS] };
  const agent: ActionCallContext = { actor_id: "agent:coding-1", actor_kind: "runtime", project_id: null, audience: "agent", permissions: [...MEMORY_PERMISSIONS] };
  const ofMemory = (views: readonly { provider: { provider_id: string }; capability_id: string }[]) => views.filter(view => view.provider.provider_id === MEMORY_PROVIDER_ID).map(view => view.capability_id).sort();

  // Declared: no plugin audience, and `plugin: false` because all three are open to agents and would otherwise reach plugins through them.
  for (const action of [memoryActions.recall, memoryActions.list, memoryActions.write]) {
    assert.equal(action.action.audiences.includes("plugin" as never), false, action.capability_id);
    assert.equal(action.action.plugin, false, action.capability_id);
  }
  // Directory and metadata inspection: a plugin sees none of them, an agent the same three as before.
  assert.deepEqual(ofMemory(await client.discover(plugin("tables"))), []);
  assert.deepEqual(ofMemory(await host.inspectActions(plugin("tables"))), []);
  assert.deepEqual(ofMemory(await client.discover(agent)), ["memory.list", "memory.recall", "memory.write"]);

  // A call from a plugin is refused whatever the permission it holds, and nothing was kept.
  const asPerson = bindActionClient(client, () => person);
  const call = (capability_id: string, input: unknown) => client.invoke(plugin("tables"), { capability_id, version: 1, provider_id: MEMORY_PROVIDER_ID }, input);
  const forbidden = { code: "actions.forbidden" };
  await assert.rejects(call(memoryActions.write.capability_id, { scope: "personal", text: "表格默认按日期倒序" }), forbidden);
  await assert.rejects(call(memoryActions.recall.capability_id, { query: "表格 日期 排序" }), forbidden);
  await assert.rejects(call(memoryActions.list.capability_id, {}), forbidden);
  await assert.rejects(call(memoryActions.change.capability_id, { memory_id: "m1", action: "remove" }), forbidden);
  assert.deepEqual((await asPerson.invoke(memoryActions.list, {})).items, []);
});
