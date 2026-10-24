import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { AgentMemoryCaller, AgentMemoryExecutionControl } from "@molis-ai/molis-work-contracts/services/agent-host";
import { createPrologueNodeAdapter, type PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";
import { currentMemoryOptions } from "./fixtures/current-memory.ts";

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
const app = { appId: "io.molis.memory-delete-locator-test", appVersion: "1.0.0" };
const where = { scope: "project", owner: "project-a" } as const;
const caller: AgentMemoryCaller = { actor_id: "alice", project_id: where.owner, consumer: "ui", current_scene: "coding", purpose: "management", person: true };
type Authorize = NonNullable<PrologueNodeAdapterOptions["memory"]>["authorize"];
type Runtime = Awaited<ReturnType<typeof createRuntime>>;
type Host = ReturnType<typeof createNodeHost>;

function bytes(directory: string): Record<string, string> {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? Object.entries(bytes(path)).map(([name, value]) => [`${entry.name}/${name}`, value])
      : [[entry.name, readFileSync(path).toString("base64")]];
  }));
}

async function fixture(t: TestContext, beforeAuthorize?: Authorize) {
  const root = mkdtempSync(join(tmpdir(), "molis-memory-delete-locator-")), storageRoot = join(root, "sdk");
  let revoked = false, deleteOnly = false;
  const actions: string[] = [];
  const options = currentMemoryOptions({ appId: app.appId, scopesFor: () => [where], allowed: () => !revoked,
    beforeAuthorize: async (who, requests) => {
      actions.push(...requests.map(request => request.action));
      return (!deleteOnly || requests.every(request => request.action === "delete"))
        && (!beforeAuthorize || await beforeAuthorize(who, requests));
    } });
  t.mock.method(globalThis, "fetch", async () => { assert.fail("memory deletion must not call a model"); });
  const open = () => createPrologueNodeAdapter({ app, storageRoot, memory: options,
    modelConfiguration: async () => { assert.fail("memory deletion must not resolve a model"); } });
  let adapter = await open();
  t.after(async () => { await adapter.close(); rmSync(root, { recursive: true, force: true }); });
  // A single real storage owner at a time. Only setup/inspection use public SDK APIs;
  // every deletion under test enters through the public AgentHost capability.
  const offline = async <T>(work: (runtime: Runtime, host: Host) => Promise<T>): Promise<T> => {
    await adapter.close();
    const host = createNodeHost({ storageRoot, exclusiveOwner: true });
    const runtime = await createRuntime({ app, host, config: { memory: options.policy }, memoryAuthority: {
      defaultContext: { consumer: "ui", currentScene: "coding", purpose: "management" },
      authorize: (requests: Parameters<Authorize>[1]) => options.authorize(caller, requests),
      authorizeManagement: (request: Parameters<typeof options.authorizeManagement>[1]) => options.authorizeManagement(caller, request),
      authorizeRecall: (request: Parameters<typeof options.authorizeRecall>[1]) => options.authorizeRecall(caller, request),
    } });
    try { return await work(runtime, host); }
    finally { await runtime.shutdown(); adapter = await open(); }
  };
  return { get adapter() { return adapter; }, actions, offline,
    set revoked(value: boolean) { revoked = value; }, set deleteOnly(value: boolean) { deleteOnly = value; },
    memory: (who = caller) => adapter.memory!.withCaller(who),
    bytes: () => bytes(join(storageRoot, "records")),
    reopen: async () => { await adapter.close(); adapter = await open(); },
    endSession: (id: string) => offline(async runtime => {
      const ref = { kind: "session", id, revision: 1 }, session = await runtime.sessions.open(ref);
      assert.ok(session); await session.purge(await session.previewPurge());
      assert.equal(await runtime.sessions.open(ref), undefined);
    }),
  };
}

async function entries(f: Awaited<ReturnType<typeof fixture>>) {
  const session = await f.adapter.createSession({ project_id: where.owner, plugin_id: "test.plugin", install_id: "test-install", actor_id: "alice",
    title: "Memory deletion", workspace: "none" });
  const bound = f.memory({ ...caller, session_id: session.session_id });
  const input = { ...where, text: "Keep this exact Session's private release order.", origin: "person",
    meta: { kind: "convention", classification: { scenes: ["coding"], lifecycle: "session" } } };
  const formal = await bound.write({ ...input, operation_id: "save-session" });
  const candidate = await bound.candidates.propose({ ...input, text: "A private Session suggestion.", expected_version: 0, operation_id: "propose-session" });
  assert.equal(formal.meta.session_ref?.id, session.session_id);
  assert.equal(candidate.meta.session_ref?.id, session.session_id);
  return { session, formal, candidate,
    remove: { ...where, memory_id: formal.memory_id, expected_version: formal.version, operation_id: "delete-formal" },
    purge: { ...where, candidate_id: candidate.candidate_id, expected_version: candidate.version, operation_id: "delete-candidate" } };
}

