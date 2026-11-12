import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import type { AgentRunRef, AgentMemoryCapability } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingProductHost, type CodingProviderRequest } from "./fixtures/coding-product-host.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { untilSetup } from "./fixtures/connector-assistant-model.js";

const coding = "/api/plugins/io.molis.work.coding";
function formation(request: CodingProviderRequest) {
  const content = request.messages.at(-1)!.content;
  const prompt = typeof content === "string" ? content : content.map(block => block.text ?? "").join("\n");
  try {
    const data = JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n") + 2));
    return data.sources && data.destinations ? data as { sources: Array<{ id: string; text: string }>; destinations: Array<{ scope: string; replacement?: string; slots: Record<string, string[]> }> } : undefined;
  } catch { return undefined; }
}

// MEM-21: Coding's extraction lands in the same durable candidate box, not a new inbox.
test("MEM-V0-C2 Coding's protected completed round enters the original durable learning runner and forms a reviewed candidate", { timeout: 60_000 }, async t => {
  let extracted = 0;
  const text = "本项目以后统一用 pnpm 安装依赖";
  const f = await codingProductHost(t, request => {
    const data = formation(request);
    if (!data) return cogniaModelResponse("已读。");
    extracted++;
    const slot = data.destinations.find(item => item.scope === "project" && !item.replacement)?.slots.convention?.[0];
    assert.ok(slot);
    return cogniaModelResponse(JSON.stringify({ drafts: [{ slot_id: slot, text, suggested_basis: "explicit",
      evidence: data.sources.map(source => ({ source_id: source.id, quote: source.text })) }] }));
  });
  const created = await f.call<{ session: { session_id: string } }>(f.project.project_id, coding + "/sessions", {});
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const result = await f.call<{ run: { ref: AgentRunRef } }>(f.project.project_id, coding + `/sessions/${created.body.session.session_id}/runs`, {
    task: text, intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model",
    original_input: { input_id: randomUUID(), text },
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal((await f.ended(result.body.run.ref)).phase, "completed");
  const adapter = ensureSystemAgentService(f.host, f.home).agentHost.adapter("prologue");
  const task = await untilSetup(async () => adapter.schedule!.list("memory.learn").find(task => task.session_id === result.body.run.ref.session_id), "Coding completed round durable learning receipt");
  assert.equal(task.kind, "memory.learn");
  const ended = await settled(f, task.key);
  assert.equal(ended.state, "done", JSON.stringify(ended));
  assert.equal(extracted, 1);
  const candidates = await f.call<{ candidates: Array<{ candidate_id: string; version: number; text: string; state: string; basis: string }> }>(f.project.project_id, "/api/memory/overview?scope=project");
  assert.equal(candidates.status, 200, JSON.stringify(candidates.body));
  const candidate = candidates.body.candidates.find(candidate => candidate.text === text && candidate.state === "pending"); assert.ok(candidate);
  const accepted = await f.call<{ memory: { text: string; source: string } }>(f.project.project_id,
    `/api/memory/candidates/${candidate.candidate_id}/accept`, { expected_version: candidate.version });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body)); assert.equal(accepted.body.memory.text, text); assert.equal(accepted.body.memory.source, "accepted");
  assert.equal(adapter.schedule!.list("memory.learn").filter(one => one.key === task.key).length, 1);
});

