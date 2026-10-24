import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { PluginPrivateStorage } from "@molis-ai/molis-work-contracts/platform/plugin";
import { DEMO_PROJECT_ID as project } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentSessionLifecycleActions as lifecycle, type AgentSessionDecision, type AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingSdkRuntime } from "./fixtures/coding-sdk-runtime.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { noEffect } from "./fixtures/coding-sessions.js";

type Fixture = Awaited<ReturnType<typeof codingSdkRuntime>>;
type Decision = { mode: "local" } | { mode: "runtime"; binding: AgentSessionRef; decision: AgentSessionDecision };
const path = (id: string) => `/sessions/${id}`;
async function responds<T>(call: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([call, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("the independent call must respond before the held operation is released")), 3000);
  })]); } finally { clearTimeout(timer!); }
}
const owner = (f: Fixture) => ({ project_id: project, plugin_id: "io.molis.work.coding", actor_id: "web-user",
  install_id: f.platform.supervisor.state("io.molis.work.coding")!.install_id! });
async function preview(f: Fixture, id: string): Promise<Decision> {
  const result = await f.call(path(id) + "/archive-preview");
  assert.equal(result?.status, 200, JSON.stringify(result?.body));
  return (result!.body as { archive_decision: Decision }).archive_decision;
}
const archive = (f: Fixture, id: string, archive_decision: Decision, control?: Parameters<Fixture["call"]>[3]) =>
  f.call(path(id), { archive: true, archive_decision }, "PATCH", control);
