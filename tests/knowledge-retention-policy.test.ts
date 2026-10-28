import { AssistantService, AssistantStore, LocalHost, assistantAuthority } from "@molis-ai/molis-work-app-local-host";
import { knowledgeActions, KNOWLEDGE_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/knowledge";
import { createServer } from "node:http";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, isDispatchRefusal } from "@molis-ai/molis-work-service-agent-host";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ActionError, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, subjectContext, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineSubjectRetentionAction } from "@molis-ai/molis-work-plugin-sdk";
import { KnowledgeCards, KnowledgeOrganizer, KnowledgeService, knowledgeCatalog, type KnowledgeAccess, type KnowledgeServiceOptions } from "@molis-ai/molis-work-service-knowledge";
import { SearchService, readSubjectRetention } from "@molis-ai/molis-work-service-search";
import { openKnowledgeCards, openTextSearchIndex } from "@molis-ai/molis-work-storage";
import type { AgentActionClient } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { KnowledgeCardState, KnowledgeListRequest } from "@molis-ai/molis-work-contracts/services/knowledge";

// Register cleanup before listening or awaiting Runtime initialization: a rejected initialization must not keep this file alive.
async function listenModel(t: import("node:test").TestContext, model: ReturnType<typeof createServer>): Promise<void> {
  t.after(async () => {
    model.closeAllConnections();
    if (model.listening) await new Promise<void>((resolve, reject) => model.close(error => error ? reject(error) : resolve()));
  });
  await new Promise<void>((resolve, reject) => { model.once("error", reject); model.listen(0, "127.0.0.1", resolve); });
}
function nativeAdapter(t: import("node:test").TestContext, options: Parameters<typeof createPrologueNodeAdapter>[0]) {
  const opening = createPrologueNodeAdapter(options);
  t.after(() => opening.close());
  return opening;
}

async function fixture(t: import("node:test").TestContext) {
  const home = await mkdtemp(join(tmpdir(), "retention-policy-"));
  const db = new DatabaseSync(join(home, "owner.db"));
  db.exec("CREATE TABLE notes (id TEXT PRIMARY KEY, state TEXT, revision TEXT, operation TEXT)");
  const entries = defineSearchEntriesAction("notes.entries", [{ kind: "note", title: "笔记", surface: "notes" }], "笔记", ["notes:read"]);
  const reader = defineSubjectContextAction("notes.read", "note", "笔记", ["notes:read"]);
  const retention = defineSubjectRetentionAction("notes.retention", "note", "笔记", ["notes:read"]);
  const actions = new ActionService();
  let generation: string | undefined = "install-1", unavailable = false;
  const row = (id: string) => {
    return db.prepare("SELECT * FROM notes WHERE id = ?").get(id);
  };
  let unregister = () => {};
  const register = () => {
    unregister();
    unregister = actions.registerProvider({ provider: { provider_id: "notes", title: "Notes", kind: "plugin", plugin_id: "notes", project_id: "a",
      ...(generation ? { plugin_installation_generation: generation } : {}) },
      availability: () => unavailable ? { available: false, code: "notes.unavailable", reason: "unavailable" } : { available: true },
      definitions: [entries, reader, retention], handlers: [
        bindSearchEntriesHandler(entries, () => (db.prepare("SELECT * FROM notes WHERE state = 'active'").all()).map(note => ({ subject: { kind: "note", id: String(note.id) },
          title: `Note ${note.id} ${note.revision}`, summary: "summary", revision: `${note.revision}:${note.operation}`, content: "context" as const, updated_at: null, open: null }))),
        { ...reader, handle: (_caller, input) => {
          const id = (input as { subject_id: string }).subject_id, note = row(id);
          if (!note || note.state !== "active") throw new ActionError("notes.hidden", "hidden");
          return subjectContext({ subject: { kind: "note", id }, revision: String(note.revision), title: `Note ${id} ${note.revision}`, content: `Body ${id} ${note.revision}` });
        } },
        { ...retention, handle: (_caller, input) => {
          const id = (input as { subject_id: string }).subject_id, note = row(id), subject = { kind: "note", id };
          if (!note) return { subject, state: "deleted", retained: null };
          return note.state === "archived" ? { subject, state: "temporarily_archived", retained: { content_revision: String(note.revision), restoration_operation_id: null } }
            : { subject, state: "active", current_revision: null, retained: note.operation ? { content_revision: String(note.revision), restoration_operation_id: String(note.operation) } : null };
        } },
      ] });
  };
  register();
  const caller: ActionCallContext = { actor_id: "web-user", project_id: "a", audience: "user", permissions: ["notes:read", "search:read", "knowledge:read"] };
  const access: KnowledgeAccess = { caller, client: actions };
  let cards = openKnowledgeCards({ homeDirectory: home }), index = openTextSearchIndex({ homeDirectory: home });
  const search = new SearchService({ index, freshMs: 60_000, budgetMs: 5_000, indexer: async () => access });
  const organizer = () => new KnowledgeOrganizer({ store: cards, catalog: async () => knowledgeCatalog(index, "a"), writer: () => null,
    retention: identity => readSubjectRetention(access, identity) });
  const knowledge = (options: Partial<KnowledgeServiceOptions> = {}) => new KnowledgeService({ cards, search: (access, input) => search.query(access, input),
    retention: (access, identity, views) => readSubjectRetention(access, identity, views), ...options });
  t.after(async () => { await search.close(); cards.close(); index.close(); db.close(); await rm(home, { recursive: true, force: true }); });
  return { home, db, access, actions, search, organizer, knowledge,
    get cards() { return cards; }, get index() { return index; },
    async reopen() { cards.close(); cards = openKnowledgeCards({ homeDirectory: home }); },
    bind(value: string | undefined) { generation = value; register(); },
    unavailable(value: boolean) { unavailable = value; }, fault(value: boolean) { db.exec(value ? "ALTER TABLE notes RENAME TO notes_offline" : "ALTER TABLE notes_offline RENAME TO notes"); },
    add(id: string) { db.prepare("INSERT INTO notes VALUES (?, 'active', 'content-1', NULL)").run(id); },
    state(id: string, state: string, operation: string | null = null) { db.prepare("UPDATE notes SET state = ?, operation = ? WHERE id = ?").run(state, operation, id); },
  };
}