async function round(f: Awaited<ReturnType<typeof codingProductHost>>, text: string, original = true) {
  const created = await f.call<{ session: { session_id: string } }>(f.project.project_id, coding + "/sessions", {});
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const id = created.body.session.session_id;
  const result = await f.call<{ run: { ref: AgentRunRef } }>(f.project.project_id, coding + `/sessions/${id}/runs`, {
    task: text, intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model",
    ...(original ? { original_input: { input_id: randomUUID(), text } } : {}),
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal((await f.ended(result.body.run.ref)).phase, "completed");
  return { id, ref: result.body.run.ref };
}
function queued(f: Awaited<ReturnType<typeof codingProductHost>>, ref: AgentRunRef) {
  const schedule = ensureSystemAgentService(f.host, f.home).agentHost.adapter("prologue").schedule!;
  return untilSetup(async () => schedule.list("memory.learn").find(task => task.session_id === ref.session_id && task.payload.run_id === ref.run_id), "real Coding learning receipt");
}
function settled(f: Awaited<ReturnType<typeof codingProductHost>>, key: string) {
  const schedule = ensureSystemAgentService(f.host, f.home).agentHost.adapter("prologue").schedule!;
  return untilSetup(async () => { const task = schedule.find(key); return task && ["done", "failed", "reconcile-required"].includes(task.state) ? task : undefined; }, "real Coding learning settlement");
}

for (const canonicalOnly of [false, true]) for (const archiveAt of ["extraction", "ledger"] as const) test(`MEM-V0-C2 actual formation unions old Coding source A with B; archiving A at ${archiveAt} ${canonicalOnly ? "before business archive" : "through business owner"} refuses the next real write`, { timeout: 60_000 }, async t => {
  const release = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>();
  t.after(() => release.resolve()); let extracted = 0;
  const text = "本项目以后统一用 pnpm 安装依赖";
  const f = await codingProductHost(t, async request => {
    const data = formation(request);
    if (!data) return cogniaModelResponse("已读。");
    extracted++;
    if (extracted === 2) { assert.equal(data.sources.length, 2, "production selection includes the original pending source A");
      if (archiveAt === "extraction") { entered.resolve(); await release.promise; } }
    const slot = data.destinations.find(item => item.scope === "project" && !item.replacement)?.slots.convention?.[0]; assert.ok(slot);
    return cogniaModelResponse(JSON.stringify({ drafts: [{ slot_id: slot, text, suggested_basis: "explicit",
      evidence: data.sources.map(source => ({ source_id: source.id, quote: source.text })) }] }));
  });
  const system = ensureSystemAgentService(f.host, f.home); await system.ready;
  const capability = system.agentHost.adapter("prologue").memory!, withCaller = capability.withCaller.bind(capability);
  let forms = 0;
  const observe = (current: AgentMemoryCapability): AgentMemoryCapability => ({ ...current,
    candidates: { ...current.candidates, form: async input => {
      const result = await current.candidates.form(input);
      if (++forms === 2 && archiveAt === "ledger") { assert.ok(result.items.some(item => item.candidate), "SDK has confirmed B before App ledger registration"); entered.resolve(); await release.promise; }
      return result;
    } }, withCaller: caller => observe(current.withCaller(caller)),
    ...(current.withExecution ? { withExecution: control => observe(current.withExecution!(control)) } : {}),
  });
  t.mock.method(capability, "withCaller", caller => observe(withCaller(caller)));
  const a = await round(f, text), first = await queued(f, a.ref);
  assert.equal((await settled(f, first.key)).state, "done");
  const b = await round(f, text), second = await queued(f, b.ref);
  await entered.promise;
  const reference = { project_id: f.project.project_id, storage_key: f.project.database_path };
  if (canonicalOnly) {
    assert.equal((await system.agentHost.adapter("prologue").sessionLifecycle!.archive({ runtime_id: "prologue", session_id: a.ref.session_id })).state, "archived");
    assert.equal((await f.call<{ session: { archived: boolean } }>(f.project.project_id, coding + `/sessions/${a.id}`)).body.session.archived, false, "SDK success precedes the deliberately unwritten business side");
  } else await f.host.actionClient(reference).invoke(await f.host.localPersonContext(reference),
    { capability_id: "coding.sessions.update", version: 1, provider_id: "io.molis.work.coding" }, { session_id: a.id, archive: true });
  release.resolve();
  const ended = await settled(f, second.key); assert.equal(ended.state, "failed", JSON.stringify(ended));
  assert.equal(extracted, 2, "retry cannot send the archived old source to the extractor again");
  const candidates = await f.call<{ candidates: Array<{ candidate_id: string; text: string; state: string }> }>(f.project.project_id, "/api/memory/overview?scope=project");
  assert.equal(candidates.status, 200); assert.equal(candidates.body.candidates.length, 1, "the already confirmed A candidate remains; B adds no ledger candidate");
  const memory = ensureSystemAgentService(f.host, f.home).agentHost.adapter("prologue").memory!;
  const entries = await memory.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, consumer: "ui", project_id: f.project.project_id, person: true, current_scene: "coding", purpose: "management" }).candidates.list("project", f.project.project_id);
  assert.equal(entries.length, archiveAt === "extraction" ? 1 : 2,
    "the actual SDK preserves prior confirmed facts; archive refuses only the subsequent candidate or ledger write");
});

