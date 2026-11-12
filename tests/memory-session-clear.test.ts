import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MemoryService, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { memoryServiceHome, originalMemorySources } from "./fixtures/memory-service-home.js";

const person = (operation_id: string): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", consumer: "ui", person: true,
  current_scene: "common", purpose: "management", operation_id });
async function binding(f: Awaited<ReturnType<typeof memoryServiceHome>>, id = "business-a"): Promise<MemoryCaller> {
  const session = await f.adapter().createSession({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", plugin_id: "io.molis.work.coding",
    install_id: "coding", workspace: "none", role_id: "coding", title: id });
  return { ...person(id), session_id: session.session_id, current_scene: "coding", memory_session: {
    session, current_scene: "coding", target: { kind: "coding", id, project_id: "project-a" } } };
}
const scoped = { scope: "personal" as const, owner: LOCAL_PERSON_ACTOR_ID };
const sessionClass: { scenes: string[]; lifecycle: "session" } = { scenes: ["coding"], lifecycle: "session" };

test("Session clear independently inspects disabled, paused and expired fixed identities across scopes, preserving other Session and long-term", async t => {
  let now = new Date("2026-11-05T00:00:00.000Z");
  const f = await memoryServiceHome(t, { projects: ["project-a"], now: () => now }), service = await f.open(), who = await binding(f), other = await binding(f, "other");
  const paused = (await service.write({ ...who, operation_id: "paused" }, { scope: "personal", text: "Paused exact session memory", kind: "preference", classification: sessionClass })).memory!;
  await service.change({ ...who, operation_id: "pause" }, { action: "disable", memory_id: paused.memory_id, expected_version: paused.version });
  const expired = (await service.write({ ...who, operation_id: "expiry" }, { scope: "project", text: "Expired exact project session memory", kind: "preference",
    classification: sessionClass, expires_at: "2026-11-05T01:00:00.000Z" })).memory!;
  const sourcePaused = (await service.write({ ...who, operation_id: "source-paused" }, { scope: "personal", text: "Public pause from a failed original source", kind: "preference", classification: sessionClass })).memory!;
  const rawPaused = await f.raw(who).pause({ ...scoped, memory_id: sourcePaused.memory_id, expected_version: sourcePaused.version, operation_id: "pause-original-source", reason: "original source unavailable" });
  assert.equal(rawPaused.paused?.reason, "original source unavailable");
  for (const operation_id of ["stable-order-a", "stable-order-b", "stable-order-c"]) await service.write({ ...who, operation_id }, { scope: "personal", text: `Another selected canonical identity ${operation_id}`, kind: "preference", classification: sessionClass });
  const keep = (await service.write({ ...other, operation_id: "other" }, { scope: "personal", text: "Other session survives", kind: "preference", classification: sessionClass })).memory!;
  const long = (await service.write(person("long"), { scope: "personal", text: "Unselected long term survives", kind: "preference" })).memory!;
  now = new Date("2026-11-05T02:00:00.000Z");
  const preview = await service.sessionClear.preview(who);
  assert.equal(preview.memory_count, 6); assert.equal(preview.candidate_count, 0); assert.ok(preview.preview_id);
  assert.deepEqual(service.listOperations(who, {}).items, [], "unstarted preview is not a pending operation");
  const result = await service.sessionClear.apply(who, preview.preview_id!);
  assert.equal(result.complete, true, JSON.stringify(result));
  assert.deepEqual(result.items.map(one => one.outcome), Array(6).fill("completed"));
  assert.equal(f.ledger().forgetting.read().decisions.length, 2);
  assert.ok(f.ledger().forgetting.read().decisions.every(one => one.selection_mode === "exact-identities"));
  assert.equal(f.ledger().revisions(paused.memory_id).length, 0); assert.equal(f.ledger().revisions(expired.memory_id).length, 0);
  assert.ok((await f.raw(other).list(scoped.scope, scoped.owner)).some(one => one.memory_id === keep.memory_id));
  assert.ok((await f.raw().list(scoped.scope, scoped.owner)).some(one => one.memory_id === long.memory_id));
  await f.close(); const reopened = await f.open();
  assert.deepEqual(await reopened.sessionClear.apply(who, preview.preview_id!), result);
  assert.deepEqual(reopened.listOperations(who, {}).items, []);
});