const subject = (id: string) => ({ kind: "note", id });

test("MEM-KNOWLEDGE-BATCH-01 paged selection and its complete tail use linearly many real Store reads", async t => {
  const f = await fixture(t);
  let reads = 0;
  const counted = { ...f.cards, get: (...args: Parameters<typeof f.cards.get>) => { reads++; return f.cards.get(...args); } };
  const knowledge = f.knowledge({ cards: counted });
  const measured: number[] = [];
  for (const size of [16, 32]) {
    for (let index = size / 2; index < size; index++) f.add(`batch-${index}`);
    // The first half starts empty; both samples have the stated total number of real notes.
    if (size === 16) for (let index = 0; index < 8; index++) f.add(`batch-${index}`);
    await f.search.rebuild(f.access, { scope: "project" });
    await f.organizer().reconcile("a");
    assert.equal(f.cards.list("a").length, size);
    reads = 0;
    const result = await knowledge.list(f.access, { limit: 1 });
    assert.equal(result.total, size); assert.equal(result.pieces.length, 1);
    assert.ok(reads >= size, "a page must still check the original cards outside that page");
    assert.ok(reads <= size * 4, `whole-batch verification must not multiply Store reads by the page population: ${reads}/${size}`);
    measured.push(reads);
  }
  assert.ok(measured[1]! <= measured[0]! * 2 + 4, "doubling the real catalog must not square the verification reads");
});

test("MEM-KNOWLEDGE-BATCH-02 a first card replaced while a later retention read finishes is omitted, not borrowed", async t => {
  const f = await fixture(t); f.add("first"); f.add("later");
  await f.search.rebuild(f.access, { scope: "project" }); await f.organizer().reconcile("a");
  const ordered = f.cards.list("a"), first = ordered[0]!, later = ordered[1]!;
  let readFirst = false, changed = false;
  const replacement = { ...first, title: "Replacement card after the first owner read", edited: ["title" as const] };
  const knowledge = f.knowledge({ retention: async (access, identity, views) => {
    const state = await readSubjectRetention(access, identity, views);
    if (identity.subject.id === first.subject.id) readFirst = true;
    if (identity.subject.id === later.subject.id) {
      assert.equal(readFirst, true);
      f.cards.put(replacement); changed = true;
    }
    return state;
  } });
  const result = await knowledge.list(f.access, {});
  assert.equal(changed, true);
  assert.deepEqual(result.pieces.map(card => card.subject), [later.subject]);
  assert.deepEqual(f.cards.get("a", first.subject), replacement, "omitting the old observation does not remove the newer card");
});