async function stored(runtime: Runtime, kind: "memories" | "memory-candidates", id: string) {
  const row = (await runtime.store.list({ kind })).records.find((item: { metadata: Record<string, unknown> }) => item.metadata.rowId === id);
  assert.ok(row, "the public Registry retains the exact record identity");
  return { row, body: () => runtime.store.readSecure({ kind, id: row.id }) };
}

test("MEM-DEL-01: reopened deletion of known ended-Session refs needs only delete authority and clears only their bodies", async t => {
  const f = await fixture(t), item = await entries(f);
  const kept = await f.memory().write({ ...where, text: "A later independent release note.", origin: "person", operation_id: "save-kept" });
  const keptCandidate = await f.memory().candidates.propose({ ...where, text: "An independent suggestion.", origin: "person", expected_version: 0, operation_id: "propose-kept" });
  await f.endSession(item.session.session_id);
  const targets = await f.offline(async runtime => Promise.all(
    ([["memories", item.formal.memory_id], ["memory-candidates", item.candidate.candidate_id]] as const).map(async ([kind, id]) =>
      ({ kind, id: (await stored(runtime, kind, id)).row.id })),
  ));
  const beforeRead = f.bytes();
  await assert.rejects(f.memory().candidates.get(item.purge), { code: "MEMORY_SCOPE_DENIED" });
  await assert.rejects(f.memory().previewMutation({ ...item.remove, mutation: { kind: "remove" } }), { code: "MEMORY_SCOPE_DENIED" });
  assert.deepEqual((await f.memory().list(where.scope, where.owner)).map(entry => entry.memory_id), [kept.memory_id]);
  assert.deepEqual((await f.memory().candidates.list(where.scope, where.owner)).map(entry => entry.candidate_id), [keptCandidate.candidate_id]);
  assert.deepEqual(f.bytes(), beforeRead);
  await f.reopen(); // Deletion starts cold, without the preceding reads' hydrated cache.
  f.deleteOnly = true; f.actions.length = 0;
  assert.equal(await f.memory().remove(item.remove), undefined);
  assert.equal(await f.memory().candidates.purge(item.purge), undefined);
  assert.ok(f.actions.length > 0); assert.ok(f.actions.every(action => action === "delete"));
  const afterDelete = f.bytes(); await f.reopen();
  await f.memory().remove(item.remove); await f.memory().candidates.purge(item.purge);
  assert.deepEqual(f.bytes(), afterDelete, "the original operation retries without another persistent mutation");
  f.deleteOnly = false;
  assert.deepEqual(await f.memory().list(where.scope, where.owner), [kept]);
  assert.deepEqual(await f.memory().candidates.list(where.scope, where.owner), [keptCandidate]);
  await f.offline(async runtime => {
    for (const target of targets) {
      const row = await runtime.store.get(target);
      assert.ok(row, "purge retains the original identity to prevent its reuse");
      assert.equal(row.tombstoned, true); assert.deepEqual(row.metadata, {});
      await assert.rejects(runtime.store.readSecure(target));
    }
    assert.equal(JSON.parse(new TextDecoder().decode(await (await stored(runtime, "memories", kept.memory_id)).body())).text, kept.text);
    assert.equal(JSON.parse(new TextDecoder().decode(await (await stored(runtime, "memory-candidates", keptCandidate.candidate_id)).body())).text, keptCandidate.text);
  });
});

for (const kind of ["formal", "candidate"] as const) test(`MEM-DEL-02: cold ${kind} deletion with an absent scope/owner is a no-op and preserves the real target`, async t => {
  const f = await fixture(t), item = await entries(f);
  await f.endSession(item.session.session_id);
  for (const identity of [{ ...where, owner: "another-project" }, { scope: "user" as const, owner: where.owner }]) {
    await f.reopen();
    const before = f.bytes();
    const result = kind === "formal" ? await f.memory().remove({ ...item.remove, ...identity })
      : await f.memory().candidates.purge({ ...item.purge, ...identity });
    assert.equal(result, undefined, "an absent locator does not establish whether an earlier operation committed");
    assert.deepEqual(f.bytes(), before);
    await f.offline(async runtime => {
      const target = await stored(runtime, kind === "formal" ? "memories" : "memory-candidates",
        kind === "formal" ? item.formal.memory_id : item.candidate.candidate_id);
      const retained = JSON.parse(new TextDecoder().decode(await target.body()));
      assert.equal(retained.text, kind === "formal" ? item.formal.text : item.candidate.text);
      assert.equal(retained.version, kind === "formal" ? item.formal.version : item.candidate.version);
      assert.notEqual(target.row.tombstoned, true);
    });
  }
});