test("Session clear requires every group accepted before physical purge and resumes original plan after reopen", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }); const base = await f.open(), who = await binding(f);
  for (const scope of ["personal", "project"] as const) await base.write({ ...who, operation_id: scope }, { scope, text: `Fixed ${scope} identity`, kind: "preference", classification: sessionClass });
  const preview = await base.sessionClear.preview(who), accept = f.ledger().forgetting.accept.bind(f.ledger().forgetting); let count = 0;
  const fault = t.mock.method(f.ledger().forgetting, "accept", (...args: Parameters<typeof accept>) => { if (++count === 2) throw new Error("second durable acceptance interrupted"); return accept(...args); });
  const partial = await base.sessionClear.apply(who, preview.preview_id!); fault.mock.restore();
  assert.equal(partial.complete, false); assert.equal(partial.items.some(one => one.cleanup === "complete"), false);
  assert.equal(f.ledger().forgetting.read().decisions.length, 1);
  for (const scope of ["personal", "project"] as const) assert.equal((await f.raw(who).previewSessionPurge!({ kind: "memory", selection: {
    session_ref: { kind: "session", id: who.session_id!, revision: 1 }, operation_id: preview.preview_id! } })).items.filter(one => one.scope === scope).length, 1);
  const pending = base.listOperations(who, {}); assert.equal(pending.items.length, 1); assert.equal(pending.items[0]!.kind, "session-clear"); assert.equal(pending.items[0]!.forgetting, "unknown");
  await assert.rejects(base.sessionClear.apply({ ...who, memory_session: { ...who.memory_session!, target: { ...who.memory_session!.target, id: "different" } } }, preview.preview_id!), { code: "memory.forbidden" });
  await f.close(); const reopened = await f.open(); assert.equal((await reopened.sessionClear.apply(who, preview.preview_id!)).complete, true);
});

test("Session clear preserves accepted long-term candidate and candidate-only plans are discoverable; unknown durable acceptance is an error", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await f.open(), who = await binding(f);
  const candidate = await service.propose(person("original"), { scope: "personal", text: "Original retained candidate wording", kind: "preference", basis: "inferred", from: "gate", why: "Retained candidate explanation" });
  const accepted = await service.accept(person("accept"), candidate.candidate_id);
  await service.change({ ...who, operation_id: "classify" }, { action: "reclassify", kind: "preference", memory_id: accepted.memory!.memory_id, expected_version: accepted.memory!.version, classification: sessionClass });
  const note = f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === candidate.candidate_id)!;
  const preview = await service.sessionClear.preview(who); assert.equal(preview.memory_count, 1); assert.equal(preview.candidate_count, 0);
  assert.equal((await service.sessionClear.apply(who, preview.preview_id!)).complete, true);
  assert.deepEqual(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === candidate.candidate_id), note);
  assert.ok((await f.raw().candidates.list(scoped.scope, scoped.owner)).some(one => one.candidate_id === candidate.candidate_id));
  const only = await service.propose({ ...who, operation_id: "candidate-only" }, { scope: "personal", text: "Only selected Session candidate", kind: "preference", basis: "inferred", from: "gate", why: "Selected Session candidate explanation" },
    { classificationMeta: { classification: sessionClass, session_ref: { kind: "session", id: who.session_id!, revision: 1 } } });
  const next = await service.sessionClear.preview(who); assert.equal(next.memory_count, 0); assert.equal(next.candidate_count, 1);
  const fail = t.mock.method(f.ledger().forgetting, "accept", () => { throw new Error("known not accepted"); });
  assert.equal((await service.sessionClear.apply(who, next.preview_id!)).complete, false); fail.mock.restore();
  assert.equal(service.listOperations(who, {}).items[0]!.kind, "session-clear");
  const sync = fs.fsyncSync, homeIdentity = fs.lstatSync(f.home); let reached = false;
  const fault = t.mock.method(fs, "fsyncSync", (fd: number) => {
    const identity = fs.fstatSync(fd);
    if (!reached && identity.isDirectory() && identity.ino === homeIdentity.ino) {
      reached = true; sync(fd); throw Object.assign(new Error("independent fact directory sync acknowledgement lost"), { code: "EIO" });
    }
    return sync(fd);
  });
  syncBuiltinESMExports();
  try { await assert.rejects(service.sessionClear.apply(who, next.preview_id!), error => {
    assert.equal((error as { details?: { forgetting?: string } }).details?.forgetting, "unknown"); return true;
  }); } finally { fault.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(reached, true);
  assert.equal((await f.raw(who).previewSessionPurge!({ kind: "memory-candidate", selection: {
    session_ref: { kind: "session", id: who.session_id!, revision: 1 }, operation_id: next.preview_id! } })).items.some(one => one.id === only.candidate_id), true);
  assert.equal((await service.sessionClear.apply(who, next.preview_id!)).complete, true);
  assert.equal(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).some(one => one.candidate_id === only.candidate_id), false);
  assert.deepEqual(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === candidate.candidate_id), note);
});

