import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, realpath, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { MolisWorkLocalHost, LocalHost, LocalProjectDatabase, LOCAL_OWNER_PERMISSIONS, molisWorkHostProjectReference, type ActionAvailabilityPolicy } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { CODING_PLUGIN_ID, CODING_PROJECT_DATABASE } from "@molis-ai/molis-work-plugin-coding";
import { inspectExistingPluginProjectDatabase } from "@molis-ai/molis-work-plugin-runtime";
import { acquireStorageOwner, openKnowledgeCards, openTextSearchIndex, homeSqlitePath, describeSqliteSchema, listSqliteObjects } from "@molis-ai/molis-work-storage";
import { ActionError, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, subjectContext, type ActionCallContext, type ActionExecutionContext, type ActionProviderRegistration, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { knowledgeActions, knowledgeManageActions, type KnowledgeBindPreviewResponse, type KnowledgeCardRecord, type KnowledgeCardsResponse, type KnowledgeListResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import { searchSourceKey } from "@molis-ai/molis-work-contracts/services/search";
import { KnowledgeOrganizer, cardFor, type KnowledgePiece } from "@molis-ai/molis-work-service-knowledge";
import { maintainCodingKnowledge } from "./fixtures/coding-knowledge-maintenance.mjs";

async function scratch(t: TestContext) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "private-adoption-"))), home = join(directory, "home");
  await mkdir(home); t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, home };
}
const subject = { kind: "adoption_note", id: "original" };
const piece: KnowledgePiece = { subject, source_key: "old-source", provider_id: "notes", plugin_id: "notes", plugin_title: "Notes", revision: "old-revision",
  title: "Original title", summary: "Original summary", content: "Original text", content_policy: "context", updated_at: null, open: null };
const retainedCard = (project: string): KnowledgeCardRecord => ({ ...cardFor(project, piece), state: "ready", organized_revision: "old-revision",
  brief: "OldMachineOnly", keywords: ["HumanKeyword"], edited: ["keywords"], outline: [{ anchor: "old", title: "Old section", summary: "OldMachineSection" }],
  suggestion: { brief: "Old suggestion" }, organized_at: "2026-10-01T00:00:00.000Z" });
const rows = (db: DatabaseSync, table: string) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }));
const inspector = { scratch: () => new DatabaseSync(":memory:"), objects: (db: unknown) => listSqliteObjects(db as DatabaseSync), shape: (db: unknown) => describeSqliteSchema(db as DatabaseSync) };