test("MEM-V0-C2 derived work without a protected personal original never enters automatic learning", { timeout: 60_000 }, async t => {
  const f = await codingProductHost(t, () => cogniaModelResponse("已读。"));
  const work = await round(f, "本项目以后统一用 pnpm 安装依赖", false);
  await untilSetup(async () => {
    const current = await f.call<{ session: { state: string } }>(f.project.project_id, coding + `/sessions/${work.id}`);
    return current.body.session.state === "done" ? true : undefined;
  }, "original Coding follower recorded terminal work");
  const tasks = ensureSystemAgentService(f.host, f.home).agentHost.adapter("prologue").schedule!.list("memory.learn");
  assert.equal(tasks.filter(task => task.session_id === work.ref.session_id).length, 0);
});

for (const reinstalled of [false, true]) test(`MEM-V0-C2 queued Host restart ${reinstalled ? "rejects a replacement installation generation" : "re-enters the normally assembled current Coding owner"}`, { timeout: 60_000 }, async t => {
  let extracted = 0;
  const text = "本项目以后统一用 pnpm 安装依赖";
  const f = await codingProductHost(t, request => {
    const data = formation(request); if (!data) return cogniaModelResponse("已读。"); extracted++;
    const slot = data.destinations.find(item => item.scope === "project" && !item.replacement)?.slots.convention?.[0]; assert.ok(slot);
    return cogniaModelResponse(JSON.stringify({ drafts: [{ slot_id: slot, text, suggested_basis: "explicit", evidence: data.sources.map(source => ({ source_id: source.id, quote: source.text })) }] }));
  });
  const originalService = ensureSystemAgentService(f.host, f.home); await originalService.ready;
  const adapter = originalService.agentHost.adapter("prologue"), schedule = adapter.schedule!, enqueue = schedule.enqueue.bind(schedule);
  t.mock.method(schedule, "enqueue", (input, control) => enqueue({ ...input, ...(input.kind === "memory.learn" ? { due_at: new Date(Date.now() + 5000).toISOString() } : {}) }, control));
  const work = await round(f, text), saved = await queued(f, work.ref);
  assert.equal(saved.state, "queued"); assert.equal(extracted, 0);
  const payload = saved.payload as { owner: { install_id: string; installation_generation: string } };
  assert.ok(payload.owner.installation_generation); assert.equal(JSON.stringify(saved.payload).includes(text), false);
  await f.host.close();
  if (reinstalled) {
    const { LocalSqliteStorage } = await import("@molis-ai/molis-work-storage");
    const { SqlitePluginRuntimeRepository } = await import("@molis-ai/molis-work-plugin-runtime");
    const storage = new LocalSqliteStorage(f.project.database_path);
    try {
      const records = new SqlitePluginRuntimeRepository(storage.db), original = records.get(payload.owner.install_id); assert.ok(original);
      records.save({ ...original, installation_generation: randomUUID() });
    } finally { storage.close(); }
  }
  const { MolisWorkLocalHost } = await import("@molis-ai/molis-work-app-local-host");
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const reopened = new MolisWorkLocalHost({ homeDirectory: f.home });
  try {
    const withCatalog = reopened.configurePersonalPlanning(f.home, withMolisWorkProjectCatalog);
    const service = ensureSystemAgentService(reopened, f.home, withCatalog); await service.ready;
    const queue = service.agentHost.adapter("prologue").schedule!;
    const outcome = await untilSetup(async () => { const task = queue.find(saved.key); return task && ["done", "failed", "reconcile-required"].includes(task.state) ? task : undefined; }, "queued task after real Host restart");
    assert.equal(outcome.state, reinstalled ? "failed" : "done", JSON.stringify(outcome));
    assert.equal(extracted, reinstalled ? 0 : 1);
  } finally { await reopened.close(); }
});