for (const mutation of ["edit", "exclude"] as const) {
  test(`MEM-KNOWLEDGE-BATCH-02 list rejects an off-page ${mutation} after preparing and selecting its batch`, async t => {
    const f = await fixture(t); f.add("first"); f.add("outside");
    await f.search.rebuild(f.access, { scope: "project" }); await f.organizer().reconcile("a");
    const first = (await f.knowledge().list(f.access, { limit: 1 })).pieces[0]!;
    const outside = f.cards.list("a").find(card => card.subject.id !== first.subject.id)!;
    const before = f.cards.list("a");
    let changed = false;
    const knowledge = f.knowledge({ related: () => {
      // This public ranking port runs after eligibility and list materialization, before the returned page's tail.
      f.cards.put(mutation === "edit" ? { ...outside, brief: "Human edit outside the page", edited: ["brief"] } : { ...outside, excluded: true });
      changed = true;
      return [];
    } });
    await assert.rejects(knowledge.list(f.access, { limit: 1, related_to: "Body" }), { code: "knowledge.unreadable" });
    assert.equal(changed, true);
    assert.deepEqual(f.cards.get("a", first.subject), before.find(card => card.subject.id === first.subject.id));
    assert.equal(f.cards.receipts("a", { limit: 10, offset: 0 }).total, 0);
  });

  test(`MEM-KNOWLEDGE-BATCH-02 grep cut selection rejects a different shown card's ${mutation} before reading bodies`, async t => {
    const f = await fixture(t); f.add("first"); f.add("outside");
    await f.search.rebuild(f.access, { scope: "project" }); await f.organizer().reconcile("a");
    const outside = f.cards.get("a", subject("outside"))!;
    const knowledge = f.knowledge({ cut: () => [subject("first")] });
    const prepare = knowledge.visible.bind(knowledge);
    let changed = false, bodyReads = 0;
    t.mock.method(knowledge, "visible", async (...args: Parameters<KnowledgeService["visible"]>) => {
      const visible = await prepare(...args);
      // Keep the actual prepared result and guard. The competing SQLite write occurs only when selection consumes it.
      return Object.assign((card: Parameters<typeof visible>[0]) => {
        const allowed = visible(card);
        if (allowed && card.subject.id === outside.subject.id && !changed) {
          f.cards.put(mutation === "edit" ? { ...outside, brief: "Changed during cut selection", edited: ["brief"] } : { ...outside, excluded: true });
          changed = true;
        }
        return allowed;
      }, { assertCurrent: visible.assertCurrent });
    });
    const invoke = f.actions.invoke.bind(f.actions);
    const access = { ...f.access, client: {
      discover: (...args: Parameters<typeof f.actions.discover>) => f.actions.discover(...args),
      captureSources: (...args: Parameters<typeof f.actions.captureSources>) => f.actions.captureSources(...args),
      invoke: (...args: Parameters<typeof f.actions.invoke>) => {
        if (args[1].capability_id === "notes.read") bodyReads++;
        return invoke(...args);
      },
    } };
    await assert.rejects(knowledge.grep(access, { pattern: "word-absent-from-every-note" }), { code: "knowledge.unreadable" });
    assert.equal(changed, true); assert.equal(bodyReads, 0, "cut selection fails before any selected body is consumed");
    assert.equal(f.cards.receipts("a", { limit: 10, offset: 0 }).total, 0);
  });
}

test("MEM-40 S-71 retention hides every current Knowledge read and preserves cards through owner faults, permission loss and installation changes", async t => {
  const f = await fixture(t); f.add("one");
  const hit = (await f.search.query(f.access, { query: "Body", scope: "project" })).hits[0]!;
  await f.organizer().reconcile("a");
  const original = f.cards.get("a", subject("one"))!;
  assert.equal(original.revision, "content-1"); assert.notEqual(hit.revision, original.revision, "list revision never replaces the body's version");
  assert.equal((await f.knowledge().search(f.access, { query: "Body" })).cards[0]!.revision, original.revision,
    "Knowledge search returns the card's content revision while Search keeps the collection refresh revision");
  f.cards.put({ ...original, state: "ready", organized_revision: original.revision, brief: "CardOnlyWord", edited: ["brief"] });
  const kept = f.cards.get("a", subject("one"))!;
  const hidden = async () => {
    const knowledge = f.knowledge(), views = await f.actions.discover(f.access.caller);
    assert.equal((await f.search.query(f.access, { query: "Body", scope: "project" })).hits.length, 0);
    assert.equal((await knowledge.list(f.access, {})).total, 0);
    assert.equal((await knowledge.search(f.access, { query: "CardOnlyWord" })).cards.length, 0);
    assert.equal((await knowledge.catalog("a", views, "Body", f.access)).total, 0);
    assert.equal((await knowledge.tally("a", views, f.access)).total, 0);
    await assert.rejects(() => knowledge.read(f.access, { subject: subject("one") }));
    await assert.rejects(() => knowledge.outline(f.access, { subject: subject("one") }));
    assert.equal((await knowledge.grep(f.access, { pattern: "Body", subjects: [subject("one")] })).matches.length, 0);
    await f.organizer().reconcile("a"); assert.deepEqual(f.cards.get("a", subject("one")), kept);
  };
  f.state("one", "archived"); await hidden(); await f.reopen(); await hidden();
  f.state("one", "active", "restore-1");
  f.fault(true); await hidden(); f.fault(false);
  f.unavailable(true); await hidden(); f.unavailable(false);
  f.bind("install-2"); await hidden();
  f.bind(undefined); await hidden();
  f.bind("install-1");
  assert.equal((await f.knowledge().list({ ...f.access, caller: { ...f.access.caller, permissions: [] } }, {})).total, 0);
  assert.equal((await readSubjectRetention({ ...f.access, caller: { ...f.access.caller, project_id: "b" } }, { project_id: "a", provider_id: "notes", subject: subject("one"), retention: kept.retention })).state, "unavailable");
  f.db.prepare("DELETE FROM notes WHERE id = ?").run("one"); await f.organizer().reconcile("a");
  assert.equal(f.cards.get("a", subject("one")), null); assert.equal(f.cards.search("a", "CardOnlyWord", 20).length, 0, "confirmed same-generation deletion clears card FTS too");
  assert.equal((await f.search.open(f.access, { hit_id: hit.hit_id })).state, "missing");
  assert.equal(f.index.documents("a").length, 0);
});