for (const mode of ["completed", "pending-failure", "handler-pending"] as const) test(`binding refuses a real Coding archive ${mode} during its final discovery, before delayed Search refresh`, { timeout: 60_000 }, async t => {
  const { home } = await scratch(t), catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "Binding lifecycle fence", actor_id: "web-user" });
  catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "coding", actor_id: "web-user" }); catalog.close();
  const database = new DatabaseSync(project.database_path, { readOnly: true });
  let target = "", faultArmed = false, injected = false;
  const held = Promise.withResolvers<void>(), finishHandler = Promise.withResolvers<void>();
  const codingRow = (id: string) => ({ ...database.prepare("SELECT * FROM coding_sessions WHERE project_id=? AND session_id=?").get(project.project_id, id) });
  const availability: ActionAvailabilityPolicy = Object.assign(async (_caller: ActionCallContext, view: ActionView) => {
    if (faultArmed && mode === "pending-failure" && view.capability_id === "coding.sessions.update") {
      const pending = codingRow(target).lifecycle_json;
      if (pending && JSON.parse(String(pending)).completed === false) {
        injected = true; throw new ActionError("actions.conflict", "injected-after-prepare");
      }
    }
    return { available: true as const };
  }, { snapshotForDiscovery: () => () => ({ available: true as const }) });
  if (mode === "handler-pending") {
    const registryFor = LocalHost.prototype.actionRegistry;
    t.mock.method(LocalHost.prototype, "actionRegistry", function(this: LocalHost<unknown>, ...args: Parameters<typeof registryFor>) {
      const registry = registryFor.apply(this, args);
      return { ...registry, registerProvider: (registration: ActionProviderRegistration) => registry.registerProvider({ ...registration,
        handlers: registration.handlers.map(handler => handler.capability_id !== "coding.sessions.update" ? handler : { ...handler,
          handle: async (caller: ActionExecutionContext, input: unknown) => {
            const result = await handler.handle(caller, input);
            if (faultArmed) { injected = true; held.resolve(); await finishHandler.promise; }
            return result;
          } }),
      }) };
    });
  }
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: availability });
  const cards = openKnowledgeCards({ homeDirectory: home }), index = openTextSearchIndex({ homeDirectory: home });
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let armed = false, retentionReads = 0, discoveriesLeft = 0, bindingCallId: string | undefined;
  const model = t.mock.method(globalThis, "fetch", async () => { throw new Error("binding cannot request a model"); });
  const productionClient = host.actionClient.bind(host);
  host.actionClient = (...args) => {
    const client = productionClient(...args);
    return { ...client, invoke: async (caller, reference, input) => {
      const result = await client.invoke(caller, reference, input);
      if (armed && reference.capability_id === "coding.subject.retention") {
        bindingCallId ??= caller.call_id; assert.equal(caller.call_id, bindingCallId);
        assert.equal((result as { state: string }).state, "active");
        if (++retentionReads === 4) discoveriesLeft = 3;
      }
      return result;
    }, discover: async caller => {
      const result = await client.discover(caller);
      if (armed && caller.call_id === bindingCallId && discoveriesLeft && --discoveriesLeft === 0) {
        // readSubjectRetention and check.current each finish their discovery; this third one is bind's final discovery.
        armed = false; entered.resolve(); await release.promise;
      }
      return result;
    } };
  };
  try {
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
    const caller: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: [...LOCAL_OWNER_PERMISSIONS] };
    const client = host.actionClient(reference), views = await client.discover(caller);
    const invoke = (capability: string, input: unknown) => {
      const view = views.find(view => view.capability_id === capability); assert.ok(view, capability);
      return client.invoke(caller, { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, input);
    };
    const created = await invoke("coding.sessions.create", { title: "Retained original" }) as { session: { session_id: string } };
    const session_id = created.session.session_id, subject = { kind: "coding_session", id: session_id }; target = session_id;
    const neighbour = await invoke("coding.sessions.create", { title: "Untouched neighbour" }) as { session: { session_id: string } };
    const neighbourId = neighbour.session.session_id, neighbourSubject = { kind: "coding_session", id: neighbourId };
    for (const deadline = Date.now() + 10_000;;) {
      await invoke(knowledgeManageActions.cards.capability_id, {});
      if (cards.get(project.project_id, subject) && cards.get(project.project_id, neighbourSubject)) break;
      assert.ok(Date.now() < deadline, "the original Coding source is listed"); await new Promise(resolve => setTimeout(resolve, 20));
    }
    const original = { ...cards.get(project.project_id, subject)!, retention: { generation: null, restoration_operation_id: null } }; cards.put(original);
    const preview = await invoke(knowledgeManageActions.bindPreview.capability_id, { subject }) as KnowledgeBindPreviewResponse;
    assert.equal(preview.candidates.length, 1); const chosen = preview.candidates[0]!;
    const documents = () => index.documents(project.project_id).filter(document => document.kind === subject.kind && document.object_id === subject.id);
    const before = documents(); assert.equal(before.length, 1);
    const neighbourBefore = codingRow(neighbourId), neighbourCard = cards.get(project.project_id, neighbourSubject);
    armed = true;
    const pending = invoke(knowledgeManageActions.bind.capability_id, { subject, operation_id: "binding-archive-race", provider_id: chosen.provider_id,
      source_key: chosen.source_key, generation: chosen.generation, source_revision: chosen.source_revision });
    const result = pending.then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));
    await Promise.race([entered.promise, result.then(() => { throw new Error("bind never reached final discovery after four active retention reads"); })]);
    assert.equal(retentionReads, 4); assert.ok(bindingCallId); assert.deepEqual(cards.get(project.project_id, subject), original);
    const archive = await invoke("coding.sessions.archive.preview", { session_id }) as { archive_decision: { mode: string } };
    assert.equal(archive.archive_decision.mode, "local", "this zero-model intersection uses the real local Coding lifecycle, without inventing SDK history");
    faultArmed = true;
    const archiving = invoke("coding.sessions.update", { session_id, archive: true, archive_decision: archive.archive_decision });
    const archiveResult = archiving.then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));
    let archiveSettled = false; void archiveResult.then(() => { archiveSettled = true; });
    if (mode === "handler-pending") {
      await Promise.race([held.promise, archiveResult.then(() => { throw new Error("the real archive handler never reached its return barrier"); })]);
      assert.equal(archiveSettled, false); assert.equal(injected, true);
    } else {
      const outcome = await archiveResult;
      if (mode === "pending-failure") { assert.match(String(outcome.error), /injected-after-prepare/); assert.equal(injected, true); }
      else assert.equal(outcome.error, undefined);
    }
    const persisted = codingRow(session_id), decision = JSON.parse(String(persisted.lifecycle_json));
    assert.deepEqual(decision.request, archive.archive_decision);
    assert.equal(decision.completed, mode !== "pending-failure"); assert.equal(persisted.archived, mode === "pending-failure" ? 0 : 1);
    if (mode === "pending-failure") await assert.rejects(invoke("coding.subject.retention", { subject_id: session_id }),
      (error: unknown) => (error as { code?: string }).code === "actions.conflict");
    else {
      const retained = await invoke("coding.subject.retention", { subject_id: session_id }) as { state: string };
      assert.equal(retained.state, "temporarily_archived", "the real owner finished archiving in the same installation");
    }
    const current = await client.discover(caller);
    assert.equal(current.find(view => view.provider.provider_id === chosen.provider_id)?.provider.plugin_installation_generation, chosen.generation);
    assert.deepEqual(documents(), before, "the existing delayed Search index has not refreshed yet");
    release.resolve(); const outcome = await result;
    t.diagnostic(JSON.stringify({ mode, retentionReads, completed: decision.completed, archiveSettled, adopted: !!cards.get(project.project_id, subject)?.adoption }));
    assert.ok(outcome.error, "binding must refuse an owner archive after its last retention read");
    assert.deepEqual(cards.get(project.project_id, subject), original); assert.deepEqual(codingRow(session_id), persisted);
    assert.deepEqual(codingRow(neighbourId), neighbourBefore); assert.deepEqual(cards.get(project.project_id, neighbourSubject), neighbourCard);
    if (mode === "handler-pending") { assert.equal(archiveSettled, false); finishHandler.resolve(); assert.equal((await archiveResult).error, undefined); }
    if (mode === "pending-failure") {
      faultArmed = false;
      await invoke("coding.sessions.update", { session_id, archive: true, archive_decision: archive.archive_decision });
      const completed = codingRow(session_id);
      assert.deepEqual(JSON.parse(String(completed.lifecycle_json)), { ...decision, completed: true });
      assert.equal(completed.archived, 1);
      await invoke("coding.sessions.update", { session_id, archive: true, archive_decision: archive.archive_decision });
      assert.deepEqual(codingRow(session_id), completed, "the original archive request replays without another lifecycle operation");
    }
    assert.deepEqual(cards.get(project.project_id, subject), original);
    assert.deepEqual(codingRow(neighbourId), neighbourBefore); assert.deepEqual(cards.get(project.project_id, neighbourSubject), neighbourCard);
    assert.equal(model.mock.callCount(), 0);
  } finally { release.resolve(); finishHandler.resolve(); await host.close(); cards.close(); index.close(); database.close(); }
});