test("Session clear keeps a known accepted-plan tuple conflict as needs-reconcile without reinterpreting it as unknown durability", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await f.open(), who = await binding(f);
  await service.write({ ...who, operation_id: "mismatch-seed" }, { scope: "personal", text: "Original accepted fixed identity", kind: "preference", classification: sessionClass });
  const preview = await service.sessionClear.preview(who); assert.equal((await service.sessionClear.apply(who, preview.preview_id!)).complete, true);
  const key = "memory-session-clear:" + preview.preview_id, marker = f.ledger().marker(who.actor_id, key)!;
  const plan = structuredClone(marker.body) as { targets: Array<{ version: number }>; groups: Array<{ memories: Array<{ version: number }> }> };
  plan.targets[0]!.version++; plan.groups[0]!.memories[0]!.version++;
  const facts = f.ledger().forgetting.read(); f.ledger().setMarker(who.actor_id, key, plan, marker.at);
  await assert.rejects(service.sessionClear.apply(who, preview.preview_id!), error => {
    assert.equal((error as { code?: string }).code, "memory.conflict");
    assert.equal((error as { details?: { cleanup?: string } }).details?.cleanup, "needs-reconcile"); return true;
  });
  assert.deepEqual(f.ledger().forgetting.read(), facts);
});

for (const failure of ["forbidden", "cancelled"] as const)
test(`Session clear preserves ${failure} after acceptance and does not purge while the original control is gone`, async t => {
  const { ActionError } = await import("@molis-ai/molis-work-contracts/platform/actions");
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), base = await f.open(), who = await binding(f), abort = new AbortController(); let revoked = false;
  const saved = (await base.write({ ...who, operation_id: "control-seed" }, { scope: "personal", text: `Retained until original ${failure} control returns`, kind: "preference", classification: sessionClass })).memory!;
  const service = new MemoryService({ ledger: f.ledger(), backend: f.raw(), beforeEffect() { if (revoked) throw new ActionError("actions.forbidden", "original management authority revoked"); } });
  const preview = await service.sessionClear.preview(who), accept = f.ledger().forgetting.accept.bind(f.ledger().forgetting);
  const fault = t.mock.method(f.ledger().forgetting, "accept", (...args: Parameters<typeof accept>) => { const result = accept(...args);
    if (failure === "forbidden") revoked = true; else abort.abort(new Error("original request cancelled")); return result; });
  try { await assert.rejects(service.sessionClear.apply({ ...who, signal: abort.signal }, preview.preview_id!), error => {
    if (failure === "forbidden") assert.equal((error as { code?: string }).code, "actions.forbidden");
    else { assert.equal(abort.signal.aborted, true); assert.equal((error as { details?: { forgetting?: string } }).details?.forgetting, "accepted"); }
    return true;
  }); }
  finally { fault.mock.restore(); }
  assert.equal(f.ledger().forgetting.read().decisions.length, 1);
  const rows = await f.raw(who).previewSessionPurge!({ kind: "memory", selection: { session_ref: { kind: "session", id: who.session_id!, revision: 1 }, operation_id: preview.preview_id! } });
  assert.ok(rows.items.some(one => one.id === saved.memory_id));
  await f.close(); const reopened = await f.open(); assert.equal((await reopened.sessionClear.apply(who, preview.preview_id!)).complete, true);
});

