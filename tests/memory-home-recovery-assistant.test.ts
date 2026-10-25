import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { LOCAL_PERSON_ACTOR_ID as actor } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID, ASSISTANT_INSTALL_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, openPrologueMemoryAdoptionInspection } from "@molis-ai/molis-work-service-agent-host";
import { AssistantService, AssistantStore, ASSISTANT_STORE_NAME, LocalHost, assistantAuthority, memoryRuntimePolicy,
  type HomeInitializationFailure } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog, recoverDesktopMemoryHome } from "@molis-ai/molis-work-app-desktop";
import { createMemoryLedgerHomeRecovery, openHomeSqliteDatabase, openReadOnlyHomeSqlite, openMemoryLedger } from "@molis-ai/molis-work-storage";
import { defaultPrefs } from "@molis-ai/molis-work-service-memory";
import { endingReviewReply } from "./fixtures/ending-review.js";

const app = { appId: "io.molis.work", appVersion: "1.0.0" };
const owner = { actor_id: actor, project_id: ASSISTANT_PERSONAL_OWNER, plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID };
const ref = (id: string) => ({ runtime_id: "prologue", session_id: id });

function durableFiles(root: string): Record<string, Buffer> {
  return Object.fromEntries(readdirSync(root, { withFileTypes: true }).flatMap(item => {
    const path = join(root, item.name);
    if (item.isDirectory()) return Object.entries(durableFiles(path)).map(([key, bytes]) => [join(item.name, key), bytes]);
    const bytes = readFileSync(path);
    return item.name.endsWith("-shm") || item.name.endsWith("-wal") && bytes.length === 0 ? [] : [[item.name, bytes]];
  }));
}

/** Actual AssistantService sends create the personal Works, bind Sessions, and persist completed rounds through a bounded local HTTP provider. */
async function fixture(t: TestContext) {
  const directory = realpathSync(mkdtempSync("/private/tmp/molis-home-assistant-recovery-")), home = join(directory, "target");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home }); assert.deepEqual(catalog.listProjects(), []); catalog.close();
  const ledger = openMemoryLedger({ homeDirectory: home });
  ledger.savePrefs(actor, "personal", defaultPrefs("personal", "reviewed")); ledger.savePrefs(actor, "project-default", defaultPrefs("project", "reviewed"));
  ledger.setMarker(actor, "strategy-adoption", { origin: "existing-home" }, "2026-10-26T00:00:00Z"); ledger.close();
  let requests = 0;
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    requests++; assert.ok(requests <= 12, "local fixture has a fixed response budget");
    const content = endingReviewReply(raw) ?? "已整理好这段私人内容。";
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`
      + 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close() {} } });
  const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME), store = new AssistantStore(db);
  const reviews = new AgentReviewQueue(), host = new AgentHost({ reviews });
  let adapter = await createPrologueNodeAdapter({ app, storageRoot: join(home, "agent-runtime"), reviewQueue: reviews,
    resolveCredential: () => "local-test-only", modelConfiguration: async () => ({ protocol: "openai-compatible",
      endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`, model: "local-bounded-fixture", credential_ref: "fixture" }) });
  host.register(adapter);
  const service = new AssistantService(store, { pages: async () => [], host: async () => host,
    authority: async work => assistantAuthority(local, work, () => store.disabledActions(actor)) }, actor);
  const closeService = async () => { service.continuations.close(); await adapter.close(); if (db.isOpen) db.close(); await local.close(); };
  const closeServer = async () => { server.closeAllConnections(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())); };
  t.after(async () => { await closeService(); await closeServer(); rmSync(directory, { recursive: true, force: true }); });
  const created = [];
  for (const name of ["original", "neighbor"]) {
    const sent = await service.send({ text: `PRIVATE ${name} personal work`, request_id: `request-${name}` }, {});
    const deadline = Date.now() + 10_000;
    for (;;) {
      const view = await service.read(sent.work.work_id);
      assert.notEqual(view.work.state, "failed");
      if (view.work.state === "completed") { assert.ok(view.rounds.length > 0); break; }
      assert.ok(Date.now() < deadline, "the actual local Assistant round must complete");
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const work = store.get(actor, sent.work.work_id); assert.deepEqual(work.scope, { kind: "personal" });
    assert.equal(work.project_ref, undefined); assert.ok(work.session_id); created.push(work);
  }
  assert.ok(requests > 0); const [selected, neighbor] = created; assert.ok(selected?.session_id && neighbor?.session_id);
  await closeService(); await closeServer();
  const original = join(directory, "T0"), source = join(directory, "T1"); cpSync(home, original, { recursive: true });
  adapter = await createPrologueNodeAdapter({ app, storageRoot: join(home, "agent-runtime"), modelConfiguration: async () => { throw new Error("cold fixture cannot start a model"); } });
  try {
    const session = ref(selected.session_id), preview = await adapter.sessionLifecycle!.previewPurge(session, owner);
    assert.equal((await adapter.sessionLifecycle!.purge(session, { operation_id: "original-assistant-delete", expected_version: preview.version,
      expected_state: preview.state }, preview, owner)).state, "purged");
  } finally { await adapter.close(); }
  cpSync(home, source, { recursive: true }); rmSync(home, { recursive: true }); cpSync(original, home, { recursive: true });
  const sourceBefore = durableFiles(source), originalBefore = durableFiles(original);
  const business = () => {
    const read = openReadOnlyHomeSqlite(home, ASSISTANT_STORE_NAME);
    try { return { works: read.prepare("SELECT work_id,body FROM assistant_works ORDER BY work_id").all(),
      rounds: read.prepare("SELECT * FROM assistant_rounds ORDER BY work_id,run_id").all() }; }
    finally { read.close(); }
  };
  return { home, source, selected, neighbor, business, input: { homeDirectory: home, sourceDirectory: source, operation_id: "recover-personal-assistant", assertCurrent() {} },
    unchanged() { for (const [root, before] of [[source, sourceBefore], [original, originalBefore]] as const) {
      const after = durableFiles(root); assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
      for (const [key, bytes] of Object.entries(before)) assert.ok(bytes.equals(after[key]!), `original copy changed: ${key}`);
    } } };
}