test("MEM-V0-C2 archive during the real SDK first-Storage beforeCommit wait leaves no durable learning task or extraction", { timeout: 60_000 }, async t => {
  const reached = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), rejected = Promise.withResolvers<unknown>();
  t.after(() => release.resolve()); let extracted = 0;
  const f = await codingProductHost(t, request => { if (formation(request)) extracted++; return cogniaModelResponse("已读。"); });
  const originalService = ensureSystemAgentService(f.host, f.home); await originalService.ready;
  const adapter = originalService.agentHost.adapter("prologue"), schedule = adapter.schedule!, enqueue = schedule.enqueue.bind(schedule);
  t.mock.method(schedule, "enqueue", async (input, control) => {
    if (input.kind !== "memory.learn") return enqueue(input, control);
    assert.ok(control?.beforeCommit, "production follow supplies the SDK admission control");
    try { return await enqueue(input, { ...control, beforeCommit: async () => {
      const final = await control.beforeCommit!(); reached.resolve(); await release.promise; return final;
    } }); } catch (error) { rejected.resolve(error); throw error; }
  });
  const work = await round(f, "本项目以后统一用 pnpm 安装依赖"); await reached.promise;
  const reference = { project_id: f.project.project_id, storage_key: f.project.database_path };
  await f.host.actionClient(reference).invoke(await f.host.localPersonContext(reference),
    { capability_id: "coding.sessions.update", version: 1, provider_id: "io.molis.work.coding" }, { session_id: work.id, archive: true });
  release.resolve(); assert.ok(await rejected.promise);
  assert.equal(schedule.list("memory.learn").filter(task => task.session_id === work.ref.session_id).length, 0);
  assert.equal(extracted, 0);
  await f.host.close();
  const { MolisWorkLocalHost } = await import("@molis-ai/molis-work-app-local-host");
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const reopened = new MolisWorkLocalHost({ homeDirectory: f.home });
  try {
    const withCatalog = reopened.configurePersonalPlanning(f.home, withMolisWorkProjectCatalog);
    const service = ensureSystemAgentService(reopened, f.home, withCatalog); await service.ready;
    const queue = service.agentHost.adapter("prologue").schedule!;
    assert.equal(queue.list("memory.learn").filter(task => task.session_id === work.ref.session_id).length, 0, "fresh Host sees no accepted queue record");
    assert.equal(extracted, 0);
  } finally { await reopened.close(); }
});

test("MEM-V0-C2 a failed Run with a protected original never starts automatic learning", { timeout: 60_000 }, async t => {
  const f = await codingProductHost(t, () => new Response("controlled provider refusal", { status: 400 }));
  const created = await f.call<{ session: { session_id: string } }>(f.project.project_id, coding + "/sessions", {}); assert.equal(created.status, 200);
  const text = "本项目以后统一用 pnpm 安装依赖";
  const result = await f.call<{ run: { ref: AgentRunRef } }>(f.project.project_id, coding + `/sessions/${created.body.session.session_id}/runs`, {
    task: text, intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model", original_input: { input_id: randomUUID(), text },
  });
  assert.equal(result.status, 200); assert.equal((await f.ended(result.body.run.ref)).phase, "failed");
  await untilSetup(async () => { const current = await f.call<{ session: { state: string } }>(f.project.project_id, coding + `/sessions/${created.body.session.session_id}`); return current.body.session.state === "failed" ? true : undefined; }, "original Coding follower recorded failure");
  assert.equal(ensureSystemAgentService(f.host, f.home).agentHost.adapter("prologue").schedule!.list("memory.learn").filter(task => task.session_id === result.body.run.ref.session_id).length, 0);
});