test("MEM-40 restored states consume one operation durably; explicit context organizing survives reconcile while summary cards stay listed", async t => {
  const f = await fixture(t);
  const states: KnowledgeCardState[] = ["ready", "failed", "over_quota", "pending"];
  for (const state of states) f.add(state);
  await f.search.query(f.access, { query: "Body", scope: "project" }); await f.organizer().reconcile("a");
  for (const state of states) {
    const card = f.cards.get("a", subject(state))!;
    f.cards.put({ ...card, state, organized_revision: state === "ready" ? card.revision : null });
    f.state(state, "archived");
  }
  await f.organizer().reconcile("a");
  for (const state of states) f.state(state, "active", "restore-1");
  await f.organizer().reconcile("a"); await f.reopen(); await f.organizer().reconcile("a");
  f.add("never-card"); f.state("never-card", "active", "restore-never");
  await f.search.rebuild(f.access, { scope: "project" }); await f.organizer().reconcile("a");
  assert.equal(f.cards.get("a", subject("never-card"))!.state, "listed", "first sight after same-content restoration never auto queues");
  for (const state of states) assert.equal(f.cards.get("a", subject(state))!.state, state === "pending" ? "listed" : state);
  const pending = f.cards.get("a", subject("pending"))!;
  assert.equal(pending.retention?.restoration_operation_id, "restore-1"); assert.equal(pending.can_organize, true);
  const organizer = f.organizer(), manage = new KnowledgeCards(f.cards, organizer);
  assert.equal(manage.organize(f.access.caller, { subjects: [pending.subject] }).queued, 1);
  await organizer.kick("a"); assert.equal(f.cards.get("a", pending.subject)!.state, "pending", "same restore does not undo explicit organizing");
  const summary = { ...pending, subject: subject("summary"), content_policy: "summary" as const, can_organize: false };
  f.cards.put(summary); assert.equal(organizer.queue("a", [summary.subject], false), 0);
  f.db.prepare("UPDATE notes SET revision = 'content-2' WHERE id = 'ready'").run();
  await f.search.rebuild(f.access, { scope: "project" }); await organizer.reconcile("a");
  assert.equal(f.cards.get("a", subject("ready"))!.state, "pending", "new body content may be organized normally");
});

