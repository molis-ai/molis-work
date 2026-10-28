import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkLocalHost, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { AgentHost, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts, CODING_INPUT_RECEIPTS_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";
import vm from "node:vm";
import type { AgentRunRef, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";

const coding = "/api/plugins/io.molis.work.coding";
type Environment = Awaited<ReturnType<typeof codingProductHost>>;
async function session(f: Environment): Promise<string> {
  const result = await f.call<{ session: { session_id: string } }>(f.project.project_id, coding + "/sessions", {});
  assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body.session.session_id;
}
function start(f: Environment, id: string, task: string, extra: Record<string, unknown> = {}) {
  return f.call<{ run: { ref: AgentRunRef }; code?: string; error?: string }>(f.project.project_id, coding + `/sessions/${id}/runs`, {
    task, intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model", ...extra,
  });
}
async function completed(f: Environment, result: Awaited<ReturnType<typeof start>>): Promise<AgentRunView> {
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const view = await f.ended(result.body.run.ref); assert.equal(view.phase, "completed", view.stop_reason); return view;
}

test("Coding protected HTTP keeps the exact original separately from the assembled task and restores it from the existing attempt", { timeout: 60_000 }, async t => {
  const f = await codingProductHost(t, () => cogniaModelResponse("已读。")), id = await session(f);
  const task = "  本项目统一用 pnpm。\r\n只解释这个约定。  ", inputId = randomUUID(), before = Date.now();
  const view = await completed(f, await start(f, id, task, { original_input: { input_id: inputId, text: task } }));
  assert.deepEqual(view.original_input?.ref, { session_id: view.ref.session_id, input_id: inputId, version: 1 });
  assert.equal(view.original_input?.text, task, "the owner retains exact bytes before Coding trims or appends instructions");
  assert.equal(view.original_input?.written_by, "person");
  assert.ok(Date.parse(view.original_input!.occurred_at) >= before && Date.parse(view.original_input!.occurred_at) <= Date.now());
  assert.deepEqual(view.frozen.original_input, view.original_input!.ref);
  assert.notEqual(view.turns.find(turn => turn.kind === "user")?.text, task, "assembled transcript is not used as the source owner");
  const timeline = await f.call<{ runs: AgentRunView[] }>(f.project.project_id, coding + `/sessions/${id}`);
  assert.equal(timeline.status, 200, JSON.stringify(timeline.body));
  assert.deepEqual(timeline.body.runs.find(run => run.ref.run_id === view.ref.run_id)?.original_input, view.original_input,
    "the production readSession/readRun Action schemas retain the canonical original in the HTTP timeline");
  await f.host.close();
  const reopened = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
  try {
    const service = ensureSystemAgentService(reopened, f.home); await service.ready;
    const restored = await service.agentHost.adapter("prologue").read(view.ref);
    assert.deepEqual(restored.original_input, view.original_input, "fresh SDK/AgentHost reads the persisted original and its first time");
    assert.deepEqual(restored.frozen.original_input, view.original_input!.ref);
  } finally { await reopened.close(); }
});

test("reusing an input identity retains its first time; changed words are refused before another request", { timeout: 60_000 }, async t => {
  const f = await codingProductHost(t, () => cogniaModelResponse("好的。")), id = await session(f), task = "检查本仓库的安装约定", inputId = randomUUID();
  const envelope = { original_input: { input_id: inputId, text: task } };
  const first = await completed(f, await start(f, id, task, envelope));
  const retried = await completed(f, await start(f, id, task, envelope));
  assert.notEqual(retried.ref.run_id, first.ref.run_id, "source identity does not promise execution idempotency");
  assert.deepEqual(retried.original_input, first.original_input);
  const count = f.requests.length, changed = "改成 npm";
  const refused = await start(f, id, changed, { original_input: { input_id: inputId, text: changed } });
  assert.notEqual(refused.status, 200, JSON.stringify(refused.body));
  assert.equal(f.requests.length, count, "changed canonical source never dispatches another model request");
});

test("MEM-35 production source assembly checks the current Coding installation without starting or repairing it", { timeout: 60_000 }, async t => {
  const f = await codingProductHost(t, () => cogniaModelResponse("已读。")), id = await session(f);
  const text = "本项目统一用 pnpm", inputId = randomUUID();
  const view = await completed(f, await start(f, id, text, { original_input: { input_id: inputId, text } }));
  const adapter = ensureSystemAgentService(f.host, f.home).agentHost.adapter("prologue");
  const { owner } = await adapter.readSessionStatus!({ session_id: view.ref.session_id, runtime_id: "prologue" });
  assert.ok(view.class_restrictions, "the completed production Run provides its original classification policy");
  const memory = adapter.memory!.withCaller({ actor_id: owner.actor_id, project_id: owner.project_id, consumer: "agent",
    plugin_id: owner.plugin_id, session_id: view.ref.session_id, current_scene: "coding", purpose: "management", source_use: "learning",
    class_restrictions: structuredClone(view.class_restrictions) });
  const sources = [{ event_id: "molis-input:1:" + JSON.stringify([owner.actor_id, view.ref.session_id, "original", inputId]), version: "1" }];
  const propose = () => memory.candidates.propose({ scope: "project", owner: owner.project_id, text, origin: "source-test", sources,
    expected_version: 0, operation_id: randomUUID(), meta: { kind: "convention", source: "extraction", basis: "explicit",
      classification: { scenes: ["coding"], lifecycle: "long-term" } } });
  const candidate = await propose();
  assert.deepEqual(candidate.sources, [{ ...sources[0], speaker: { kind: "person", id: owner.actor_id }, derivation: "original",
    occurred_at_ms: Date.parse(view.original_input!.occurred_at) }]);
  const storage = new LocalSqliteStorage(f.project.database_path), installs = new SqlitePluginRuntimeRepository(storage.db);
  try {
    const original = installs.get(owner.install_id); assert.ok(original); assert.equal(original.state, "running");
    for (const patch of [{ state: "disabled" as const }, { state: "uninstalled" as const }]) {
      const stopped: PluginInstanceRecord = { ...original, ...patch }; installs.save(stopped);
      await assert.rejects(propose(), { code: "MEMORY_NOT_ACCEPTED" });
      assert.deepEqual(installs.get(owner.install_id), stopped, "a source read cannot repair grants or restart an installation");
      assert.equal((await memory.candidates.list("project", owner.project_id)).length, 1);
    }
    installs.save(original);
    const grant = (allowed: boolean) => f.call(owner.project_id, "/api/memory/prefs", { scope: "project",
      prefs: { plugins: { [owner.plugin_id]: { allowed, kinds: ["convention"] } } } });
    assert.equal((await grant(false)).status, 200);
    await assert.rejects(propose(), { code: "MEMORY_SCOPE_DENIED" });
    assert.equal((await grant(true)).status, 200);
    assert.deepEqual((await propose()).sources, candidate.sources);
  } finally { storage.close(); }
});

test("same-session continuation carries the original reference; another Session's run cannot be used", { timeout: 60_000 }, async t => {
  const f = await codingProductHost(t, () => cogniaModelResponse("好的。")), id = await session(f), task = "只读检查项目";
  const first = await completed(f, await start(f, id, task, { original_input: { input_id: randomUUID(), text: task } }));
  const next = await completed(f, await start(f, id, "宿主根据已完成的回执继续检查", { continued_from: first.ref }));
  assert.deepEqual(next.original_input, first.original_input);
  assert.deepEqual(next.frozen.continued_from, first.ref);
  const other = await session(f), count = f.requests.length;
  const refused = await start(f, other, "继续", { continued_from: first.ref });
  assert.notEqual(refused.status, 200, JSON.stringify(refused.body)); assert.equal(f.requests.length, count);
});

test("absent, mismatched, and derived HTTP originals never become personal source records", { timeout: 60_000 }, async t => {
  const f = await codingProductHost(t, () => cogniaModelResponse("好的。")), id = await session(f), task = "检查项目约定";
  for (const extra of [{}, { original_input: { input_id: randomUUID(), text: "与任务不同的原话" } },
    { origin_task: "宿主恢复的任务", original_input: { input_id: randomUUID(), text: task } }]) {
    const view = await completed(f, await start(f, id, task, extra));
    assert.equal(view.original_input, undefined); assert.equal(view.frozen.original_input, undefined);
    const continued = await completed(f, await start(f, id, "继续宿主任务", { continued_from: view.ref }));
    assert.equal(continued.original_input, undefined, "continuation of a source-unknown run cannot manufacture an original");
  }
  const count = f.requests.length;
  const forged = await start(f, id, task, { original_input: { input_id: randomUUID(), text: task, written_by: "person", occurred_at: "2020-01-01T00:00:00Z" } });
  assert.equal(forged.status, 400, JSON.stringify(forged.body)); assert.equal(f.requests.length, count);
});

test("a second start in one Session is refused while the original is in flight, then reuses its first canonical time", { timeout: 60_000 }, async t => {
  let release = () => {}; const gate = new Promise<void>(resolve => { release = resolve; });
  t.after(release);
  const f = await codingProductHost(t, async (_request, turn) => { if (turn === 1) await gate; return cogniaModelResponse("好的。"); });
  const id = await session(f), task = "本项目检查", original_input = { input_id: randomUUID(), text: task };
  const first = await start(f, id, task, { original_input }); assert.equal(first.status, 200, JSON.stringify(first.body));
  const overlapping = await start(f, id, task, { original_input });
  assert.notEqual(overlapping.status, 200, "one Session does not admit two unresolved starts");
  release(); const original = await f.ended(first.body.run.ref);
  const later = await completed(f, await start(f, id, task, { original_input }));
  assert.deepEqual(later.original_input, original.original_input);
});

test("the shipped Coding input sender retains a failed command's identity and excludes derived starts", async () => {
  const sent: Array<{ original_input?: { input_id: string; text: string } }> = []; let fail = true;
  const factory = vm.runInNewContext(`(${CODING_INPUT_RECEIPTS_CLIENT_FACTORY_SCRIPT})`, { crypto: { randomUUID }, JSON });
  const client = factory({ translate: (key: string) => key, api: async (_path: string, _method: string, body: { original_input?: { input_id: string; text: string } }) => {
    sent.push(structuredClone(body)); if (fail) { fail = false; throw new Error("lost response"); } return {};
  } });
  const command = { task: "原始任务", intent: "discuss" };
  await assert.rejects(client.start("session", command)); await client.start("session", command);
  assert.deepEqual(sent[0]!.original_input, sent[1]!.original_input);
  await client.start("session", { ...command, task: "新任务" });
  assert.notEqual(sent[2]!.original_input!.input_id, sent[1]!.original_input!.input_id);
  for (const derived of [{ reask: "question" }, { plan_revision: 1 }, { continued_from: { session_id: "session", run_id: "run" } }, { wait_for: "other" }]) {
    await client.start("session", { ...command, ...derived }); assert.equal(sent.at(-1)!.original_input, undefined);
  }
});

test("a plugin start DTO cannot claim person without the protected Host authority, or change the offered words", async () => {
  const root = await mkdtemp(join(tmpdir(), "coding-original-authority-")); let models = 0;
  const adapter = await createPrologueNodeAdapter({ app: { appId: "coding.original.authority", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"),
    modelConfiguration: async () => { models++; throw new Error("not reached"); } });
  try {
    const host = new AgentHost(); host.register(adapter);
    const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "installation", actor_id: "person" };
    const directory = { canonical_path: root, realpath_verified: true }, session = await adapter.createSession({ ...owner, directory, title: "Original authority" });
    const original = { input_id: randomUUID(), text: "原话", written_by: "person" as const, occurred_at: new Date().toISOString() };
    const request = { ...owner, session, directory, role_id: "discuss", task: "原话及宿主补充", original_input: original };
    const authority = { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] };
    await assert.rejects(host.start("prologue", request, authority), { code: "agent.capability_unavailable" });
    for (const change of [{ text: "别人的原话" }, { install_id: "other-install" }, { written_by: "host" as const }, { occurred_at: "2000-01-01T00:00:00Z" }, { use: "supplement" as const }]) {
      await assert.rejects(host.start("prologue", request, { ...authority, original_input: { ...original, install_id: owner.install_id, ...change } }), { code: "agent.capability_unavailable" });
    }
    assert.equal(models, 0); assert.deepEqual((await adapter.readSession(session)).runs, [], "provenance refusal creates no SDK execution");
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