test("MEM-V0-C2 Coding retains a matching Assistant pending source and the original SourcePort refuses the whole mixed-owner formation", { timeout: 60_000 }, async t => {
  const { endingReviewAnswer } = await import("./fixtures/ending-review.js");
  const { cogniaScriptedResponse } = await import("./fixtures/cognia-model-response.js");
  let extracted = 0;
  const text = "本项目以后统一用 pnpm 安装依赖";
  const f = await codingProductHost(t, request => {
    const data = formation(request);
    if (data) {
      extracted++; const slot = data.destinations.find(item => item.scope === "project" && !item.replacement)?.slots.convention?.[0]; assert.ok(slot);
      return cogniaModelResponse(JSON.stringify({ drafts: [{ slot_id: slot, text, suggested_basis: "explicit", evidence: data.sources.map(source => ({ source_id: source.id, quote: source.text })) }] }));
    }
    const review = endingReviewAnswer(request, () => []);
    return review === undefined ? cogniaModelResponse("已读。") : cogniaScriptedResponse(undefined, review);
  });
  const sent = await f.web.post<{ work: { work_id: string; session_id: string }; run_id: string }>(`/projects/${f.project.project_id}/api/assistant/send`, {
    text, scope: { kind: "project", project_id: f.project.project_id }, request_id: randomUUID(),
  });
  const originalService = ensureSystemAgentService(f.host, f.home); await originalService.ready;
  const schedule = originalService.agentHost.adapter("prologue").schedule!;
  const assistantTask = await untilSetup(async () => schedule.list("memory.learn").find(task => task.session_id === sent.work.session_id), "Assistant original pending candidate");
  const assistantOutcome = await settled(f, assistantTask.key);
  assert.equal(assistantOutcome.state, "done", assistantOutcome.last_failure); assert.equal(extracted, 1);
  const { MemoryService } = await import("@molis-ai/molis-work-service-memory");
  const { prologueMemoryBackend } = await import("@molis-ai/molis-work-app-local-host");
  const { openMemoryLedger } = await import("@molis-ai/molis-work-storage");
  const capability = originalService.agentHost.adapter("prologue").memory!;
  const person = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: f.project.project_id, consumer: "ui" as const, person: true, purpose: "management" as const, current_scene: "common" as const };
  const [assistantCandidate] = await capability.withCaller(person).candidates.list("project", f.project.project_id); assert.ok(assistantCandidate?.sources?.length);
  // Existing person management can form common pending notes with authentic Assistant sources. This is the historical
  // cross-owner shape the automatic Coding caller must refuse; no source/grant test bypass is installed.
  const ledger = openMemoryLedger({ homeDirectory: f.home });
  try {
    const service = new MemoryService({ backend: prologueMemoryBackend(async () => capability), ledger });
    const seeded = await service.learnFromWork({ ...person, operation_id: randomUUID() }, { said: [text],
      sources: assistantCandidate.sources!.map(source => ({ ...source, text })) });
    assert.equal(seeded.formation.outcome, "completed");
  } finally { ledger.close(); }
  assert.equal(extracted, 2);
  const before = await f.call<{ candidates: Array<{ candidate_id: string }> }>(f.project.project_id, "/api/memory/overview?scope=project");
  assert.equal(before.body.candidates.length, 2);
  let actualSources = 0;
  const memory = originalService.agentHost.adapter("prologue").memory!, withCaller = memory.withCaller.bind(memory);
  const observe = (capability: AgentMemoryCapability): AgentMemoryCapability => ({ ...capability,
    candidates: { ...capability.candidates, form: async input => { actualSources = input.sources?.length ?? 0; return capability.candidates.form(input); } },
    withCaller: caller => observe(capability.withCaller(caller)),
    ...(capability.withExecution ? { withExecution: control => observe(capability.withExecution!(control)) } : {}),
  });
  t.mock.method(memory, "withCaller", caller => observe(withCaller(caller)));
  const codingRound = await round(f, text), task = await queued(f, codingRound.ref);
  const result = await settled(f, task.key); assert.equal(result.state, "failed", JSON.stringify(result));
  assert.equal(actualSources, 2, "the original complete union reaches SDK form; no owner is filtered out");
  assert.equal(extracted, 2, "a Coding caller cannot dispatch Assistant original text to the extractor");
  const after = await f.call<{ candidates: Array<{ candidate_id: string }> }>(f.project.project_id, "/api/memory/overview?scope=project");
  assert.deepEqual(after.body.candidates.map(item => item.candidate_id), before.body.candidates.map(item => item.candidate_id), "the old pending source is preserved and no filtered substitute is formed");
});