test("binding preview reads two real providers without mutation, refuses source failure or withdrawal, and binds only the chosen provider", { timeout: 60_000 }, async t => {
  const { home } = await scratch(t), catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "Choose original", actor_id: "web-user" }); catalog.close();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), cards = openKnowledgeCards({ homeDirectory: home });
  const original = { ...retainedCard(project.project_id), retention: { generation: null, restoration_operation_id: null } }; cards.put(original);
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: [...LOCAL_OWNER_PERMISSIONS] };
  const model = t.mock.method(globalThis, "fetch", async () => { throw new Error("binding preview cannot request a model"); });
  let failure = false, hold = false; const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const reads = { a: 0, b: 0 }, unregister = new Map<string, () => void>();
  const register = (id: "a" | "b", ambiguous = false) => {
    unregister.get(id)?.();
    const entries = defineSearchEntriesAction(`choice.${id}.entries`, [{ kind: subject.kind, title: id, surface: "goals" }], id, []);
    const reader = defineSubjectContextAction(`choice.${id}.read`, subject.kind, id, []);
    const otherReader = defineSubjectContextAction(`choice.${id}.other-read`, subject.kind, id, []);
    const read = async () => { reads[id]++; if (id === "b" && failure) throw new Error("injected-source-read");
      if (id === "b" && hold) { entered.resolve(); await release.promise; }
      return subjectContext({ subject, title: `Source ${id}`, revision: `revision-${id}`, content: `Body ${id}` }); };
    unregister.set(id, host.actionRegistry(reference).registerProvider({ provider: { provider_id: `choice-${id}`, title: `Source ${id}`, kind: "system", plugin_installation_generation: `generation-${id}` },
      definitions: [entries, reader, ...(ambiguous ? [otherReader] : [])], handlers: [bindSearchEntriesHandler(entries, () => [{ subject, title: `Source ${id}`, summary: `Summary ${id}`, revision: `revision-${id}`, content: "context", updated_at: null, open: null }]),
        { ...reader, handle: read }, ...(ambiguous ? [{ ...otherReader, handle: read }] : [])] }));
  };
  const invoke = (action: { capability_id: string; version: number }, input: unknown, context = caller) => host.actionClient(reference).invoke(context, action, input);
  const preview = () => invoke(knowledgeManageActions.bindPreview, { subject }) as Promise<KnowledgeBindPreviewResponse>;
  try {
    await host.withProject(reference, () => undefined); register("a"); register("b");
    assert.ok(host.search); await host.search.service.rebuild({ client: host.actionClient(reference), caller }, {});
    const before = cards.get(project.project_id, subject), quota = cards.usage(project.project_id, "2026-10-27"), receipts = cards.receipts(project.project_id, { limit: 10, offset: 0 });
    const result = await preview();
    assert.deepEqual(result.candidates.map(candidate => candidate.provider_id).sort(), ["choice-a", "choice-b"]);
    assert.ok(result.candidates.every(candidate => candidate.generation === `generation-${candidate.provider_id.at(-1)}` && candidate.source_revision === `revision-${candidate.provider_id.at(-1)}`));
    assert.deepEqual(cards.get(project.project_id, subject), before); assert.deepEqual(cards.usage(project.project_id, "2026-10-27"), quota);
    assert.deepEqual(cards.receipts(project.project_id, { limit: 10, offset: 0 }), receipts);
    const count = reads.a + reads.b;
    await assert.rejects(invoke(knowledgeManageActions.bindPreview, { subject }, { ...caller, audience: "agent" }));
    const stopped = new AbortController(); stopped.abort(); await assert.rejects(invoke(knowledgeManageActions.bindPreview, { subject }, { ...caller, signal: stopped.signal }));
    assert.equal(reads.a + reads.b, count);
    register("b", true); await assert.rejects(preview(), (error: unknown) => (error as { code?: string }).code === "actions.subject_ambiguous");
    register("b");
    failure = true; await assert.rejects(preview(), /injected-source-read/); failure = false;
    hold = true; const pending = preview(), refused = assert.rejects(pending);
    await Promise.race([entered.promise, pending.then(() => { throw new Error("preview never reached the real second source read"); })]);
    unregister.get("b")!(); release.resolve(); await refused; hold = false;
    assert.deepEqual(cards.get(project.project_id, subject), before);
    register("b"); await host.search.service.rebuild({ client: host.actionClient(reference), caller }, {});
    const chosen = (await preview()).candidates.find(candidate => candidate.provider_id === "choice-b")!; assert.ok(chosen);
    const aReads = reads.a, input = { subject, operation_id: "choose-b", provider_id: chosen.provider_id, source_key: chosen.source_key, generation: chosen.generation, source_revision: chosen.source_revision };
    const bound = await invoke(knowledgeManageActions.bind, input) as KnowledgeCardRecord;
    assert.equal(reads.a, aReads, "binding the chosen provider must not read its rival");
    assert.equal(bound.provider_id, "choice-b"); assert.equal(bound.adoption?.generation, "generation-b"); assert.equal(bound.brief, original.brief);
    unregister.get("a")!(); unregister.get("b")!();
    assert.deepEqual((await preview()).candidates, []); assert.deepEqual(cards.get(project.project_id, subject), bound);
    assert.equal(model.mock.callCount(), 0);
  } finally { release.resolve(); await host.close(); cards.close(); }
});

