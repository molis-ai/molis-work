import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs, { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createPrologueNodeAdapter, openPrologueMemoryAdoption, openPrologueMemoryAdoptionInspection, type PrologueMemoryAdoptionInput, type PrologueSessionPurgeTarget } from "@molis-ai/molis-work-service-agent-host";
import { memoryRuntimePolicy } from "@molis-ai/molis-work-app-local-host";

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
const app = { appId: "io.molis.work", appVersion: "1.0.0" };
const owner = { project_id: "project", plugin_id: "plugin", install_id: "installation", actor_id: "person" };
const kind = `molis-agent-index-${createHash("sha256").update(app.appId).digest("hex").slice(0, 24)}`;
const privateText = "PRIVATE original input task title review extra";
const ref = (id: string) => ({ kind: "session" as const, id, revision: 1 });
function bytes(root: string): Record<string, Buffer> {
  const result: Record<string, Buffer> = {};
  const visit = (directory: string, relative = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const key = join(relative, entry.name), path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path, key); else result[key] = readFileSync(path);
    }
  };
  visit(root); return result;
}

async function fixture(t: TestContext) {
  const storageRoot = fs.realpathSync(mkdtempSync(join(tmpdir(), "molis-cold-session-")));
  const host = createNodeHost({ storageRoot });
  const server = createServer(async (request, response) => {
    for await (const _ of request) { /* Real local request. */ }
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end('data: {"choices":[{"index":0,"delta":{"content":"Finished."},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const adapter = await createPrologueNodeAdapter({ app, storageRoot, resolveCredential: () => "test-only",
    modelConfiguration: async () => ({ protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`, model: "fixture", credential_ref: "fixture" }) });
  t.after(async () => { await adapter.close(); await host.storage.close?.(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(storageRoot, { recursive: true, force: true }); });
  const session = await adapter.createSession({ ...owner, workspace: "none", role_id: "reader", title: privateText });
  const other = await adapter.createSession({ ...owner, workspace: "none", role_id: "reader", title: privateText });
  const run = await adapter.start({ ...owner, session, workspace: "none", role_id: "reader", task: privateText,
    original_input: { input_id: "original", text: privateText, written_by: "person", occurred_at: "2026-10-25T00:00:00Z" },
    role: { role_id: "reader", version: 1, workspace: "none", execution: "read-only", host_tools: [], prompts: [] } });
  const deadline = Date.now() + 10_000;
  for (;;) {
    const state = await adapter.read(run.ref);
    if (["completed", "failed", "cancelled", "stopped"].includes(state.phase)) { assert.equal(state.phase, "completed", state.stop_reason); break; }
    assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 10));
  }
  const preview = await adapter.sessionLifecycle!.previewPurge(session, owner);
  await adapter.close();
  t.mock.method(globalThis, "fetch", async () => { assert.fail("cold maintenance must never send network requests"); });
  const target: PrologueSessionPurgeTarget = { session, owner, decision: { operation_id: "fixed-target", expected_version: preview.version, expected_state: preview.state }, preview };
  const input = { storageRoot, appVersion: app.appVersion, scopes: [{ scope: "user" as const, owner: owner.actor_id }], policy: memoryRuntimePolicy(() => undefined).policy };
  const readIndex = async (id = session.session_id) => { const data = await host.storage.readSecure({ kind, id }); try { return JSON.parse(new TextDecoder().decode(data)); } finally { data.fill(0); } };
  const writeIndex = async (value: unknown, id = session.session_id) => {
    const record = await host.storage.get({ kind, id }); assert.ok(record);
    const data = new TextEncoder().encode(JSON.stringify(value));
    try { await host.storage.commit({ kind, id, expectedVersion: record.version, metadata: record.metadata, secureBody: data }); } finally { data.fill(0); }
  };
  const original = await readIndex();
  await writeIndex({ ...original, extra: privateText, owner: { ...original.owner, extra: privateText }, ref: { ...original.ref, extra: privateText }, review_decisions: { secret: privateText } });
  const files = bytes(storageRoot), indexFile = Object.keys(files).find(path => path.endsWith(`/${session.session_id}.json`) && path.includes(kind)); assert.ok(indexFile);
  const sdkFile = Object.keys(files).find(path => path.endsWith(`/${session.session_id}.json`) && path !== indexFile); assert.ok(sdkFile);
  return { storageRoot, host, target, session, other, run, input, readIndex, writeIndex, indexFile: join(storageRoot, indexFile), sdkFile: join(storageRoot, sdkFile),
    records: () => bytes(join(storageRoot, "records")),
    sdkRoot: () => host.storage.get({ kind: `${app.appId}~sessions`, id: session.session_id }),
    open: (extra: Partial<PrologueMemoryAdoptionInput> = {}) => openPrologueMemoryAdoption({ ...input, sessionPurges: [target], ...extra }),
  };
}

// MEM-40: real fixed target, original SDK child and Index private fields, no ordinary Runtime startup.
test("cold purge completes the original target and keeps unselected persistent bytes unchanged", async t => {
  const f = await fixture(t), before = f.records();
  const inspection = await openPrologueMemoryAdoptionInspection(f.input);
  const observed = await inspection.inspectSession({ ref: ref(f.session.session_id) });
  assert.equal(observed.state, "present"); assert.equal(JSON.stringify(observed).includes(privateText), false);
  await inspection.close(); assert.deepEqual(f.records(), before);
  const writer = await f.open();
  try {
    await assert.rejects(f.open());
    await assert.rejects(createPrologueNodeAdapter({ app, storageRoot: f.storageRoot, modelConfiguration: async () => { throw new Error("no model"); } }));
    await assert.rejects(writer.purgeSessionTarget({ session: f.other }));
    const receipt = await writer.purgeSessionTarget({ session: f.session });
    assert.equal(receipt.state, "purged"); assert.equal(receipt.version, f.target.preview.version + 2);
    const after = f.records(); assert.deepEqual(await writer.purgeSessionTarget({ session: f.session }), receipt); assert.deepEqual(f.records(), after);
    const value = await f.readIndex();
    assert.deepEqual(Object.keys(value).sort(), ["attempts", "lifecycle", "owner", "ref", "schema", "title"]);
    assert.deepEqual(value.owner, owner); assert.deepEqual(value.ref, ref(f.session.session_id));
    assert.equal(value.title, ""); assert.deepEqual(value.attempts, []); assert.equal(JSON.stringify(value).includes(privateText), false);
    assert.equal((await f.sdkRoot()).metadata.purge.phase, "complete");
    assert.equal(await f.host.storage.get({ kind: `${app.appId}~runs`, id: `${f.session.session_id}.${f.run.ref.run_id}` }), undefined);
    for (const [path, data] of Object.entries(before)) if (!path.includes(f.session.session_id)) assert.deepEqual(after[path], data, `unselected record ${path}`);
  } finally { await writer.close(); }
});

for (const stage of ["before-prepared", "prepared", "sdk-cleaning", "sdk-complete", "index-sdk-complete", "complete"] as const)
  test(`cold original decision recovers real durable interruption at ${stage}`, async t => {
    const f = await fixture(t), original = await f.readIndex(), before = f.records();
    const rename = fs.renameSync; let indexWrites = 0, hit = false;
    const hook = t.mock.method(fs, "renameSync", (...args: Parameters<typeof fs.renameSync>) => {
      const destination = String(args[1]), isIndex = destination === f.indexFile, isSdk = destination === f.sdkFile;
      if (isIndex) indexWrites++;
      const envelope = isSdk ? JSON.parse(readFileSync(args[0], "utf8")) : undefined;
      const selected = stage === "before-prepared" ? isIndex && indexWrites === 1
        : stage === "prepared" ? isIndex && indexWrites === 1
        : stage === "index-sdk-complete" ? isIndex && indexWrites === 2
        : stage === "complete" ? isIndex && indexWrites === 3
        : isSdk && envelope.metadata?.purge?.phase === (stage === "sdk-cleaning" ? "cleaning" : "complete");
      if (selected && !hit) { hit = true; if (stage !== "before-prepared") rename(...args); throw new Error("injected durable interruption"); }
      return rename(...args);
    });
    syncBuiltinESMExports();
    const writer = await f.open();
    try { await assert.rejects(writer.purgeSessionTarget({ session: f.session })); }
    finally { hook.mock.restore(); syncBuiltinESMExports(); await writer.close(); }
    assert.equal(hit, true);
    const held = await f.readIndex(), sdk = await f.sdkRoot();
    if (stage === "before-prepared" || stage === "prepared") assert.equal(sdk.metadata.state, "active");
    else { assert.equal(sdk.metadata.state, "purged"); assert.equal(sdk.metadata.purge.phase, stage === "sdk-cleaning" ? "cleaning" : "complete"); assert.equal(sdk.hasSecureBody, false); }
    const child = await f.host.storage.get({ kind: `${app.appId}~runs`, id: `${f.session.session_id}.${f.run.ref.run_id}` });
    if (["before-prepared", "prepared", "sdk-cleaning"].includes(stage)) assert.ok(child, "before SDK cleanup the original Run remains durable");
    else assert.equal(child, undefined, "SDK complete has physically removed the original Run");
    if (stage === "before-prepared") { assert.deepEqual(held, original); assert.deepEqual(f.records(), before); }
    else {
      assert.deepEqual(held.lifecycle.decision, f.target.decision);
      assert.equal(held.lifecycle.phase, stage === "complete" ? "complete" : stage === "index-sdk-complete" ? "sdk-complete" : "prepared");
      if (stage !== "complete") assert.deepEqual(held.attempts, original.attempts);
      const unchanged = f.records();
      for (const change of [{ decision: { ...f.target.decision, operation_id: "replacement" } }, { owner: { ...owner, actor_id: "other" } }, { preview: { ...f.target.preview, resources: f.target.preview.resources + 1 } }]) {
        const wrong = await f.open({ sessionPurges: [{ ...f.target, ...change }] });
        try { await assert.rejects(wrong.purgeSessionTarget({ session: f.session })); } finally { await wrong.close(); }
        assert.deepEqual(f.records(), unchanged);
      }
    }
    const reopened = await f.open();
    try {
      const beforeRetry = f.records();
      const result = await reopened.purgeSessionTarget({ session: f.session });
      assert.equal(result.state, "purged"); assert.equal((await f.readIndex()).lifecycle.phase, "complete");
      assert.equal(JSON.stringify(await f.readIndex()).includes(privateText), false);
      if (stage === "complete") assert.deepEqual(f.records(), beforeRetry);
      const done = f.records(); await reopened.purgeSessionTarget({ session: f.session }); assert.deepEqual(f.records(), done);
    } finally { await reopened.close(); }
  });

for (const cause of ["cancel", "revoke", "close"] as const)
  test(`factory ${cause} after prepared stops all later writes and same tuple recovers`, async t => {
    const f = await fixture(t), controller = new AbortController(); let allowed = true, armed = false, closing: Promise<void> | undefined;
    const writer = await f.open({ signal: controller.signal, assertCurrent: () => { if (!allowed) throw new Error("revoked"); } });
    const rename = fs.renameSync;
    const hook = t.mock.method(fs, "renameSync", (...args: Parameters<typeof fs.renameSync>) => {
      rename(...args);
      if (!armed && String(args[1]) === f.indexFile) { armed = true; if (cause === "cancel") controller.abort(); else if (cause === "revoke") allowed = false; else closing = writer.close(); }
    });
    syncBuiltinESMExports();
    try { await assert.rejects(writer.purgeSessionTarget({ session: f.session })); }
    finally { hook.mock.restore(); syncBuiltinESMExports(); await (closing ?? writer.close()); }
    assert.equal(armed, true); assert.equal((await f.readIndex()).lifecycle.phase, "prepared"); assert.equal((await f.sdkRoot()).metadata.state, "active");
    const before = f.records(); await assert.rejects(writer.purgeSessionTarget({ session: f.session })); assert.deepEqual(f.records(), before);
    const retry = await f.open(); try { assert.equal((await retry.purgeSessionTarget({ session: f.session })).state, "purged"); } finally { await retry.close(); }
  });

test("same Session calls contend on the real hold; caller mutations cannot replace the fixed tuple", async t => {
  const f = await fixture(t), plan = structuredClone(f.target);
  const writer = await f.open({ sessionPurges: [plan] });
  plan.owner.actor_id = "replacement"; plan.decision.operation_id = "replacement"; plan.preview.resources++;
  try {
    const first = writer.purgeSessionTarget({ session: f.session });
    await assert.rejects(writer.purgeSessionTarget({ session: f.session }));
    const result = await first; assert.equal(result.operation_id, f.target.decision.operation_id);
    assert.deepEqual((await f.readIndex()).owner, owner);
  } finally { await writer.close(); }
});

for (const cause of ["missing-index", "tombstone-index", "unknown-actor", "bad-index", "absent-sdk", "changed-sdk", "opposite-decision", "raw-purged"] as const)
  test(`cold preflight refuses ${cause} before preparing or deleting`, async t => {
    const f = await fixture(t);
    if (cause === "missing-index" || cause === "tombstone-index") {
      const record = await f.host.storage.get({ kind, id: f.session.session_id });
      await f.host.storage.remove({ kind, id: f.session.session_id, expectedVersion: record.version });
      if (cause === "missing-index") await f.host.storage.purge({ kind, id: f.session.session_id });
    } else if (cause === "unknown-actor") { const row = await f.readIndex(); delete row.owner.actor_id; await f.writeIndex(row); }
    else if (cause === "bad-index") await f.writeIndex({ schema: 1 });
    else if (cause === "opposite-decision") {
      const row = await f.readIndex(); row.lifecycle = { action: "archive", phase: "prepared", decision: f.target.decision }; await f.writeIndex(row);
    } else {
      const storageKind = `${app.appId}~sessions`, record = await f.sdkRoot();
      if (cause === "absent-sdk") { await f.host.storage.remove({ kind: storageKind, id: f.session.session_id, expectedVersion: record.version }); await f.host.storage.purge({ kind: storageKind, id: f.session.session_id }); }
      else if (cause === "changed-sdk") {
        const body = await f.host.storage.readSecure({ kind: storageKind, id: f.session.session_id });
        try { await f.host.storage.commit({ kind: storageKind, id: f.session.session_id, expectedVersion: record.version, metadata: record.metadata, secureBody: body }); } finally { body.fill(0); }
      } else await f.host.storage.commit({ kind: storageKind, id: f.session.session_id, expectedVersion: record.version, metadata: { ...record.metadata, state: "purged" } });
    }
    const before = f.records(), writer = await f.open();
    try { await assert.rejects(writer.purgeSessionTarget({ session: f.session })); } finally { await writer.close(); }
    assert.deepEqual(f.records(), before);
  });

test("selected cold purge does not recover unselected dispatching board, wait, or overdue queue", async t => {
  const f = await fixture(t), runtime = await createRuntime({ app, host: createNodeHost({ storageRoot: f.storageRoot }), config: { waits: { autoContinue: false } } });
  let dueAt = 0;
  try {
    const sessionRef = ref(f.other.session_id);
    const board = await runtime.boards.admit({ nodes: ["unselected", "waiting", "blocker"].map(id => ({ id, title: privateText, dependsOn: [], onFailure: "block-for-human", assignee: sessionRef })) });
    const attempted = await runtime.boards.beginAttempt({ ref: board.ref, expectedVersion: board.version, nodeId: "unselected", attempt: { session: sessionRef, requestKey: "retain-dispatch" }, atMs: Date.now() });
    assert.equal(attempted.nodes[0].attempts[0].state, "dispatching");
    await runtime.boards.transition({ ref: board.ref, nodeId: "waiting", to: "running" });
    const { wait } = await runtime.waits.arm({ session: sessionRef, by: "app", reason: privateText, arrangement: {
      scope: { board: board.ref.id, node: "waiting", generation: 1 }, on: [{ kind: "node", board: board.ref.id, node: "blocker" }],
      mode: "all", until: "success", onFailure: "block", onEarlyContinue: "keep", deadlineMs: Date.now() + 60_000, autoContinue: false, afterwards: "end-step",
    } }, Date.now());
    assert.ok(wait.ref.id);
    dueAt = Date.now() + 200;
    const queued = await runtime.queue.enqueue({ key: "unselected-cold-queue", sessionRef, work: { kind: "no-executor", payload: { text: privateText } }, dueAtMs: dueAt, maxAttempts: 1 });
    assert.equal(queued.state, "queued");
  } finally { await runtime.shutdown(); }
  await new Promise(resolve => setTimeout(resolve, Math.max(0, dueAt - Date.now()) + 20));
  const before = f.records(), writer = await f.open();
  try { await writer.purgeSessionTarget({ session: f.session }); } finally { await writer.close(); }
  const after = f.records();
  for (const [path, data] of Object.entries(before)) if (!path.includes(f.session.session_id)) assert.deepEqual(after[path], data, `unselected record ${path}`);
});

for (const cause of ["cancel", "revoke", "index-conflict"] as const)
  test(`owner-held canonical read detects ${cause} before the prepared CAS`, async t => {
    const f = await fixture(t), controller = new AbortController(); let allowed = true, hit = false, external: Promise<unknown> | undefined;
    const before = f.records(), indexRecord = await f.host.storage.get({ kind, id: f.session.session_id }), original = await f.readIndex();
    const data = new TextEncoder().encode(JSON.stringify({ ...original, title: "external-current-index" }));
    const writer = await f.open({ signal: controller.signal, assertCurrent: () => { if (!allowed) throw new Error("revoked at canonical read"); } });
    const identity = fs.statSync(f.sdkFile, { bigint: true }), read = fs.readFileSync;
    const hook = t.mock.method(fs, "readFileSync", (...args: Parameters<typeof fs.readFileSync>) => {
      const result = read(...args), held = typeof args[0] === "number" ? fs.fstatSync(args[0], { bigint: true }) : undefined;
      if (!hit && held?.dev === identity.dev && held?.ino === identity.ino) {
        hit = true;
        if (cause === "index-conflict") external = f.host.storage.commit({ kind, id: f.session.session_id, expectedVersion: indexRecord.version, metadata: indexRecord.metadata, secureBody: data });
        else queueMicrotask(() => { if (cause === "cancel") controller.abort(); else allowed = false; });
      }
      return result;
    });
    syncBuiltinESMExports();
    try { await assert.rejects(writer.purgeSessionTarget({ session: f.session })); }
    finally { hook.mock.restore(); syncBuiltinESMExports(); await writer.close(); await external; data.fill(0); }
    assert.equal(hit, true); assert.equal((await f.readIndex()).lifecycle, undefined); assert.equal((await f.sdkRoot()).metadata.state, "active");
    if (cause !== "index-conflict") assert.deepEqual(f.records(), before);
    else {
      assert.equal((await f.readIndex()).title, "external-current-index");
      const after = f.records(); for (const [path, content] of Object.entries(before)) if (!path.includes(kind)) assert.deepEqual(after[path], content);
    }
  });

/** A real later T1 copy: its archived/purged SDK version must never become the T0 target CAS. */
async function laterSource(t: TestContext, f: Awaited<ReturnType<typeof fixture>>) {
  const storageRoot = fs.realpathSync(mkdtempSync(join(tmpdir(), "molis-session-source-")));
  fs.cpSync(f.storageRoot, storageRoot, { recursive: true });
  t.after(() => rmSync(storageRoot, { recursive: true, force: true }));
  const source = await createPrologueNodeAdapter({ app, storageRoot,
    modelConfiguration: async () => { throw new Error("source fixture must not call a model"); } });
  try {
    await source.sessionLifecycle!.archive(f.session, { operation_id: "later-source-archive", expected_version: f.target.preview.version, expected_state: "active" }, owner);
    const preview = await source.sessionLifecycle!.previewPurge(f.session, owner);
    await source.sessionLifecycle!.purge(f.session, { operation_id: "source-purge", expected_version: preview.version, expected_state: preview.state }, preview, owner);
  } finally { await source.close(); }
  const reader = await openPrologueMemoryAdoptionInspection({ ...f.input, storageRoot });
  try {
    const observed = await reader.inspectSession({ ref: ref(f.session.session_id) }); assert.equal(observed.state, "purged");
    if (observed.state !== "purged") throw new Error("real source termination absent");
    const index = (await reader.inspectSessionIndexes({})).facts.find(value => value.sessionRef.id === f.session.session_id);
    assert.deepEqual(index?.owner, owner); assert.equal(index?.lifecycle?.phase, "complete");
    const { preview, phase, version } = observed.termination;
    return { session: structuredClone(f.session), owner: structuredClone(owner), termination: { phase, version,
      preview: { session: structuredClone(f.session), version: preview.atVersion, runs: preview.runs, resources: preview.resources, destroys_key: preview.destroysKey } } };
  } finally { await reader.close(); }
}

test("standalone preparation reads real target CAS, isolates inputs, and original proof rejects retained body and successors", async t => {
  const f = await fixture(t), source = await laterSource(t, f), before = f.records();
  assert.notEqual(source.termination.preview.version, f.target.preview.version);
  const reader = await openPrologueMemoryAdoptionInspection(f.input);
  const request = { source, operationId: "first-target-original" };
  const preparing = reader.prepareSessionPurge(request);
  request.source.owner.actor_id = "caller-mutation"; request.source.session.session_id = "caller-mutation"; request.operationId = "caller-mutation";
  const target = await preparing;
  assert.deepEqual(target, { ...f.target, decision: { ...f.target.decision, operation_id: "first-target-original" } });
  assert.deepEqual(f.records(), before); await assert.rejects(reader.verifySessionPurge({ target })); await reader.close();
  const writer = await f.open({ sessionPurges: [target] });
  try {
    await writer.purgeSessionTarget({ session: f.session });
    const checking = structuredClone(target), proof = writer.verifySessionPurge({ target: checking });
    checking.decision.operation_id = "caller-mutation"; await proof;
    const complete = await f.readIndex(), done = f.records();
    await assert.rejects(writer.verifySessionPurge({ target: { ...target, decision: { ...target.decision, operation_id: "other-decision" } } }));
    assert.deepEqual(f.records(), done);
    for (const residue of [{ ...complete, title: privateText }, { ...complete, extra: privateText }, { ...complete, owner: { ...complete.owner, extra: privateText } }]) {
      await f.writeIndex(residue); const retained = f.records();
      await assert.rejects(writer.verifySessionPurge({ target })); assert.deepEqual(f.records(), retained);
    }
    await f.writeIndex({ ...complete, owner: { ...complete.owner, actor_id: "later-owner" } });
    const successor = f.records(); await assert.rejects(writer.verifySessionPurge({ target })); assert.deepEqual(f.records(), successor);
  } finally { await writer.close(); }
});

for (const phase of ["prepared", "sdk-complete", "complete"] as const)
  test(`standalone preparation preserves the real target original at ${phase}`, async t => {
    const f = await fixture(t), source = await laterSource(t, f), rename = fs.renameSync; let hit = false;
    const hook = t.mock.method(fs, "renameSync", (...args: Parameters<typeof fs.renameSync>) => {
      const destination = String(args[1]);
      const envelope = destination === f.sdkFile ? JSON.parse(readFileSync(args[0], "utf8")) : undefined;
      const selected = phase === "prepared" ? destination === f.indexFile : phase === "sdk-complete" && envelope?.metadata?.purge?.phase === "complete";
      rename(...args);
      if (selected && !hit) { hit = true; throw new Error("original target interruption"); }
    });
    syncBuiltinESMExports();
    const first = await f.open();
    try {
      if (phase === "complete") await first.purgeSessionTarget({ session: f.session });
      else await assert.rejects(first.purgeSessionTarget({ session: f.session }));
    } finally { hook.mock.restore(); syncBuiltinESMExports(); await first.close(); }
    assert.equal(hit, phase !== "complete");
    const held = await f.readIndex(); assert.equal(held.lifecycle.phase, phase === "complete" ? "complete" : "prepared");
    if (phase === "sdk-complete") assert.equal((await f.sdkRoot()).metadata.purge.phase, "complete");
    const before = f.records(), reader = await openPrologueMemoryAdoptionInspection(f.input);
    const target = await reader.prepareSessionPurge({ source, operationId: "must-not-replace-original" });
    assert.deepEqual(target, f.target);
    if (phase === "complete") await reader.verifySessionPurge({ target });
    else await assert.rejects(reader.verifySessionPurge({ target }));
    await reader.close(); assert.deepEqual(f.records(), before);
    const retry = await f.open({ sessionPurges: [target] });
    try {
      assert.equal((await retry.purgeSessionTarget({ session: f.session })).operation_id, f.target.decision.operation_id);
      await retry.verifySessionPurge({ target });
      if (phase === "complete") assert.deepEqual(f.records(), before);
    } finally { await retry.close(); }
  });

for (const cause of ["wrong-owner", "opposite-decision", "absent-sdk", "absent-index", "unclaimed-terminal"] as const)
  test(`standalone preparation refuses ${cause} without target writes`, async t => {
    const f = await fixture(t), source = await laterSource(t, f);
    if (cause === "wrong-owner") source.owner.actor_id = "untrusted";
    else if (cause === "opposite-decision") {
      const row = await f.readIndex(); row.lifecycle = { action: "archive", phase: "prepared", decision: f.target.decision }; await f.writeIndex(row);
    } else if (cause === "absent-sdk" || cause === "absent-index") {
      const selectedKind = cause === "absent-sdk" ? `${app.appId}~sessions` : kind;
      const record = await f.host.storage.get({ kind: selectedKind, id: f.session.session_id });
      await f.host.storage.remove({ kind: selectedKind, id: f.session.session_id, expectedVersion: record.version });
      await f.host.storage.purge({ kind: selectedKind, id: f.session.session_id });
    } else {
      const runtime = await createRuntime({ app, host: createNodeHost({ storageRoot: f.storageRoot }) });
      try { const session = await runtime.sessions.open(ref(f.session.session_id)); assert.ok(session); await session.purge(await session.previewPurge()); }
      finally { await runtime.shutdown(); }
    }
    const before = f.records(), reader = await openPrologueMemoryAdoptionInspection(f.input);
    try { await assert.rejects(reader.prepareSessionPurge({ source, operationId: "first-target" })); }
    finally { await reader.close(); }
    assert.deepEqual(f.records(), before);
  });

for (const operation of ["prepare", "proof"] as const) for (const cause of ["cancel", "revoke", "index-conflict"] as const)
  test(`standalone ${operation} refuses ${cause} across real SDK reads`, async t => {
    const f = await fixture(t), source = await laterSource(t, f), controller = new AbortController(); let allowed = true, hit = false;
    if (operation === "proof") { const writer = await f.open(); try { await writer.purgeSessionTarget({ session: f.session }); } finally { await writer.close(); } }
    const original = await f.readIndex(), record = await f.host.storage.get({ kind, id: f.session.session_id });
    const data = new TextEncoder().encode(JSON.stringify({ ...original, owner: { ...original.owner, actor_id: "concurrent-owner" } }));
    const before = f.records(), reader = await openPrologueMemoryAdoptionInspection({ ...f.input, assertCurrent: () => { if (!allowed) throw new Error("revoked"); } });
    const identity = fs.statSync(f.sdkFile, { bigint: true }), read = fs.readFileSync; let external: Promise<unknown> | undefined;
    const hook = t.mock.method(fs, "readFileSync", (...args: Parameters<typeof fs.readFileSync>) => {
      const result = read(...args), held = typeof args[0] === "number" ? fs.fstatSync(args[0], { bigint: true }) : undefined;
      if (!hit && held?.dev === identity.dev && held?.ino === identity.ino) {
        hit = true;
        if (cause === "index-conflict") external = f.host.storage.commit({ kind, id: f.session.session_id, expectedVersion: record.version, metadata: record.metadata, secureBody: data });
        else queueMicrotask(() => { if (cause === "cancel") controller.abort(); else allowed = false; });
      }
      return result;
    });
    syncBuiltinESMExports();
    try {
      await assert.rejects(operation === "prepare" ? reader.prepareSessionPurge({ source, operationId: "first-target", signal: controller.signal })
        : reader.verifySessionPurge({ target: f.target, signal: controller.signal }));
    } finally { hook.mock.restore(); syncBuiltinESMExports(); await reader.close(); await external; data.fill(0); }
    assert.equal(hit, true);
    if (cause !== "index-conflict") assert.deepEqual(f.records(), before);
    else {
      assert.equal((await f.readIndex()).owner.actor_id, "concurrent-owner");
      for (const [path, content] of Object.entries(before)) if (!path.includes(kind)) assert.deepEqual(f.records()[path], content);
    }
  });

for (const operation of ["prepare", "proof"] as const)
  test(`standalone ${operation} retains the failed reader for exact close retry and permanently stops business`, async t => {
    const f = await fixture(t), source = await laterSource(t, f);
    if (operation === "proof") { const writer = await f.open(); try { await writer.purgeSessionTarget({ session: f.session }); } finally { await writer.close(); } }
    const before = f.records(), reader = await openPrologueMemoryAdoptionInspection(f.input), fill = Buffer.prototype.fill;
    let failedKey: Buffer | undefined, retries = 0, failing = true;
    const hook = t.mock.method(Buffer.prototype, "fill", function(this: Buffer, ...args: unknown[]) {
      if (this.length === 32 && args[0] === 0 && (failedKey === undefined || this === failedKey)) {
        failedKey ??= this; retries++; if (failing) throw new Error("original reader close failed");
      }
      return Reflect.apply(fill, this, args);
    });
    try {
      await assert.rejects(operation === "prepare" ? reader.prepareSessionPurge({ source, operationId: "first-target" }) : reader.verifySessionPurge({ target: f.target }), /original reader close failed/);
      assert.ok(failedKey); await assert.rejects(reader.inspectSession({ ref: ref(f.session.session_id) }));
      await assert.rejects(reader.close(), /original reader close failed/); assert.equal(retries, 2);
      failing = false; await reader.close(); assert.equal(retries, 3); assert.ok(failedKey.every(byte => byte === 0));
      await reader.close(); assert.equal(retries, 3);
      await assert.rejects(reader.inspectSession({ ref: ref(f.session.session_id) })); assert.deepEqual(f.records(), before);
    } finally { failing = false; await reader.close(); hook.mock.restore(); }
  });