test("MEM-V0-C2 existing assisted policy keeps the original two-source v3 automatic promotion for Coding", { timeout: 60_000 }, async t => {
  let extracted = 0;
  const text = "本项目以后统一用 pnpm 安装依赖";
  const f = await codingProductHost(t, request => {
    const data = formation(request); if (!data) return cogniaModelResponse("已读。"); extracted++;
    const slot = data.destinations.find(item => item.scope === "project" && !item.replacement)?.slots.convention?.[0]; assert.ok(slot);
    return cogniaModelResponse(JSON.stringify({ drafts: [{ slot_id: slot, text, suggested_basis: "explicit", evidence: data.sources.map(source => ({ source_id: source.id, quote: source.text })) }] }));
  });
  assert.equal((await f.call(f.project.project_id, "/api/memory/prefs", { scope: "project", preset: "assisted" })).status, 200);
  const a = await round(f, text); assert.equal((await settled(f, (await queued(f, a.ref)).key)).state, "done");
  const first = await f.call<{ items: unknown[] }>(f.project.project_id, "/api/memory/overview?scope=project"); assert.equal(first.body.items.length, 0);
  const b = await round(f, text); assert.equal((await settled(f, (await queued(f, b.ref)).key)).state, "done");
  const after = await f.call<{ items: Array<{ text: string; source: string; basis: string; approved_by: { by: string; policy: string; version: number } }> }>(f.project.project_id, "/api/memory/overview?scope=project");
  assert.equal(extracted, 2); assert.equal(after.body.items.length, 1);
  assert.equal(after.body.items[0]!.text, text); assert.equal(after.body.items[0]!.source, "auto"); assert.equal(after.body.items[0]!.basis, "repeated");
  assert.deepEqual(after.body.items[0]!.approved_by, { by: "policy", policy: "memory.write-gate", version: 1 });
});

test("MEM-V0-C2 SDK candidate success followed by App projection failure retries the same operation and records one candidate", { timeout: 60_000 }, async t => {
  let extracted = 0;
  const text = "本项目以后统一用 pnpm 安装依赖";
  const f = await codingProductHost(t, request => {
    const data = formation(request); if (!data) return cogniaModelResponse("已读。"); extracted++;
    const slot = data.destinations.find(item => item.scope === "project" && !item.replacement)?.slots.convention?.[0]; assert.ok(slot);
    return cogniaModelResponse(JSON.stringify({ drafts: [{ slot_id: slot, text, suggested_basis: "explicit", evidence: data.sources.map(source => ({ source_id: source.id, quote: source.text })) }] }));
  });
  const system = ensureSystemAgentService(f.host, f.home); await system.ready;
  const memory = system.agentHost.adapter("prologue").memory!, withCaller = memory.withCaller.bind(memory);
  let committed = false, failProjection = true, canonical: { candidate_id: string; version: number } | undefined;
  const operations: string[] = [];
  const observe = (capability: AgentMemoryCapability): AgentMemoryCapability => ({ ...capability,
    candidates: { ...capability.candidates,
      form: async input => { operations.push(input.operation_id); const result = await capability.candidates.form(input);
        canonical ??= result.items.find(item => item.candidate)?.candidate; committed = !!canonical; return result; },
      get: async input => {
        const entry = await capability.candidates.get(input);
        if (committed && failProjection) {
          failProjection = false; assert.ok(entry); assert.equal(entry.candidate_id, canonical!.candidate_id);
          const before = await f.call<{ candidates: unknown[] }>(f.project.project_id, "/api/memory/overview?scope=project");
          assert.equal(before.body.candidates.length, 0, "SDK has committed; App ledger has not yet recorded this candidate");
          throw new Error("controlled canonical receipt readback failure before ledger projection");
        }
        return entry;
      },
    }, withCaller: caller => observe(capability.withCaller(caller)),
    ...(capability.withExecution ? { withExecution: control => observe(capability.withExecution!(control)) } : {}),
  });
  t.mock.method(memory, "withCaller", caller => observe(withCaller(caller)));
  const work = await round(f, text), task = await queued(f, work.ref), result = await settled(f, task.key);
  assert.equal(result.state, "done", JSON.stringify(result)); assert.equal(result.runs, 2); assert.equal(extracted, 2, "the original bounded form retry makes another real extraction; it does not promise exactly-once model calls");
  assert.equal(operations.length, 2); assert.equal(new Set(operations).size, 1, "retry keeps the original SDK formation operation");
  const after = await f.call<{ candidates: Array<{ candidate_id: string; version: number }> }>(f.project.project_id, "/api/memory/overview?scope=project");
  assert.equal(after.body.candidates.length, 1); assert.equal(after.body.candidates[0]!.candidate_id, canonical!.candidate_id); assert.equal(after.body.candidates[0]!.version, canonical!.version);
  const entries = await memory.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: f.project.project_id, consumer: "ui", person: true, current_scene: "coding", purpose: "management" }).candidates.list("project", f.project.project_id);
  assert.equal(entries.length, 1); assert.equal(entries[0]!.sources?.length, 1, "projection recovery cannot manufacture a second original");
});