test("MEM-40 S-71 the actual prepared catalog guard rejects archive, permission and generation after material validation during credential preparation with zero provider requests", { timeout: 60_000 }, async t => {
  for (const change of ["archive", "permission", "generation"] as const) await t.test(change, async t => {
    const f = await fixture(t); f.add("guarded");
    await f.search.query(f.access, { query: "Body", scope: "project" }); await f.organizer().reconcile("a");
    const knowledge = f.knowledge();
    f.actions.registerProvider({ provider: { provider_id: KNOWLEDGE_PROVIDER_ID, title: "Knowledge", kind: "system" },
      definitions: [knowledgeActions.list], handlers: [{ ...knowledgeActions.list, handle: (caller, input) => knowledge.list({ ...f.access, caller }, input as KnowledgeListRequest) }] });
    let allowed = true;
    const views = () => f.actions.discover({ ...f.access.caller, audience: "agent", permissions: allowed ? f.access.caller.permissions : [] });
    const catalog = await knowledge.catalog("a", await views(), "Body", f.access);
    assert.equal(catalog.pieces.length, 1); assert.ok(catalog.beforeDispatch);
    const card = f.cards.get("a", subject("guarded"))!;
    let requests = 0;
    const model = createServer((_request, response) => { requests++; response.writeHead(500); response.end(); });
    await listenModel(t, model);
    const address = model.address(); assert.ok(address && typeof address !== "string");
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    t.after(() => { release.resolve(); });
    t.signal.addEventListener("abort", () => release.resolve(), { once: true });
    let materialChecked = false, held = false;
    const adapter = await nativeAdapter(t, { app: { appId: "io.molis.retention-guard", appVersion: "1.0.0" }, storageRoot: join(f.home, "runtime") });
    try {
      const pending = adapter.inference.completeText({ protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`,
        model: "fixture", prompt: JSON.stringify(catalog.pieces), credential_ref: "fixture",
        resolveCredential: async () => {
          // Preparation first validates the actual catalog, then resolves credentials. Revoke while that real await is open.
          // Organizer settlement branches are covered by the production Web test.
          if (materialChecked && !held) { held = true; entered.resolve(); await release.promise; }
          return "fixture-only";
        },
        beforeDispatch: async () => { await catalog.beforeDispatch!(await views()); materialChecked = true; }, max_output_tokens: 50, timeout_ms: 10_000 });
      const rejected = assert.rejects(pending, error => isDispatchRefusal(error));
      await Promise.race([entered.promise, pending.then(() => { throw new Error("validated-material credential gate not reached"); })]);
      assert.equal(requests, 0, "the credential barrier precedes the actual request");
      if (change === "archive") f.state("guarded", "archived");
      if (change === "permission") allowed = false;
      if (change === "generation") f.bind("install-2");
      release.resolve(); await rejected;
      assert.equal(requests, 0, "the real loopback model server received no request after the source changed");
      assert.deepEqual(f.cards.get("a", subject("guarded")), card, "refused dispatch leaves the original card intact");
    } finally {
      release.resolve(); await adapter.close();
      model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve()));
    }
  });
});

test("MEM-40 S-71 Assistant prepared Knowledge directory is fenced again at actual model dispatch", { timeout: 60_000 }, async t => {
  for (const change of ["archive", "permission"] as const) await t.test(change, async t => {
    const f = await fixture(t); f.add("assistant-material");
    await f.search.query(f.access, { query: "Body", scope: "project" }); await f.organizer().reconcile("a");
    const knowledge = f.knowledge();
    f.actions.registerProvider({ provider: { provider_id: KNOWLEDGE_PROVIDER_ID, title: "Knowledge", kind: "system" },
      definitions: [knowledgeActions.list], handlers: [{ ...knowledgeActions.list, handle: (caller, input) => knowledge.list({ ...f.access, caller }, input as KnowledgeListRequest) }] });
    const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
    t.after(() => local.close());
    const reviews = new AgentReviewQueue(), host = new AgentHost({ reviews });
    let requests = 0;
    const model = createServer((_request, response) => { requests++; response.writeHead(500); response.end(); });
    await listenModel(t, model);
    const address = model.address(); assert.ok(address && typeof address !== "string");
    const adapter = await nativeAdapter(t, { app: { appId: "io.molis.retention-assistant", appVersion: "1.0.0" }, storageRoot: join(f.home, "assistant-sdk"), reviewQueue: reviews,
      modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/messages`, model: "fixture", credential_ref: "fixture" }),
      resolveCredential: () => "fixture-only" });
    host.register(adapter);
    const db = new DatabaseSync(":memory:");
    t.after(() => db.close());
    const store = new AssistantStore(db);
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    t.after(() => { release.resolve(); });
    t.signal.addEventListener("abort", () => release.resolve(), { once: true });
    let allowed = true, prepared = false, waited = false;
    const currentActions = (validate?: () => void | Promise<void>): AgentActionClient => {
      const caller = (): ActionCallContext => ({ ...f.access.caller, audience: "agent", permissions: allowed ? f.access.caller.permissions : [], validate_authority: validate });
      return {
        discover: async () => { await validate?.(); return f.actions.discover(caller()); },
        invoke: (reference, input, signal) => f.actions.invoke({ ...caller(), signal }, reference, input),
      };
    };
    const assistant = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
      authority: async work => ({ ...assistantAuthority(local, work, () => new Set()), actions: async (_runtime, validate) => currentActions(validate), beforeDispatch: async () => {
        if (!waited) { waited = true; assert.ok(prepared, "the real round already prepared its Knowledge input"); entered.resolve(); await release.promise; }
      } }), projectTitle: async () => "Project", knowledgeCatalog: async (project, views, words) => {
        const catalog = await knowledge.catalog(project, views, words, f.access);
        assert.equal(catalog.pieces.length, 1); prepared = true; return catalog;
      } }, "web-user");
    t.after(() => { assistant.continuations.close(); });
    try {
      const sending = assistant.send({ text: "Read the project knowledge", request_id: `retention-${change}` }, { project_ref: { project_id: "a", storage_key: "memory:a" } });
      const settled = sending.then(value => ({ value }), error => ({ error }));
      await Promise.race([entered.promise, settled.then(result => { if ("error" in result) throw result.error; return entered.promise; })]);
      assert.equal(requests, 0, "the actual prepared-round dispatch barrier precedes any model request");
      if (change === "archive") f.state("assistant-material", "archived"); else allowed = false;
      release.resolve();
      const result = await settled;
      if ("value" in result) {
        assert.ok(result.value.run_id);
        for (const deadline = Date.now() + 15_000;;) {
          const work = store.get("web-user", result.value.work.work_id);
          if (work.session_id) {
            const run = await adapter.read({ session_id: work.session_id, runtime_id: "prologue", run_id: result.value.run_id });
            if (["failed", "cancelled", "completed"].includes(run.phase)) { assert.notEqual(run.phase, "completed"); break; }
          }
          assert.ok(Date.now() < deadline, "the refused real Run terminates"); await new Promise(resolve => setTimeout(resolve, 20));
        }
      }
      assert.equal(requests, 0, "prepared Knowledge never reached the actual model server after archive or Agent permission loss");
    } finally {
      release.resolve(); assistant.continuations.close(); await adapter.close(); await local.close();
      model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve()));
    }
  });
});