test("private adoption uses the real old Coding 1/2/3 stores and preserves originals, plans and neighbours", async t => {
  for (const from of [1, 2, 3]) await t.test(String(from), async t => {
    const { directory, home } = await scratch(t), file = join(home, "project.sqlite");
    const store = new LocalProjectDatabase(file);
    const db = store.db, project = "project-original", at = "2026-10-01T00:00:00.000Z";
    // This fixture owns only synthetic rows; normal opening still uses the real baseline and owner declaration.
    db.prepare("INSERT INTO project_root (project_id, created_at) VALUES (?, ?)").run(project, at);
    const request = { mode: "local", runtime_id: "prologue", operation_id: "original-op", previous_operation_id: null,
      observed: { session_id: "original", title: "Original", state: "idle", archived: false, goal_id: null, updated_at: at } };
    const original = { archived: true, request, at, completed: true, ...(from === 3 ? { content_revision: "real-known-content" } : {}) };
    db.prepare("INSERT INTO coding_sessions (project_id, session_id, title, state, archived, runtime_id, created_at, updated_at, lifecycle_json) VALUES (?, 'original', 'Original', 'idle', 1, 'prologue', ?, ?, ?)")
      .run(project, at, at, from === 1 ? null : JSON.stringify(original));
    db.prepare("INSERT INTO coding_plan_drafts VALUES (?, 'original', 7, ?)").run(project, JSON.stringify({ original: "plan" }));
    db.prepare("INSERT INTO coding_sessions (project_id, session_id, title, state, runtime_id, created_at, updated_at) VALUES (?, 'neighbour', 'Keep', 'idle', 'prologue', ?, ?)").run(project, at, at);
    db.prepare("UPDATE plugin_project_databases SET version = ? WHERE plugin_id = ?").run(from, CODING_PLUGIN_ID);
    if (from === 1) db.exec("ALTER TABLE coding_sessions DROP COLUMN lifecycle_json");
    const originalRows = rows(db, "coding_sessions"), plans = rows(db, "coding_plan_drafts"), ledger = rows(db, "plugin_project_databases");
    assert.throws(() => inspectExistingPluginProjectDatabase(db as never, { plugin_id: CODING_PLUGIN_ID, publisher_signature: "official-coding-binding", declaration: CODING_PROJECT_DATABASE }, inspector, { path: file }));
    assert.deepEqual(rows(db, "coding_sessions"), originalRows);
    store.close();
    const result = await maintainCodingKnowledge("apply", { home, projectDatabase: file, publisher: "official-coding-binding", backupDirectory: join(directory, "backup") });
    assert.deepEqual(result.completed, ["coding"]);
    const current = new DatabaseSync(file);
    try {
      inspectExistingPluginProjectDatabase(current as never, { plugin_id: CODING_PLUGIN_ID, publisher_signature: "official-coding-binding", declaration: CODING_PROJECT_DATABASE }, inspector, { path: file });
      const kept = rows(current, "coding_sessions");
      assert.deepEqual(kept.map(({ lifecycle_json: _, ...row }) => row), originalRows.map(({ lifecycle_json: _, ...row }) => row));
      assert.deepEqual(kept[0]!.lifecycle_json && JSON.parse(String(kept[0]!.lifecycle_json)), from === 1 ? null : { ...original, content_revision: from === 3 ? "real-known-content" : null });
      assert.deepEqual(rows(current, "coding_plan_drafts"), plans);
      assert.deepEqual(rows(current, "plugin_project_databases"), ledger.map(row => row.plugin_id === CODING_PLUGIN_ID ? { ...row, version: 4 } : row));
    } finally { current.close(); }
    assert.deepEqual((await maintainCodingKnowledge("apply", { home, projectDatabase: file, publisher: "official-coding-binding" })).completed, []);
  });
});