for (const kind of ["formal", "candidate"] as const) test(`MEM-DEL-02: ${kind} deletion preserves storage on a stale version, known identity mismatch, cancellation or revoked caller`, async t => {
  const f = await fixture(t), item = await entries(f);
  await f.endSession(item.session.session_id);
  const command = kind === "formal" ? item.remove : item.purge;
  const run = (overrides: { scope?: "user"; owner?: string; expected_version?: number; signal?: AbortSignal } = {}, control?: AgentMemoryExecutionControl) => {
    const memory = control ? f.memory().withExecution!(control) : f.memory();
    return kind === "formal" ? memory.remove({ ...item.remove, ...overrides }) : memory.candidates.purge({ ...item.purge, ...overrides });
  };
  const before = f.bytes();
  await assert.rejects(run({ expected_version: command.expected_version + 1 }), { code: "agent.memory_conflict" });
  // The rejected CAS read established this exact identity; cold absent locators are covered separately above.
  await assert.rejects(run({ owner: "another-project" }));
  await assert.rejects(run({ scope: "user" }));
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(run({ signal: aborted.signal }));
  f.revoked = true; await assert.rejects(run()); f.revoked = false;
  let current = true, finalChecks = 0;
  await assert.rejects(run({}, { beforeEffect: async () => { current = false; }, assert_current: () => {
    finalChecks++; assert.ok(current, "execution was revoked");
  } }), /execution was revoked/);
  assert.ok(finalChecks > 0); assert.deepEqual(f.bytes(), before);
  await f.reopen(); assert.deepEqual(f.bytes(), before);
});

for (const kind of ["formal", "candidate"] as const) test(`MEM-DEL-02: ${kind} deletion rechecks authority and cancellation after permission waits`, { timeout: 30_000 }, async t => {
  let stop: "revoke" | "cancel" | undefined, entered!: () => void, release!: () => void;
  let held: Promise<void>;
  const f = await fixture(t, async (_caller, requests) => {
    if (stop && requests.some(request => request.action === "delete")) { entered(); await held; }
    return true;
  }), item = await entries(f);
  await f.endSession(item.session.session_id);
  const before = f.bytes();
  for (const reason of ["revoke", "cancel"] as const) {
    const gate = new Promise<void>(resolve => { entered = resolve; });
    held = new Promise<void>(resolve => { release = resolve; }); stop = reason;
    const abort = new AbortController();
    const pending = kind === "formal" ? f.memory().remove({ ...item.remove, signal: abort.signal })
      : f.memory().candidates.purge({ ...item.purge, signal: abort.signal });
    await gate;
    if (reason === "revoke") f.revoked = true; else abort.abort();
    stop = undefined; release(); await assert.rejects(pending);
    f.revoked = false; assert.deepEqual(f.bytes(), before);
  }
  await f.reopen(); assert.deepEqual(f.bytes(), before);
});

for (const ended of [false, true]) test(`MEM-DEL-03: pending reservation cannot be purged, ended Session=${ended}`, async t => {
  const f = await fixture(t), item = await entries(f);
  const decision = { ...where, candidate_id: item.candidate.candidate_id, expected_version: item.candidate.version, operation_id: "accept-original" };
  await f.offline(async (runtime, host) => {
    const bound = runtime.bindMemory({ consumer: "ui", currentScene: "coding", purpose: "management",
      sessionRef: { kind: "session", id: item.session.session_id, revision: 1 } });
    await bound.candidates.hydrate([where]);
    const commit = host.storage.commit.bind(host.storage);
    host.storage.commit = async (request: Parameters<typeof host.storage.commit>[0]) => {
      const receipt = await commit(request);
      if (request.kind.endsWith("~memory-candidates")) throw new Error("reservation receipt unavailable");
      return receipt;
    };
    try {
      await assert.rejects(bound.candidates.accept({ kind: "memory-candidate", id: item.candidate.candidate_id, revision: 1 },
        { expectedVersion: decision.expected_version, operationId: decision.operation_id }, {}), /reservation receipt unavailable/);
    } finally { host.storage.commit = commit; }
  });
  if (ended) await f.endSession(item.session.session_id);
  const before = f.bytes();
  await assert.rejects(f.memory().candidates.purge(item.purge), { code: "MEMORY_NOT_ACCEPTED" });
  assert.deepEqual(f.bytes(), before);
  if (ended) {
    await assert.rejects(f.memory({ ...caller, session_id: item.session.session_id }).candidates.accept(decision), { code: "MEMORY_SCOPE_DENIED" });
    assert.deepEqual(f.bytes(), before);
  } else {
    const bound = () => f.memory({ ...caller, session_id: item.session.session_id });
    const accepted = await bound().candidates.accept(decision);
    await f.reopen(); assert.deepEqual(await bound().candidates.accept(decision), accepted);
    const candidate = await bound().candidates.get(item.purge);
    assert.equal(candidate?.state, "accepted"); assert.equal(candidate.memory_id, accepted.memory_id);
    await f.endSession(item.session.session_id);
    const purge = { ...item.purge, expected_version: candidate.version };
    await f.memory().candidates.purge(purge);
    const cleared = f.bytes(); await f.reopen(); await f.memory().candidates.purge(purge);
    assert.deepEqual(f.bytes(), cleared);
  }
});