test("MEM-40 S-71 a returned search hit cannot survive deletion or borrow a replacement card's visibility", async t => {
  for (const change of ["deleted", "replaced", "excluded"] as const) await t.test(change, async t => {
    const f = await fixture(t); f.add("search-race");
    await f.search.query(f.access, { query: "Body", scope: "project" }); await f.organizer().reconcile("a");
    const original = f.cards.get("a", subject("search-race"))!;
    const knowledge = f.knowledge({ requireCard: true,
      search: async (access, input) => {
        const result = await f.search.query(access, input);
        assert.equal(result.hits.length, 1);
        if (change === "deleted") f.db.prepare("DELETE FROM notes WHERE id = ?").run("search-race");
        return result;
      },
      retention: async (access, identity, views) => {
        const result = await readSubjectRetention(access, identity, views);
        if (change === "replaced") f.cards.put({ ...original, provider_id: "another-provider", source_key: "another-source", retention: { source_identity: { kind: "plugin-installation", generation: "install-2" }, restoration_operation_id: null } });
        if (change === "excluded") f.cards.put({ ...original, excluded: true });
        return result;
      } });
    assert.deepEqual((await knowledge.search(f.access, { query: "Body" })).cards, []);
    if (change === "deleted") assert.equal(f.cards.get("a", original.subject), null);
    else assert.notDeepEqual(f.cards.get("a", original.subject), original);
  });
});

test("MEM-40 S-71 never-card read and grep retain the original reader generation across beforeEffect", async t => {
  for (const method of ["read", "grep"] as const) for (const change of ["archive", "generation", "permission"] as const) await t.test(`${method} ${change}`, async t => {
    const f = await fixture(t); f.add("unindexed");
    let allowed = true;
    const access: KnowledgeAccess = { ...f.access, caller: { ...f.access.caller,
      validate_authority: () => { if (!allowed) throw new ActionError("actions.permission_denied", "revoked"); },
      assert_authority_current: () => { if (!allowed) throw new ActionError("actions.permission_denied", "revoked"); } },
      beforeEffect: async () => {
        assert.equal(f.cards.get("a", subject("unindexed")), null);
        if (change === "archive") f.state("unindexed", "archived");
        if (change === "generation") f.bind("install-2");
        if (change === "permission") allowed = false;
      } };
    if (method === "read") await assert.rejects(() => f.knowledge().read(access, { subject: subject("unindexed") }));
    else {
      const result = await f.knowledge().grep(access, { pattern: "Body", subjects: [subject("unindexed")] });
      assert.deepEqual(result.matches, []); assert.deepEqual(result.found, []); assert.equal(result.unread.length, 1);
    }
    assert.equal(f.cards.get("a", subject("unindexed")), null, "a read does not create a card to manufacture a binding");
    assert.equal(f.cards.receipts("a", { limit: 10, offset: 0 }).total, 0);
  });
});