test("Knowledge1 adoption preserves every original card, usage and receipt, refuses a live owner and cancelled apply", async t => {
  const { directory, home } = await scratch(t), cards = openKnowledgeCards({ homeDirectory: home });
  cards.put(retainedCard("project")); cards.put({ ...retainedCard("other"), excluded: true });
  cards.addUsage("project", "2026-10-27", { pieces: 2, chars: 300 });
  cards.addReceipt({ project_id: "project", subject, at: new Date().toISOString(), revision: "old-revision", via: "read", chars: 40,
    actor_id: "web-user", agent: null, audience: "user", call_id: "old-call", runtime_session_id: null }); cards.close();
  const file = homeSqlitePath(home, "knowledge"), db = new DatabaseSync(file);
  db.exec("PRAGMA user_version=1");
  const before = { cards: rows(db, "knowledge_cards"), usage: rows(db, "knowledge_usage"), receipts: rows(db, "knowledge_receipts") }; db.close();
  assert.throws(() => openKnowledgeCards({ homeDirectory: home }));
  const owner = acquireStorageOwner(join(home, "agent-runtime"));
  await assert.rejects(maintainCodingKnowledge("apply", { home, knowledge: true, backupDirectory: join(directory, "busy-backup") })); owner.release();
  const stop = new AbortController(); stop.abort();
  await assert.rejects(maintainCodingKnowledge("apply", { home, knowledge: true, signal: stop.signal, backupDirectory: join(directory, "cancel-backup") }));
  const inspect = new DatabaseSync(file); assert.deepEqual(rows(inspect, "knowledge_cards"), before.cards); inspect.close();
  await maintainCodingKnowledge("apply", { home, knowledge: true, backupDirectory: join(directory, "backup") });
  const after = new DatabaseSync(file);
  try {
    assert.deepEqual(rows(after, "knowledge_cards"), before.cards.map(row => ({ ...row, body: JSON.stringify({ ...JSON.parse(String(row.body)), retention: { generation: null, restoration_operation_id: null } }) })));
    assert.deepEqual(rows(after, "knowledge_usage"), before.usage); assert.deepEqual(rows(after, "knowledge_receipts"), before.receipts);
  } finally { after.close(); }
});