test("MEM-V0-C2 a real Host process interruption after durable running is recovered as reconcile-required without owner replay", { timeout: 60_000 }, async t => {
  const { spawn } = await import("node:child_process"); const { fileURLToPath } = await import("node:url");
  let extracted = 0;
  const f = await codingProductHost(t, request => { if (formation(request)) extracted++; return cogniaModelResponse("已读。"); });
  const service = ensureSystemAgentService(f.host, f.home); await service.ready;
  const schedule = service.agentHost.adapter("prologue").schedule!, enqueue = schedule.enqueue.bind(schedule);
  t.mock.method(schedule, "enqueue", (input, control) => enqueue({ ...input, ...(input.kind === "memory.learn" ? { due_at: new Date(Date.now() + 10_000).toISOString() } : {}) }, control));
  const work = await round(f, "本项目以后统一用 pnpm 安装依赖"), task = await queued(f, work.ref); assert.equal(task.state, "queued");
  await f.host.close();
  const child = spawn(process.execPath, [fileURLToPath(new URL("./fixtures/coding-memory-running-crash.mjs", import.meta.url)), f.home, f.project.project_id, task.key], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let stdout = "", stderr = ""; child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
  const exit = await new Promise<number | null>((resolve, reject) => { child.on("exit", resolve); child.on("error", reject); });
  assert.equal(exit, 0, stderr); assert.match(stdout, /running-durable/);
  const { MolisWorkLocalHost } = await import("@molis-ai/molis-work-app-local-host");
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const reopened = new MolisWorkLocalHost({ homeDirectory: f.home });
  try {
    const catalog = reopened.configurePersonalPlanning(f.home, withMolisWorkProjectCatalog);
    const next = ensureSystemAgentService(reopened, f.home, catalog); await next.ready;
    const recovered = next.agentHost.adapter("prologue").schedule!.find(task.key); assert.ok(recovered);
    assert.equal(recovered.state, "reconcile-required"); assert.equal(recovered.runs, 1); assert.equal(extracted, 0);
    assert.equal(next.agentHost.adapter("prologue").schedule!.find(task.key)!.state, "reconcile-required", "no automatic owner attempt is dispatched during normal startup");
  } finally { await reopened.close(); }
});


test("MEM-V0-A4-L an unrelated canonical Session archive leaves the real two-source Coding formation and ledger intact", { timeout: 60_000 }, async t => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); t.after(() => release.resolve());
  const text = "本项目以后统一用 pnpm 安装依赖"; let extracted = 0;
  const f = await codingProductHost(t, async request => {
    const data = formation(request); if (!data) return cogniaModelResponse("已读。");
    if (++extracted === 2) { assert.equal(data.sources.length, 2); entered.resolve(); await release.promise; }
    const slot = data.destinations.find(item => item.scope === "project" && !item.replacement)?.slots.convention?.[0]; assert.ok(slot);
    return cogniaModelResponse(JSON.stringify({ drafts: [{ slot_id: slot, text, suggested_basis: "explicit", evidence: data.sources.map(source => ({ source_id: source.id, quote: source.text })) }] }));
  });
  const a = await round(f, text); assert.equal((await settled(f, (await queued(f, a.ref)).key)).state, "done");
  const b = await round(f, text), task = await queued(f, b.ref); await entered.promise;
  const adapter = ensureSystemAgentService(f.host, f.home).agentHost.adapter("prologue"), original = await adapter.readSession({ runtime_id: "prologue", session_id: a.ref.session_id });
  const c = await adapter.createSession({ ...original.owner, title: "Unrelated Session", workspace: "none" });
  assert.equal((await adapter.sessionLifecycle!.archive(c)).state, "archived"); release.resolve();
  assert.equal((await settled(f, task.key)).state, "done"); assert.equal(extracted, 2);
  const entries = await adapter.memory!.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, consumer: "ui", project_id: f.project.project_id, person: true, current_scene: "coding", purpose: "management" }).candidates.list("project", f.project.project_id);
  assert.equal(entries.length, 2, "both source-confirmed canonical candidates are durable");
  const overview = await f.call<{ candidates: Array<{ candidate_id: string }> }>(f.project.project_id, "/api/memory/overview?scope=project");
  assert.equal(overview.body.candidates.length, 2, "unrelated Session writes do not suppress actual App ledger registration");
});