test("MEM-40 S-71 normal refresh clears an archived then truly deleted subject even when collection revision and the unrelated query do not change", async t => {
  const f = await fixture(t); f.add("purged");
  await f.search.query(f.access, { query: "Body", scope: "project" }); await f.organizer().reconcile("a");
  const original = f.cards.get("a", subject("purged"))!;
  const count = () => {
    const db = new DatabaseSync(join(f.home, "search", "search.db"), { readOnly: true });
    try { return Number(db.prepare("SELECT COUNT(*) AS total FROM search_fts WHERE search_fts MATCH 'Body'").get()!.total); }
    finally { db.close(); }
  };
  f.state("purged", "archived"); f.search.markChanged("notes", "a");
  assert.equal((await f.search.query(f.access, { query: "UnrelatedWord", scope: "project" })).hits.length, 0);
  assert.equal(f.index.documents("a").length, 1); assert.equal(count(), 1);
  f.db.prepare("DELETE FROM notes WHERE id = ?").run("purged"); f.search.markChanged("notes", "a");
  assert.equal((await f.search.query(f.access, { query: "UnrelatedWord", scope: "project" })).hits.length, 0);
  assert.equal(f.index.documents("a").length, 0); assert.equal(count(), 0);
  assert.deepEqual(f.cards.get("a", original.subject), original, "Search cleanup does not depend on pre-clearing the Knowledge card");
  await f.organizer().reconcile("a"); assert.equal(f.cards.get("a", original.subject), null);
});

test("MEM-40 S-71 locate fences its actual section trees at native dispatch and rejects an archived inflight selection", { timeout: 60_000 }, async t => {
  for (const scenario of ["archive-before", "permission-before", "archive-after"] as const) await t.test(scenario, async t => {
    const f = await fixture(t); f.add("located");
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    t.after(() => { release.resolve(); });
    t.signal.addEventListener("abort", () => release.resolve(), { once: true });
    let requests = 0, materialChecked = false, held = false, allowed = true, answer = "";
    const model = createServer(async (request, response) => {
      for await (const _chunk of request) { /* Count the actual complete request, including unexpected retries. */ }
      requests++;
      if (scenario === "archive-after") { entered.resolve(); await release.promise; }
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: answer }, finish_reason: null }] })}\n\n`
        + 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
    });
    await listenModel(t, model);
    const address = model.address(); assert.ok(address && typeof address !== "string");
    const adapter = await nativeAdapter(t, { app: { appId: "io.molis.retention-locate", appVersion: "1.0.0" }, storageRoot: join(f.home, "locate-sdk") });
    const access: KnowledgeAccess = { ...f.access, caller: { ...f.access.caller,
      validate_authority: () => { if (!allowed) throw new ActionError("actions.permission_denied", "revoked"); },
      assert_authority_current: () => { if (!allowed) throw new ActionError("actions.permission_denied", "revoked"); } } };
    try {
      const pending = f.knowledge().locate(access, { question: "Which section has Body?", subjects: [subject("located")] }, async (input, control) => {
        assert.equal(input.pieces.length, 1); assert.ok(control);
        answer = JSON.stringify({ sections: [{ piece: 1, anchor: input.pieces[0]!.sections[0]!.anchor, reason: "Original selection" }] });
        const text = await adapter.inference.completeText({ protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`,
          model: "fixture", prompt: JSON.stringify(input), credential_ref: "fixture",
          beforeDispatch: async () => { await control.beforeDispatch(); materialChecked = true; }, afterResult: control.afterResult,
          resolveCredential: async () => {
            if (scenario !== "archive-after" && materialChecked && !held) { held = true; entered.resolve(); await release.promise; }
            return "fixture-only";
          }, max_output_tokens: 100, timeout_ms: 10_000 });
        return JSON.parse(text);
      });
      const rejected = assert.rejects(pending);
      await Promise.race([entered.promise, pending.then(() => { throw new Error("locate completed without reaching its real boundary"); })]);
      assert.equal(requests, scenario === "archive-after" ? 1 : 0);
      if (scenario === "permission-before") allowed = false; else f.state("located", "archived");
      release.resolve(); await rejected;
      assert.equal(requests, scenario === "archive-after" ? 1 : 0, "no additional request and no old section/reason returned");
      assert.equal(f.cards.get("a", subject("located")), null);
      assert.equal(f.cards.receipts("a", { limit: 10, offset: 0 }).total, 0);
    } finally {
      release.resolve(); await adapter.close(); model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve()));
    }
  });
});


test("MEM-40 S-71 grep checks the original never-card read after asynchronous reference bookkeeping", async t => {
  const f = await fixture(t); f.add("reference-race");
  const result = await f.knowledge().grep(f.access, { pattern: "Body", subjects: [subject("reference-race")] }, async subjects => {
    assert.deepEqual(subjects, [subject("reference-race")]);
    await f.search.query(f.access, { query: "Body", scope: "project" }); await f.organizer().reconcile("a");
    f.state("reference-race", "archived");
  });
  assert.deepEqual(result.matches, []); assert.deepEqual(result.found, []); assert.equal(result.unread.length, 1);
  assert.equal(f.cards.receipts("a", { limit: 10, offset: 0 }).total, 0);
});