test("maintenance refuses replaced owner and backup paths during the actual asynchronous backup, without adopting rows", async t => {
  for (const replaced of ["owner-file", "owner-directory", "backup-directory", "backup-parent"]) await t.test(replaced, async t => {
    const { directory, home } = await scratch(t), cards = openKnowledgeCards({ homeDirectory: home }); cards.put(retainedCard("project")); cards.close();
    const file = homeSqlitePath(home, "knowledge"), db = new DatabaseSync(file); db.exec("PRAGMA user_version=1");
    const before = rows(db, "knowledge_cards"); db.close();
    const parent = join(directory, "backups"), destination = join(parent, "selected"); await mkdir(parent);
    const originalMkdir = fs.mkdirSync; let changed = false;
    // The real backup yields after mkdir. Move real nodes in its first microtask, without replacing backup or its result.
    t.mock.method(fs, "mkdirSync", (...args: Parameters<typeof fs.mkdirSync>) => {
      const result = Reflect.apply(originalMkdir, fs, args);
      if (args[0] === destination) queueMicrotask(() => {
        const target = replaced === "owner-file" ? join(home, "agent-runtime", ".molis-runtime-owner.db")
          : replaced === "owner-directory" ? join(home, "agent-runtime") : replaced === "backup-directory" ? destination : parent;
        fs.renameSync(target, target + ".original");
        if (replaced === "owner-file") fs.writeFileSync(target, "");
        else originalMkdir(target);
        if (replaced === "backup-parent") originalMkdir(destination);
        changed = true;
      });
      return result;
    });
    const outcome = await maintainCodingKnowledge("apply", { home, knowledge: true, backupDirectory: destination }).then(() => null, error => error);
    assert.equal(changed, true, "the original backup await must actually expose the replacement");
    assert.ok(outcome instanceof Error, "a replaced live owner or backup location cannot authorize adoption");
    const after = new DatabaseSync(file);
    try { assert.equal(after.prepare("PRAGMA user_version").get()!.user_version, 1); assert.deepEqual(rows(after, "knowledge_cards"), before); }
    finally { after.close(); }
  });
});

test("unknown restoration keeps original summaries listed through new revisions and sends no model request", async t => {
  const { home } = await scratch(t), cards = openKnowledgeCards({ homeDirectory: home }); t.after(() => cards.close());
  const original = { ...retainedCard("project"), retention: { generation: "install", restoration_operation_id: null } }; cards.put(original);
  let revision = "now", calls = 0;
  const organizer = new KnowledgeOrganizer({ store: cards, catalog: async () => [{ ...piece, revision, retention: { generation: "install" } }],
    retention: async () => ({ subject, state: "active", retained: { content_revision: null, restoration_operation_id: "restore-original" } }),
    writer: () => async () => { calls++; return { title: "Model", brief: "Should not run" }; } });
  t.after(() => organizer.close());
  await organizer.kick("project"); revision = "changed-again"; await organizer.kick("project");
  const kept = cards.get("project", subject)!;
  assert.equal(calls, 0); assert.equal(kept.state, "listed"); assert.equal(kept.brief, original.brief);
  assert.deepEqual(kept.keywords, original.keywords); assert.deepEqual(kept.outline, original.outline); assert.deepEqual(kept.suggestion, original.suggestion);
});