test("MEM-40-FRAME-06: a real personal Assistant Work recovers under its personal owner without a fabricated project scope", async t => {
  const f = await fixture(t), before = f.business(); let failure: HomeInitializationFailure | undefined;
  t.mock.method(globalThis, "fetch", async () => { assert.fail("cold recovery must not call any provider"); });
  try { assert.equal((await recoverDesktopMemoryHome(f.input)).outcome, "completed"); }
  catch (error) { failure = error as HomeInitializationFailure; throw error; }
  finally { await failure?.close(); }
  const parent = createMemoryLedgerHomeRecovery({ homeDirectory: f.home, operation_id: f.input.operation_id, assertCurrent() {} });
  let decision;
  try { decision = parent.read().parent!.body; } finally { await parent.close(); }
  assert.equal(decision.phase, "committed"); assert.deepEqual(decision.project_groups, []);
  assert.deepEqual(decision.known_scopes, [{ scope: "personal", owner: actor }]); assert.equal(decision.sessions.length, 1);
  const business = decision.sessions[0]!.business; assert.equal(business.kind, "assistant");
  if (business.kind !== "assistant") assert.fail();
  assert.deepEqual(business.selection.works.map(work => ({ id: work.work_id, project: work.project_id })), [{ id: f.selected.work_id, project: null }]);
  const expected = { works: before.works.filter(row => row.work_id === f.neighbor.work_id), rounds: before.rounds.filter(row => row.work_id === f.neighbor.work_id) };
  assert.deepEqual(f.business(), expected);
  const reader = await openPrologueMemoryAdoptionInspection({ storageRoot: join(f.home, "agent-runtime"), appVersion: app.appVersion,
    scopes: [{ scope: "user", owner: actor }], policy: memoryRuntimePolicy(() => undefined).policy });
  try { for (const work of [f.selected, f.neighbor]) assert.equal((await reader.inspectSession({ ref: { kind: "session", id: work.session_id!, revision: 1 } })).state,
    work === f.selected ? "purged" : "present"); }
  finally { await reader.close(); }
  assert.equal((await recoverDesktopMemoryHome(f.input)).replayed, true); assert.deepEqual(f.business(), expected); f.unchanged();
});