test("MEM-40 S-71 restoring R2 over an organized R1 invalidates machine material, preserves human fields and drains the real queue with zero new model requests", { timeout: 60_000 }, async t => {
  const f = await fixture(t); for (const id of ["stale", "edited"]) f.add(id);
  let requests = 0;
  const model = createServer(async (request, response) => {
    for await (const _chunk of request) { /* Every real model request, including retries, is counted. */ }
    requests++;
    const text = JSON.stringify({ title: "Machine R1 title", brief: "Machine R1 brief", keywords: ["MachineR1"], sections: [] });
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}\n\n`
      + 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await listenModel(t, model);
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const adapter = await nativeAdapter(t, { app: { appId: "io.molis.retention-stale-card", appVersion: "1.0.0" }, storageRoot: join(f.home, "organize-sdk") });
  const organizer = () => new KnowledgeOrganizer({ store: f.cards, catalog: async () => knowledgeCatalog(f.index, "a"),
    retention: identity => readSubjectRetention(f.access, identity), writer: () => async (input, signal, control) => JSON.parse(await adapter.inference.completeText({
      protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`, model: "fixture", prompt: JSON.stringify(input),
      credential_ref: "fixture", resolveCredential: () => "fixture-only", signal, ...(control ? { beforeDispatch: control.beforeDispatch, afterResult: control.afterResult } : {}),
      max_output_tokens: 200, timeout_ms: 10_000 })) });
  try {
    await f.search.query(f.access, { query: "Body", scope: "project" }); await organizer().kick("a");
    assert.equal(requests, 2); assert.equal(f.cards.get("a", subject("stale"))!.state, "ready");
    new KnowledgeCards(f.cards, organizer()).edit(f.access.caller, { subject: subject("edited"), title: "Human title", brief: "Human brief", keywords: ["HumanKey"] });
    for (const id of ["stale", "edited"]) {
      f.db.prepare("UPDATE notes SET revision = 'content-2' WHERE id = ?").run(id);
      f.state(id, "archived");
      assert.equal(f.cards.get("a", subject(id))!.revision, "content-1", "the source changed and archived before its next index read");
    }
    f.search.markChanged("notes", "a"); await f.search.query(f.access, { query: "UnrelatedWord", scope: "project" }); await organizer().kick("a");
    assert.equal(requests, 2);
    for (const id of ["stale", "edited"]) f.state(id, "active", "restore-r2");
    f.search.markChanged("notes", "a"); await f.search.query(f.access, { query: "Body", scope: "project" });
    await organizer().kick("a"); await f.reopen(); await organizer().kick("a");
    assert.equal(requests, 2, "both normal queue drains and durable re-consumption made no new model request");
    const stale = f.cards.get("a", subject("stale"))!, edited = f.cards.get("a", subject("edited"))!;
    for (const card of [stale, edited]) {
      assert.equal(card.state, "listed"); assert.equal(card.revision, "content-2"); assert.equal(card.retention?.restoration_operation_id, "restore-r2");
      assert.equal(card.organized_revision, null); assert.equal(card.suggestion, null); assert.deepEqual(card.outline, []);
    }
    assert.equal(stale.title, "Note stale content-2"); assert.equal(stale.brief, ""); assert.deepEqual(stale.keywords, []);
    assert.equal(edited.title, "Human title"); assert.equal(edited.brief, "Human brief"); assert.deepEqual(edited.keywords, ["HumanKey"]);
    assert.equal(f.cards.search("a", "MachineR1", 20).length, 0, "stale machine keywords also leave the card FTS");
  } finally { await adapter.close(); model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); }
});

test("MEM-40 S-71 a never-card body cannot acquire a newer installation's identity after its reader returns", async t => {
  const f = await fixture(t); f.add("old-reader");
  let swapped = false;
  const access: KnowledgeAccess = { ...f.access, client: {
    discover: caller => f.actions.discover(caller), captureSources: scopes => f.actions.captureSources(scopes), invoke: async (caller, reference, input) => {
      const value = await f.actions.invoke(caller, reference, input);
      if (reference.capability_id === "notes.read" && !swapped) { swapped = true; f.bind("install-2"); }
      return value;
    },
  } };
  await assert.rejects(() => f.knowledge().read(access, { subject: subject("old-reader") }));
  assert.equal(swapped, true); assert.equal(f.cards.get("a", subject("old-reader")), null);
  assert.equal(f.cards.receipts("a", { limit: 10, offset: 0 }).total, 0);
});