async function completed(f: Fixture, id: string) {
  const result = await f.call(path(id) + "/runs", { task: "Read this project and give a short explanation.", intent: "discuss", workspace_id: "work", provider_id: "fixture", model_id: "fixture" });
  assert.equal(result?.status, 200, JSON.stringify(result?.body));
  for (const deadline = Date.now() + 15_000; f.sessions.get(project, id).state !== "done";) {
    assert.ok(Date.now() < deadline, "the real Coding follower must finish"); await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(f.sessions.get(project, id).runtime_session_id);
}

test("COD-MEM-ARCH-01 local preview creates no SDK Session; a nonempty runtime archive persists and retries without changing the date", { timeout: 60_000 }, async t => {
  const f = await codingSdkRuntime(t, { hostActions: true });
  t.mock.method(globalThis, "fetch", async () => cogniaModelResponse("The project has been read."));
  await f.create("local");
  const before = f.sessions.get(project, "local"), create = t.mock.method(f.adapter, "createSession", async () => { throw new Error("a local archive must not create an SDK Session"); });
  assert.deepEqual(await preview(f, "local"), { mode: "local" });
  assert.deepEqual(f.sessions.get(project, "local"), before, "cancel after preview leaves the row untouched");
  assert.equal((await archive(f, "local", { mode: "local" }))?.status, 200);
  assert.equal(create.mock.callCount(), 0); create.mock.restore();
  await f.create("runtime"); await completed(f, "runtime");
  const original = await preview(f, "runtime"); assert.equal(original.mode, "runtime");
  const saved = await archive(f, "runtime", original); assert.equal(saved?.status, 200, JSON.stringify(saved?.body));
  const row = f.sessions.get(project, "runtime"); assert.equal(row.archived, true);
  assert.equal(f.sessions.list(project).some(entry => entry.session_id === "runtime"), false);
  assert.equal((await archive(f, "runtime", original))?.status, 200);
  assert.deepEqual(f.sessions.get(project, "runtime"), row, "lost-response retry preserves the original archived date");
  await f.reopenSdk();
  assert.deepEqual(await preview(f, "runtime"), original);
  if (original.mode !== "runtime") throw new Error("expected runtime decision");
  const canonical = await f.adapter.sessionLifecycle!.read(original.binding, owner(f));
  assert.equal(canonical.state, "archived"); assert.equal(canonical.version, original.decision.expected_version + 1);
  // A lawful later owner operation invalidates the old archive; Coding never compensates it away.
  await f.adapter.sessionLifecycle!.unarchive(original.binding, { operation_id: "later-unarchive", expected_version: canonical.version!, expected_state: "archived" }, owner(f));
  assert.ok((await archive(f, "runtime", original))!.status >= 400);
  assert.deepEqual(f.sessions.get(project, "runtime"), row);
});

for (const failure of ["lost-receipt", "business-commit"] as const) test(`COD-MEM-ARCH-03 ${failure} after SDK success is recovered only by explicit original-decision retry after reopening`, { timeout: 60_000 }, async t => {
  let failCommit = false;
  const f = await codingSdkRuntime(t, { hostActions: true, wrapCoding: definition => ({ ...definition, start: context => {
    const database = context.services!.project_database!;
    return definition.start({ ...context, services: { ...context.services, project_database: { ...database,
      transaction: (beforeEffect, write) => {
        if (failCommit) throw new Error("business commit unavailable");
        return database.transaction(beforeEffect, write);
      } } } });
  } }) });
  t.mock.method(globalThis, "fetch", async () => cogniaModelResponse("Read complete."));
  await f.create("recover"); await completed(f, "recover");
  const original = await preview(f, "recover"), before = f.sessions.get(project, "recover");
  const realArchive = f.adapter.sessionLifecycle!.archive.bind(f.adapter.sessionLifecycle);
  const fault = t.mock.method(f.adapter.sessionLifecycle!, "archive", async (...args) => {
    const receipt = await realArchive(...args);
    if (failure === "lost-receipt") throw new Error("response failed after SDK archive, before Coding projection");
    failCommit = true; return receipt;
  });
  assert.ok((await archive(f, "recover", original))!.status >= 400);
  assert.deepEqual(f.sessions.get(project, "recover"), before);
  fault.mock.restore(); failCommit = false; await f.reopenSdk();
  const recovered = await preview(f, "recover");
  assert.deepEqual(recovered, original, "current SDK version must not replace the original decision");
  await f.call(path("recover"));
  assert.deepEqual(f.sessions.get(project, "recover"), before, "ordinary GET and preview never repair the business projection");
  assert.equal((await archive(f, "recover", recovered))?.status, 200);
  assert.equal(f.sessions.get(project, "recover").archived, true);
});

for (const stop of ["cancel", "revoke"] as const) for (const when of ["before-sdk", "after-sdk"] as const) {
  test(`COD-MEM-ARCH-04 ${stop} ${when} refuses later business writes and keeps the actual SDK outcome`, { timeout: 60_000 }, async t => {
    const f = await codingSdkRuntime(t, { hostActions: true });
    t.mock.method(globalThis, "fetch", async () => cogniaModelResponse("Read complete."));
    await f.create("controlled"); await completed(f, "controlled");
    const original = await preview(f, "controlled"); assert.equal(original.mode, "runtime");
    if (original.mode !== "runtime") throw new Error("expected runtime decision");
    const before = f.sessions.get(project, "controlled"), controller = new AbortController(); let allowed = true;
    const current = () => { controller.signal.throwIfAborted(); if (!allowed) throw new ActionError("actions.forbidden", "original owner grant revoked"); };
    const stopCall = () => { if (stop === "cancel") controller.abort(); else allowed = false; };
    const realArchive = f.adapter.sessionLifecycle!.archive.bind(f.adapter.sessionLifecycle), finished = Promise.withResolvers<void>();
    const interception = t.mock.method(f.adapter.sessionLifecycle!, "archive", async (...args) => {
      try {
        if (when === "before-sdk") stopCall();
        const receipt = await realArchive(...args);
        if (when === "after-sdk") stopCall();
        return receipt;
      } finally { finished.resolve(); }
    });
    const result = await archive(f, "controlled", original, { signal: controller.signal, beforeEffect: async () => current(), assert_authority_current: current });
    await finished.promise; assert.ok(result && result.status >= 400);
    assert.deepEqual(f.sessions.get(project, "controlled"), before);
    interception.mock.restore();
    const canonical = await f.adapter.sessionLifecycle!.read(original.binding, owner(f));
    assert.equal(canonical.state, when === "before-sdk" ? "active" : "archived");
    assert.equal((await archive(f, "controlled", original))?.status, 200, "a fresh authorized invocation may resume the same decision");
  });
}

test("COD-MEM-ARCH-02 a prepared send blocks archive, while another local Session can archive", { timeout: 60_000 }, async t => {
  const f = await codingSdkRuntime(t, { hostActions: true });
  t.mock.method(globalThis, "fetch", async () => cogniaModelResponse("Read complete."));
  await f.create("starting"); await f.create("other");
  const original = await preview(f, "starting"), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const realStart = f.adapter.start.bind(f.adapter);
  const hold = t.mock.method(f.adapter, "start", async (...args) => { entered.resolve(); await release.promise; return realStart(...args); });
  const starting = completed(f, "starting");
  try {
    await Promise.race([entered.promise, starting.then(() => { throw new Error("start barrier was not reached"); })]);
    assert.ok((await archive(f, "starting", original))!.status >= 400);
    assert.equal((await archive(f, "other", await preview(f, "other")))?.status, 200);
  } finally { release.resolve(); await starting; hold.mock.restore(); }
  assert.ok((await archive(f, "starting", original))!.status >= 400, "a local confirmation cannot archive a newly established runtime binding");
  assert.equal(f.sessions.get(project, "starting").archived, false);
});

test("COD-MEM-ARCH-05 submitted binding never selects another Session; absent manifest consumption refuses the lifecycle dependency", { timeout: 60_000 }, async t => {
  const f = await codingSdkRuntime(t, { hostActions: true });
  t.mock.method(globalThis, "fetch", async () => cogniaModelResponse("Read complete."));
  await f.create("a"); await f.create("b"); await completed(f, "a"); await completed(f, "b");
  const a = await preview(f, "a"), b = await preview(f, "b");
  assert.ok(a.mode === "runtime" && b.mode === "runtime");
  assert.ok((await archive(f, "a", { ...a, binding: b.binding }))!.status >= 400);
  await f.sessions.setRuntimeSession(noEffect, project, "a", b.binding.session_id, new Date().toISOString());
  assert.ok((await archive(f, "a", a))!.status >= 400);
  assert.equal((await f.adapter.sessionLifecycle!.read(a.binding, owner(f))).state, "active");
  assert.equal((await f.adapter.sessionLifecycle!.read(b.binding, owner(f))).state, "active");
  for (const changed of [{ actor_id: "foreign" }, { project_id: "foreign" }, { install_id: "foreign" }]) {
    await assert.rejects(f.adapter.sessionLifecycle!.archive(a.binding, a.decision, { ...owner(f), ...changed }));
  }
  const foreign = await f.platform.router().dispatch({ method: "PATCH", pathname: "/api/plugins/io.molis.work.coding" + path("b"), actor_id: "foreign",
    body: { archive: true, archive_decision: b } });
  assert.ok(foreign && foreign.status >= 400);
  const missing = await codingSdkRuntime(t, { hostActions: true, wrapCoding: definition => ({ ...definition, manifest: { ...definition.manifest,
    capabilities: { ...definition.manifest.capabilities, consumes: definition.manifest.capabilities!.consumes.filter(id => id !== lifecycle.archive.capability_id) } } }) });
  await missing.create("denied"); await completed(missing, "denied");
  assert.ok((await archive(missing, "denied", await preview(missing, "denied")))!.status >= 400);
  assert.equal(missing.sessions.get(project, "denied").archived, false);
});


for (const stage of ["sdk-archived", "index-sdk-complete"] as const) test(`COD-MEM-ARCH-03 Coding resumes the original decision after ${stage} interrupts the real Index write`, { timeout: 60_000 }, async t => {
  const f = await codingSdkRuntime(t, { hostActions: true });
  t.mock.method(globalThis, "fetch", async () => cogniaModelResponse("Read complete."));
  await f.create("index-recovery"); await completed(f, "index-recovery");
  const original = await preview(f, "index-recovery"); assert.equal(original.mode, "runtime");
  if (original.mode !== "runtime") throw new Error("expected runtime decision");
  // The same public storage Port used by the parent M4 regression; observe only, never fabricate Index or SDK state.
  const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
  const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
  const inspector = createNodeHost({ storageRoot: join(f.home, "sdk") });
  const appId = "io.molis.work.coding-regression-test", id = original.binding.session_id;
  const indexRef = { kind: `molis-agent-index-${createHash("sha256").update(appId).digest("hex").slice(0, 24)}`, id };
  const sdkRef = { kind: `${appId}~sessions`, id };
  const readIndex = async () => {
    const bytes = await inspector.storage.readSecure(indexRef);
    try { return JSON.parse(new TextDecoder().decode(bytes)) as { lifecycle?: { phase: string } }; }
    finally { bytes.fill(0); }
  };
  try {
    const before = f.sessions.get(project, "index-recovery"); let interrupted = false;
    const response = await archive(f, "index-recovery", original, { beforeEffect: async () => {
      const index = await readIndex(), sdk = await inspector.storage.get(sdkRef);
      if (stage === "sdk-archived" ? index.lifecycle?.phase === "prepared" && sdk?.metadata.state === "archived"
        : index.lifecycle?.phase === "sdk-complete") {
        interrupted = true; throw new Error("interrupted original Index commit");
      }
    } });
    assert.equal(interrupted, true, "the exact SDK/Index boundary must be reached");
    assert.ok(response && response.status >= 400);
    assert.deepEqual(f.sessions.get(project, "index-recovery"), before);
    assert.equal((await inspector.storage.get(sdkRef))?.metadata.state, "archived");
    assert.equal((await readIndex()).lifecycle?.phase, stage === "sdk-archived" ? "prepared" : "sdk-complete");
    await f.reopenSdk();
    const storedIndex = await inspector.storage.get(indexRef), storedSdk = await inspector.storage.get(sdkRef);
    const recovered = await preview(f, "index-recovery"); assert.deepEqual(recovered, original);
    await f.call(path("index-recovery"));
    assert.deepEqual(await inspector.storage.get(indexRef), storedIndex, "GET does not complete the interrupted Index operation");
    assert.deepEqual(await inspector.storage.get(sdkRef), storedSdk);
    assert.deepEqual(f.sessions.get(project, "index-recovery"), before);
    assert.equal((await archive(f, "index-recovery", recovered))?.status, 200);
    const view = await f.adapter.sessionLifecycle!.read(original.binding, owner(f));
    assert.equal(view.state, "archived"); assert.equal(view.version, original.decision.expected_version + 1);
    assert.deepEqual(view.operation?.decision, original.decision); assert.equal(view.operation?.completed, true);
    assert.equal(f.sessions.get(project, "index-recovery").archived, true);
  } finally { await inspector.storage.close?.(); }
});

test("a completed lawful unarchive permits a fresh confirmation only while the Coding row is unarchived", { timeout: 60_000 }, async t => {
  const f = await codingSdkRuntime(t, { hostActions: true });
  t.mock.method(globalThis, "fetch", async () => cogniaModelResponse("Read complete."));
  await f.create("new-confirmation"); await completed(f, "new-confirmation");
  const original = await preview(f, "new-confirmation"); assert.ok(original.mode === "runtime");
  const archived = await f.adapter.sessionLifecycle!.archive(original.binding, original.decision, owner(f));
  const active = await f.adapter.sessionLifecycle!.unarchive(original.binding,
    { operation_id: "owner-unarchive", expected_version: archived.version, expected_state: "archived" }, owner(f));
  assert.ok((await archive(f, "new-confirmation", original))!.status >= 400, "old confirmation stays invalid");
  assert.equal(f.sessions.get(project, "new-confirmation").archived, false);
  const fresh = await preview(f, "new-confirmation"); assert.ok(fresh.mode === "runtime");
  assert.notEqual(fresh.decision.operation_id, original.decision.operation_id);
  assert.equal(fresh.decision.expected_version, active.version);
  assert.equal((await archive(f, "new-confirmation", fresh))?.status, 200);
  const current = await f.adapter.sessionLifecycle!.read(fresh.binding, owner(f));
  await f.adapter.sessionLifecycle!.unarchive(fresh.binding,
    { operation_id: "later-owner-unarchive", expected_version: current.version!, expected_state: "archived" }, owner(f));
  assert.ok((await f.call(path("new-confirmation") + "/archive-preview"))!.status >= 400,
    "a stale archived business row is not silently reopened or given a new archive decision");
});

test("concurrent archive leaves another Session editable and refuses every same-Session settings write while waiting", { timeout: 60_000 }, async t => {
  let storage!: PluginPrivateStorage;
  const f = await codingSdkRuntime(t, { hostActions: true, wrapCoding: definition => ({ ...definition, start: context => {
    storage = context.services!.storage!; return definition.start(context);
  } }) });
  t.mock.method(globalThis, "fetch", async () => cogniaModelResponse("Read complete."));
  await f.create("editing"); await f.create("independent"); await completed(f, "editing");
  const original = await preview(f, "editing"), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const realArchive = f.adapter.sessionLifecycle!.archive.bind(f.adapter.sessionLifecycle);
  t.mock.method(f.adapter.sessionLifecycle!, "archive", async (...args) => { entered.resolve(); await release.promise; return realArchive(...args); });
  const writing = archive(f, "editing", original);
  const edits = [
    { title: "Renamed" }, { action_tools: [] },
    { configuration: { intent: "discuss", provider_id: "fixture", model_id: "fixture", workspace_id: "work" } },
    { mcp_sources: [] }, { mcp_tools: [] }, { methods: [] }, { character: null }, { character_skill_ids: [] },
    { question_drafts: {} }, { draft: "New draft" }, { budget: { tokens: 2000 } }, { budget: null }, { materials: [] },
  ];
  const keys = ["actions", "configuration", "mcp-sources", "mcp", "methods", "character", "character-skills", "question-drafts", "draft", "budget", "materials"];
  try {
    await Promise.race([entered.promise, writing.then(() => { throw new Error("archive barrier not reached"); })]);
    const before = f.sessions.get(project, "editing"), values = keys.map(key => storage.get(`${key}:editing`));
    for (const edit of edits) {
      assert.ok((await responds(f.call(path("editing"), edit, "PATCH")))!.status >= 400, JSON.stringify(edit));
      assert.deepEqual(f.sessions.get(project, "editing"), before);
      assert.deepEqual(keys.map(key => storage.get(`${key}:editing`)), values);
      const other = await responds(f.call(path("independent"), edit, "PATCH"));
      assert.equal(other?.status, 200, JSON.stringify(other?.body));
    }
    assert.equal(f.sessions.get(project, "independent").title, "Renamed");
    assert.equal(storage.get("draft:independent"), "New draft");
    assert.equal(storage.get("budget:independent"), null, "budget removal keeps its ordinary semantics");
  } finally { release.resolve(); await writing; }
  assert.equal((await writing)?.status, 200);
});

test("a rename already waiting to commit cannot edit a Session that finishes archiving first", { timeout: 60_000 }, async t => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); let holdNext = false;
  const f = await codingSdkRuntime(t, { hostActions: true, wrapCoding: definition => ({ ...definition, start: context => {
    const database = context.services!.project_database!;
    return definition.start({ ...context, services: { ...context.services, project_database: { ...database,
      transaction: async (beforeEffect, write) => {
        if (holdNext) { holdNext = false; entered.resolve(); await release.promise; }
        return database.transaction(beforeEffect, write);
      } } } });
  } }) });
  await f.create("rename-wait"); const original = await preview(f, "rename-wait");
  holdNext = true;
  const renaming = f.call(path("rename-wait"), { title: "Late title" }, "PATCH");
  let archived;
  try {
    await Promise.race([entered.promise, renaming.then(() => { throw new Error("rename barrier not reached"); })]);
    assert.equal((await responds(archive(f, "rename-wait", original)))?.status, 200);
    archived = f.sessions.get(project, "rename-wait");
  } finally { release.resolve(); }
  assert.ok((await renaming)!.status >= 400);
  assert.deepEqual(f.sessions.get(project, "rename-wait"), archived);
});