for (const ownerFault of ["original", "missing", "corrupt", "wrong-owner"] as const)
test(`accepted fixed Session clear after public SDK purge validates the real ${ownerFault} original owner`, { timeout: 60_000 }, async t => {
  const { createRequire } = await import("node:module"), { join } = await import("node:path");
  const { codingProductHost } = await import("./fixtures/coding-product-host.js"), { cogniaModelResponse } = await import("./fixtures/cognia-model-response.js");
  const { ensureSystemAgentService, MolisWorkLocalHost, workspaceRefFor } = await import("@molis-ai/molis-work-app-local-host");
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop"), { LocalHostHttpClient } = await import("@molis-ai/molis-work-test-kit/local-host-http");
  const { createSingleHomeTestWebServer } = await import("./fixtures/local-web-core.js");
  const { inspectMemoryForgetting } = await import("@molis-ai/molis-work-storage");
  const f = await codingProductHost(t, () => cogniaModelResponse("已完成。"), { loopbackProvider: true }), project = f.project.project_id, coding = "/api/plugins/io.molis.work.coding";
  const created = await f.call<{ session: { session_id: string } }>(project, coding + "/sessions", { title: "Retained owner purge continuation" });
  const business = created.body.session.session_id, base = `/api/memory/sessions/coding/${business}`;
  const started = await f.call<{ run: { ref: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRunRef } }>(project, coding + `/sessions/${business}/runs`, {
    task: "检查当前目录，不改文件。", intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model" });
  assert.equal(started.status, 200, JSON.stringify(started.body)); await f.ended(started.body.run.ref);
  const saved = await f.call<import("@molis-ai/molis-work-contracts/services/memory").MemoryWriteResult>(project, base + "/items", { scope: "project", text: "Fixed exact identity retained after original Session ends", kind: "preference", classification: { scenes: ["coding"], lifecycle: "session" }, operation_id: crypto.randomUUID() });
  assert.equal(saved.status, 200, JSON.stringify(saved.body)); const memory = saved.body.memory!;
  const preview = await f.call<{ preview_id: string; memory_count: number }>(project, base + "/clear/preview", {}); assert.equal(preview.status, 200, JSON.stringify(preview.body)); assert.equal(preview.body.memory_count, 1);
  const capability = ensureSystemAgentService(f.host, f.home).agentHost.adapter("prologue").memory!, bind = capability.withCaller.bind(capability); let failed = false;
  type Capability = import("@molis-ai/molis-work-contracts/services/agent-host").AgentMemoryCapability;
  const interrupted = (bound: Capability): Capability => ({ ...bound, withExecution: control => { assert.ok(bound.withExecution); return interrupted(bound.withExecution(control)); }, purgeSessionTarget: async () => { failed = true; throw new Error("fixed SDK physical cleanup interrupted"); } });
  const fault = t.mock.method(capability, "withCaller", (...args: Parameters<typeof bind>) => interrupted(bind(...args)));
  const partial = await f.call<{ complete: boolean }>(project, base + "/clear/apply", { preview_id: preview.body.preview_id }); fault.mock.restore();
  assert.equal(partial.status, 200, JSON.stringify(partial.body)); assert.equal(partial.body.complete, false); assert.equal(failed, true);
  assert.ok(inspectMemoryForgetting(f.home).decisions.some(one => one.selection_mode === "exact-identities" && one.memories.some(ref => ref.memory_id === memory.memory_id && ref.version === memory.version)));
  await f.close();
  const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
  const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk")), { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
  const { createHash } = await import("node:crypto");
  const inspector = createNodeHost({ storageRoot: join(f.home, "agent-runtime"), exclusiveOwner: true, memoryStorageFormat: "indexed-v1" }), indexKind = `molis-agent-index-${createHash("sha256").update("io.molis.work").digest("hex").slice(0, 24)}`;
  const indexTarget = { kind: indexKind, id: started.body.run.ref.session_id };
  const originalIndex = await inspector.storage.get(indexTarget); assert.ok(originalIndex);
  const originalIndexBytes: Uint8Array = (await inspector.storage.readSecure(indexTarget)).slice();
  const runtime = await createRuntime({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, host: inspector });
  let memoryRecord: { id: string; version: number } | undefined, memoryBytes: Uint8Array | undefined;
  try {
    const original = await runtime.sessions.open({ kind: "session", id: started.body.run.ref.session_id, revision: 1 }); assert.ok(original);
    const receipt = await runtime.sessions.purge(await original.previewPurge()); assert.equal(receipt.state, "purged");
    assert.equal(await runtime.sessions.open(original.ref), undefined);
    memoryRecord = (await runtime.store.list({ kind: "memories" })).records.find((one: { id: string; version: number; metadata?: { rowId?: string } }) => one.metadata?.rowId === memory.memory_id);
    assert.ok(memoryRecord); memoryBytes = (await runtime.store.readSecure({ kind: "memories", id: memoryRecord.id })).slice();
    if (ownerFault === "missing") { await inspector.storage.remove({ ...indexTarget, expectedVersion: originalIndex.version }); await inspector.storage.purge(indexTarget); }
    if (ownerFault === "corrupt" || ownerFault === "wrong-owner") {
      const index = JSON.parse(new TextDecoder().decode(originalIndexBytes));
      if (ownerFault === "wrong-owner") index.owner.actor_id = "deliberately-wrong-owner";
      await inspector.storage.commit({ ...indexTarget, expectedVersion: originalIndex.version, metadata: originalIndex.metadata,
        secureBody: new TextEncoder().encode(ownerFault === "corrupt" ? "{" : JSON.stringify(index)) });
    }
  } finally { await runtime.shutdown(); }
  const host: InstanceType<typeof MolisWorkLocalHost> = new MolisWorkLocalHost({ homeDirectory: f.home,
    workspacesFor: projectId => withMolisWorkProjectCatalog({ homeDirectory: f.home }, catalog => catalog.listWorkspaceDirectory(projectId)),
    workspaceFor: projectId => withMolisWorkProjectCatalog({ homeDirectory: f.home }, catalog => workspaceRefFor(catalog, projectId)) });
  host.configurePersonalPlanning(f.home, withMolisWorkProjectCatalog);
  // The same single-Home web server as before the restart; the desktop entry would first ask for an account session (#2025), which is not what this checks.
  const token = crypto.randomUUID(), server = createSingleHomeTestWebServer({ homeDirectory: f.home, localHost: host, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); let closed = false;
  const close = async () => { if (closed) return; closed = true; server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); }; t.after(close);
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string"); const web = new LocalHostHttpClient({ origin: `http://127.0.0.1:${address.port}`, controlToken: token }), prefix = `/projects/${project}`;
    const system = ensureSystemAgentService(host, f.home); await system.ready;
    const adapter = system.agentHost.adapter("prologue"), lifecycle = adapter.sessionLifecycle!, ref = { runtime_id: "prologue", session_id: started.body.run.ref.session_id };
    await assert.rejects(lifecycle.read(ref));
    if (ownerFault === "original") assert.ok(await lifecycle.readOwner!(ref));
    let creates = 0, restores = 0;
    const create = adapter.createSession.bind(adapter), restore = lifecycle.unarchive.bind(lifecycle);
    t.mock.method(adapter, "createSession", (...args: Parameters<typeof create>) => { creates++; return create(...args); });
    t.mock.method(lifecycle, "unarchive", (...args: Parameters<typeof restore>) => { restores++; return restore(...args); });
    // Read with the control token, as the calls before the restart do, so a refusal is the purged Session's and not a missing token's.
    const overview = await fetch(web.origin + prefix + base + "/overview?scope=project", { headers: { accept: "application/json", origin: web.origin, "x-molis-work-control-token": token } });
    const overviewBody = await overview.text();
    assert.equal(overview.status, 409, overviewBody);
    assert.deepEqual(JSON.parse(overviewBody), { error: "原执行会话不可核验，请核对原清理操作", code: "memory.conflict", details: { cleanup: "needs-reconcile" } });
    await assert.rejects(web.post(prefix + base + "/items", { scope: "project", text: "Must not revive a purged Session", kind: "preference", classification: { scenes: ["coding"], lifecycle: "session" }, operation_id: crypto.randomUUID() }));
    if (ownerFault === "original") {
      const done = await web.post<{ complete: boolean; items: Array<{ outcome: string; cleanup: string }> }>(prefix + base + "/clear/apply", { preview_id: preview.body.preview_id });
      assert.equal(done.complete, true); assert.deepEqual(done.items.map(one => [one.outcome, one.cleanup]), [["completed", "complete"]]);
    } else {
      const refusal = await fetch(web.origin + prefix + base + "/clear/apply", { method: "POST", headers: { origin: web.origin, "content-type": "application/json",
        "x-molis-work-control-token": token, "x-molis-work-idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ preview_id: preview.body.preview_id }) });
      const error = await refusal.json() as { code: string; details?: { cleanup?: string } };
      assert.notEqual(refusal.status, 200); assert.equal(error.details?.cleanup, "needs-reconcile", JSON.stringify(error));
      if (ownerFault === "wrong-owner") assert.equal(error.code, "memory.forbidden");
    }
    assert.equal(creates, 0); assert.equal(restores, 0); await assert.rejects(lifecycle.read(ref));
  } finally {
    await close();
    if (ownerFault !== "original") {
      const verifier = await createRuntime({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, host: createNodeHost({ storageRoot: join(f.home, "agent-runtime"), exclusiveOwner: true, memoryStorageFormat: "indexed-v1" }) });
      try { assert.ok(memoryRecord); const row = await verifier.store.get({ kind: "memories", id: memoryRecord.id }); assert.equal(row.version, memoryRecord.version);
        assert.deepEqual(await verifier.store.readSecure({ kind: "memories", id: memoryRecord.id }), memoryBytes); }
      finally { await verifier.shutdown(); }
      const restoring = createNodeHost({ storageRoot: join(f.home, "agent-runtime") }), current = await restoring.storage.get(indexTarget);
      await restoring.storage.commit({ ...indexTarget, expectedVersion: current?.version ?? 0, metadata: originalIndex.metadata, secureBody: originalIndexBytes });
      assert.deepEqual(await restoring.storage.readSecure(indexTarget), originalIndexBytes);
    }
  }
});

test("Session view and clear include what was learned in the session: long-term memories and suggestions whose sources name it", async t => {
  const sourceSession = (ref: { event_id: string }) => ref.event_id.startsWith("session:") ? ref.event_id.split(":")[1] : undefined;
  const originals = originalMemorySources(["project-a"]);
  const f = await memoryServiceHome(t, { projects: ["project-a"], sources: originals.port, sourceSession }), service = await f.open(), who = await binding(f);
  const said = originals.add(`session:${who.session_id}:said`, "周报先写风险"), elsewhere = originals.add("session:other:said", "日报写进度");
  const learned = (await service.write(person("learned"), { scope: "personal", text: "周报先写风险", kind: "preference" }, { sources: [said] })).memory!;
  const kept = (await service.write(person("kept"), { scope: "personal", text: "日报写进度", kind: "preference" }, { sources: [elsewhere] })).memory!;
  const suggestion = await service.propose(person("suggested"), { scope: "personal", text: "周报附上下周计划", kind: "preference", basis: "inferred",
    why: "摘自你在这次工作里说的话", from: "extraction" }, { sources: [said] });
  await service.write({ ...who, operation_id: "own" }, { scope: "personal", text: "This session only", kind: "preference", classification: sessionClass });
  const page = await service.page({ ...who, purpose: "management" }, { scope: "personal", limit: 20 });
  assert.deepEqual(page.items.map(item => item.text).sort(), ["This session only", "周报先写风险"].sort());
  assert.deepEqual(page.total, { kind: "exact", value: 2 });
  const preview = await service.sessionClear.preview(who);
  assert.equal(preview.memory_count, 2); assert.equal(preview.candidate_count, 1); assert.ok(preview.preview_id);
  const result = await service.sessionClear.apply(who, preview.preview_id!);
  assert.equal(result.complete, true, JSON.stringify(result));
  const left = (await service.list(person("after"), { scope: "personal" })).items.map(item => item.memory_id);
  assert.ok(!left.includes(learned.memory_id), "the long-term memory learned in this session is forgotten with it");
  assert.ok(left.includes(kept.memory_id), "one learned elsewhere stays");
  assert.ok(!(await service.candidates(person("after-candidates"))).some(item => item.candidate_id === suggestion.candidate_id));
  assert.ok((await service.changes(person("changes"), { scope: "personal" })).some(change => change.memory_id === learned.memory_id && change.kind === "removed"));
});