test("maintenance never reports completion after an unknown commit or close outcome; the actual durable result remains inspectable", async t => {
  for (const fault of ["commit", "close"]) await t.test(fault, async t => {
    const { directory, home } = await scratch(t), cards = openKnowledgeCards({ homeDirectory: home }); cards.put(retainedCard("project")); cards.close();
    const file = homeSqlitePath(home, "knowledge"), db = new DatabaseSync(file); db.exec("PRAGMA user_version=1"); db.close();
    // A separate process releases the genuine owner on exit even when its final close acknowledgment is lost.
    const script = `import assert from 'node:assert/strict'; import {DatabaseSync} from 'node:sqlite';
      import {maintainCodingKnowledge} from ${JSON.stringify(new URL("./fixtures/coding-knowledge-maintenance.mjs", import.meta.url).href)};
      const originalExec=DatabaseSync.prototype.exec, originalClose=DatabaseSync.prototype.close; let committed=false, injected=false;
      DatabaseSync.prototype.exec=function(sql){const result=originalExec.call(this,sql); if(sql==='COMMIT' && this.prepare('PRAGMA user_version').get().user_version===3){committed=true;
        if(${JSON.stringify(fault)}==='commit' && !injected){injected=true;throw new Error('injected-unknown-commit');}} return result;};
      DatabaseSync.prototype.close=function(){const result=originalClose.call(this);if(committed && !injected && ${JSON.stringify(fault)}==='close'){injected=true;throw new Error('injected-close');}return result;};
      await assert.rejects(maintainCodingKnowledge('apply',${JSON.stringify({ home, knowledge: true, backupDirectory: join(directory, "backup") })}), /did not complete/);assert.equal(injected,true);`;
    execFileSync(process.execPath, ["--input-type=module", "--eval", script], { timeout: 15_000, stdio: "pipe" });
    const current = openKnowledgeCards({ homeDirectory: home });
    try { assert.equal(current.get("project", subject)!.retention!.generation, null); assert.equal(current.get("project", subject)!.brief, "OldMachineOnly"); }
    finally { current.close(); }
  });
});

test("real Host binds an unbound ordinary source once, guards its installation after restart and withholds old machine summaries", { timeout: 60_000 }, async t => {
  for (const interleaved of [false, true]) await t.test(interleaved ? "human edit after the final asynchronous check" : "ordinary binding and restart", async t => {
  const { home } = await scratch(t), catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "Adopt originals", actor_id: "web-user" }); catalog.close();
  const original = { ...retainedCard(project.project_id), retention: { generation: null, restoration_operation_id: null } };
  let cards = openKnowledgeCards({ homeDirectory: home }); cards.put(original);
  const neighbour = { ...original, subject: { ...subject, id: "neighbour" }, excluded: true }; cards.put(neighbour);
  let host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: [...LOCAL_OWNER_PERMISSIONS] };
  const entries = defineSearchEntriesAction("adoption.notes", [{ kind: subject.kind, title: "Notes", surface: "coding" }], "Notes", []);
  const reader = defineSubjectContextAction("adoption.read", subject.kind, "Notes", []);
  let unregister = () => {}, reads = 0;
  const register = async (generation: string) => {
    await host.withProject(reference, () => undefined);
    unregister(); unregister = host.actionRegistry(reference).registerProvider({ provider: { provider_id: "notes", title: "Notes", kind: "system",
      plugin_installation_generation: generation }, definitions: [entries, reader], handlers: [
        bindSearchEntriesHandler(entries, () => [{ subject, title: "Current source", summary: "Current summary", revision: "current", content: "context", updated_at: null, open: null }]),
        { ...reader, handle: () => { reads++; return subjectContext({ subject, revision: "current", title: "Current source", content: "Current original text" }); } },
      ] });
    const client = host.actionClient(reference), views = await client.discover(caller);
    const listing = views.find(view => view.capability_id === entries.capability_id && view.provider.provider_id === "notes");
    assert.ok(listing?.availability.available, "the actual registered source must be available");
    await client.invoke(caller, { capability_id: entries.capability_id, version: entries.version, provider_id: "notes" }, { cursor: null, limit: 10 });
    assert.ok(host.search); await host.search.service.rebuild({ client: host.actionClient(reference), caller }, {});
    const owner = await host.localPersonContext(reference), ownerViews = await client.discover(owner);
    const index = openTextSearchIndex({ homeDirectory: home });
    try { assert.ok(ownerViews.some(view => view.provider.provider_id === "notes" && view.availability.available));
      assert.ok(index.sources().some(source => source.provider_id === "notes" && source.state === "ready"));
      assert.ok(index.documents(project.project_id).some(row => row.kind === subject.kind && row.content_revision === "current")); }
    finally { index.close(); }
  };
  const invoke = (action: { capability_id: string; version: number }, input: unknown, context = caller) => host.actionClient(reference).invoke(context, action, input);
  try {
    await register("generation-1");
    const listing = await invoke(knowledgeManageActions.cards, {}) as KnowledgeCardsResponse;
    assert.ok(listing.cards.some(card => card.subject.id === subject.id), "the person's management includes the retained unbound card");
    assert.equal((await invoke(knowledgeActions.list, {}) as KnowledgeListResponse).pieces.some(card => card.subject.id === subject.id), false);
    const input = { subject, operation_id: "bind-original", provider_id: "notes", source_key: searchSourceKey({ project_id: project.project_id, provider_id: "notes", capability_id: entries.capability_id, version: entries.version }), generation: "generation-1", source_revision: "current" };
    await assert.rejects(invoke(knowledgeManageActions.bind, input, { ...caller, audience: "agent" }));
    const cancelled = new AbortController(); cancelled.abort(); await assert.rejects(invoke(knowledgeManageActions.bind, input, { ...caller, signal: cancelled.signal }));
    assert.deepEqual(cards.get(project.project_id, subject), original);
    if (interleaved) {
      reads = 0; let changed = false;
      const edited: KnowledgeCardRecord = { ...original, brief: "Human edit in the final gap", edited: [...original.edited, "brief"] };
      const prepare = DatabaseSync.prototype.prepare;
      t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
        const statement = prepare.call(this, sql);
        if (sql === "SELECT body FROM knowledge_cards WHERE project_id = ? AND kind = ? AND object_id = ?") {
          const get = statement.get;
          t.mock.method(statement, "get", (...parameters: unknown[]) => {
            const result = Reflect.apply(get, statement, parameters);
            if (!changed && reads === 2 && parameters[0] === project.project_id && parameters[2] === subject.id) {
              changed = true; queueMicrotask(() => cards.put(edited));
            }
            return result;
          });
        }
        return statement;
      });
      const outcome = await invoke(knowledgeManageActions.bind, input).then(() => null, error => error);
      assert.equal(changed, true); assert.equal(reads, 2, "both real source checks completed before the edit");
      t.diagnostic(JSON.stringify({ changed, reads, adoptedAfterEdit: !!cards.get(project.project_id, subject)?.adoption }));
      assert.ok(outcome instanceof Error, "the human edit must invalidate the original association"); assert.match(outcome.message, /卡片已经变化/);
      assert.deepEqual(cards.get(project.project_id, subject), edited, "the human edit persists with no adoption decision");
      assert.deepEqual(cards.get(project.project_id, neighbour.subject), neighbour);
      return;
    }
    const adopted = await invoke(knowledgeManageActions.bind, input) as KnowledgeCardRecord;
    assert.equal(adopted.state, "listed"); assert.equal(adopted.retention, undefined); assert.equal(adopted.adoption?.generation, "generation-1");
    assert.equal(adopted.brief, original.brief); assert.deepEqual(adopted.outline, original.outline);
    assert.deepEqual(await invoke(knowledgeManageActions.bind, input), adopted);
    await assert.rejects(invoke(knowledgeManageActions.bind, { ...input, source_revision: "changed" }));
    const visible = await invoke(knowledgeActions.list, {}) as KnowledgeListResponse;
    const item = visible.pieces.find(card => card.subject.id === subject.id); assert.ok(item); assert.equal(item.brief, null); assert.deepEqual(item.keywords, ["HumanKeyword"]);
    assert.deepEqual(cards.get(project.project_id, neighbour.subject), neighbour);
    await host.close(); cards.close(); host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }); cards = openKnowledgeCards({ homeDirectory: home }); unregister = () => {};
    await register("generation-1"); await invoke(knowledgeManageActions.cards, {});
    const beforeReplay = cards.get(project.project_id, subject); await invoke(knowledgeManageActions.bind, input); assert.deepEqual(cards.get(project.project_id, subject), beforeReplay);
    await register("generation-2");
    await assert.rejects(invoke(knowledgeManageActions.bind, input));
    assert.equal((await invoke(knowledgeActions.list, {}) as KnowledgeListResponse).pieces.some(card => card.subject.id === subject.id), false);
    assert.deepEqual(cards.get(project.project_id, subject), beforeReplay);
  } finally { await host.close(); cards.close(); }
  });
});
