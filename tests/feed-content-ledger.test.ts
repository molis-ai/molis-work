import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import {
  createEvidenceContentStore,
  createFileSecretStore,
  createLazyFileSecretStore,
  homeSqlitePath,
  openBaselineHomeSqlite,
  PROJECT_SECTIONS_INLINE_ENCODING,
  runWithMolisWorkHome,
  sqliteErrorName,
} from "@molis-ai/molis-work-storage";
import { createProjectEvidenceContent, projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { ATTENTION_SCHEMA_SQL, AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { CONTEXT_LEDGER_SCHEMA, createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import {
  assembleFeedApplication,
  createConnectionWatch,
  createFeedContentLedger,
  createFeedContentLedgerHandlers,
  createFeedHomePlugin,
  FEED_CONTENT_LEDGER_BATCH,
  FEED_FORGET_BATCH,
  FEED_HOME_DATABASE,
  FEED_PLUGIN_ID,
  FEED_PROJECT_DATABASE,
  FEED_UNASSIGNED_BODY_HOLDER,
  feedContentLedgerActions,
  feedManifest,
  holdKeptBodies,
  keepFeedReconcile,
  releaseHeldHistory,
  type FeedApplication,
  type FeedContentLedgerStore,
  type FeedEvidenceCollector,
  type FeedHistoryReleasePorts,
  type FeedReconcilePorts,
} from "@molis-ai/molis-work-plugin-feed";
import {
  FeedModule,
  feedContentReplicationDefinition,
  fromProjectConnection,
  SignalsModule,
  SourcesModule,
} from "@molis-ai/molis-work-plugin-feed/store";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginBackgroundClient, PluginJobControl, PluginManifest, PluginSqlValue, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { feedLedgerPort, unassignedFeedAttention } from "./fixtures/feed-ledger.js";

// RAC-494 and RAC-2718 (the ledger half; the project half comes with Feed's move into the Runtime).

const noEffect = async () => {};
test("QEA-08 connection waits release abort listeners after changes and cancellation without losing a pending change", async () => {
  const watch = createConnectionWatch(), stop = new AbortController();
  for (let index = 0; index < 12; index += 1) {
    const next = watch.next(stop.signal);
    assert.equal(getEventListeners(stop.signal, "abort").length, 1);
    watch.changed();
    await next;
    assert.equal(getEventListeners(stop.signal, "abort").length, 0);
  }
  watch.changed(); watch.changed();
  await watch.next(stop.signal);
  assert.equal(getEventListeners(stop.signal, "abort").length, 0, "changes while busy coalesce into an immediate next pass");
  const cancelled = watch.next(stop.signal);
  assert.equal(getEventListeners(stop.signal, "abort").length, 1, "the pending change was consumed");
  stop.abort();
  await cancelled;
  await watch.next(stop.signal);
  assert.equal(getEventListeners(stop.signal, "abort").length, 0);
});
function libraryAt(file: string, timeout = 5_000) {
  const db = openTestSqlite(file, { timeout });
  const bind = (parameters: readonly PluginSqlValue[] = []) => [...parameters];
  const reader = { get: (sql: string, parameters?: readonly PluginSqlValue[]) => (db.prepare(sql).get(...bind(parameters)) as Record<string, PluginSqlValue> | undefined) ?? null,
    all: (sql: string, parameters?: readonly PluginSqlValue[]) => db.prepare(sql).all(...bind(parameters)) as Record<string, PluginSqlValue>[] };
  const store: FeedContentLedgerStore = { read: reader, async write(beforeEffect, body) {
    await beforeEffect();
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = body({ ...reader, run: (sql, parameters) => ({ changes: db.prepare(sql).run(...bind(parameters)).changes }) });
      db.exec("COMMIT");
      return result;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } };
  return { db, store, rows: () => reader.all("SELECT content_ref, project_id, source_id FROM feed_content_holds ORDER BY content_ref, project_id, source_id") };
}

function fixture(t: import("node:test").TestContext) {
  const home = mkdtempSync(join(tmpdir(), "feed-content-ledger-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const evidence = createEvidenceContentStore({ secretStore: createFileSecretStore(), rootDirectory: join(home, "evidence") });
  const file = join(home, "ledger.db"), library = libraryAt(file);
  library.db.exec(FEED_HOME_DATABASE.schema);
  t.after(() => library.db.close());
  return { home, file, evidence, library, ledger: createFeedContentLedger(library.store, evidence) };
}

test("RAC-494: a body goes only when no source of any project holds it; a release takes only its own source's rows", async t => {
  const f = fixture(t);
  const a = f.evidence.write("body a").contentRef, b = f.evidence.write("body b").contentRef;
  await f.ledger.hold(noEffect, { project_id: "p1", source_id: "s1" }, [a, b]);
  await f.ledger.hold(noEffect, { project_id: "p2", source_id: "s1" }, [a]);
  await f.ledger.hold(noEffect, { project_id: "p1", source_id: "s1" }, [a]);
  assert.equal(f.library.rows().length, 3, "holding again changes nothing");
  assert.deepEqual(await f.ledger.release(noEffect, { project_id: "p1", source_id: "s1" }, [a, b]), { bodies_deleted: 1, bodies_kept: 1, complete: true });
  assert.ok(f.evidence.has(a) && !f.evidence.has(b), "the body another project still holds stays, the one nobody holds goes");
  assert.deepEqual(f.library.rows().map(row => [row.project_id, row.source_id]), [["p2", "s1"]], "only the released source's rows went");
  assert.deepEqual(await f.ledger.release(noEffect, { project_id: "p2", source_id: "s1" }, [a]), { bodies_deleted: 1, bodies_kept: 0, complete: true });
  assert.ok(!f.evidence.has(a));
  assert.deepEqual(f.library.rows(), []);
});

// RAC-1016 (4c-1 condition): a pull that fails after it held bodies leaves holds nobody refers to; the ledger takes them back.
test("RAC-1016: holds a failed pull left behind are taken back: only this source's, only the ones named, and a body goes when nobody else holds it", async t => {
  const f = fixture(t);
  const kept = f.evidence.write("a body the source's rows point at").contentRef, shared = f.evidence.write("a body another project holds").contentRef,
    stray = f.evidence.write("a body only the failed pull held").contentRef;
  const unwritten = "molis-work-evidence/sha256/" + "0".repeat(63) + "1";
  await f.ledger.hold(noEffect, { project_id: "p1", source_id: "s1" }, [kept, shared, stray, unwritten]);
  await f.ledger.hold(noEffect, { project_id: "p2", source_id: "s1" }, [shared]);
  // The pull failed after holding all four; the source's rows point at `kept` only. The named three are the ones it does not point at.
  assert.deepEqual(await f.ledger.reclaim(noEffect, { project_id: "p1", source_id: "s1" }, [shared, stray, unwritten]),
    { holds_released: 3, bodies_deleted: 1, bodies_kept: 1, complete: true });
  assert.ok(f.evidence.has(kept) && f.evidence.has(shared) && !f.evidence.has(stray), "the held-and-pointed-at body and the shared one stay, the stray one goes");
  assert.deepEqual(f.library.rows().map(row => [row.content_ref === kept ? "kept" : row.content_ref === shared ? "shared" : "?", row.project_id, row.source_id]).sort(),
    [["kept", "p1", "s1"], ["shared", "p2", "s1"]], "this source still holds what it points at; the other project still holds its own");
  assert.deepEqual(await f.ledger.reclaim(noEffect, { project_id: "p1", source_id: "s1" }, [shared, stray, unwritten]),
    { holds_released: 0, bodies_deleted: 0, bodies_kept: 1, complete: true }, "taking back twice changes nothing");
  // A source that did not hold it, and a call refused before it begins, change nothing.
  await f.ledger.reclaim(noEffect, { project_id: "p1", source_id: "s9" }, [kept]);
  await assert.rejects(f.ledger.reclaim(async () => { throw new Error("revoked"); }, { project_id: "p1", source_id: "s1" }, [kept]), { message: "revoked" });
  assert.equal(f.library.rows().length, 2);
  assert.ok(f.evidence.has(kept));
});

test("RAC-494: a release that fails part way leaves the ledger as it was, so a row is never missing for a body something points at", async t => {
  const f = fixture(t);
  const a = f.evidence.write("body a").contentRef, b = f.evidence.write("body b").contentRef;
  await f.ledger.hold(noEffect, { project_id: "p1", source_id: "s1" }, [a, b]);
  const failing: FeedEvidenceCollector = { collect(input) {
    const [first] = input.candidates;
    f.evidence.delete(first!);
    throw new Error("disk went away");
  } };
  const broken = createFeedContentLedger(f.library.store, failing);
  await assert.rejects(broken.release(noEffect, { project_id: "p1", source_id: "s1" }, [a, b]), { message: "disk went away" });
  assert.equal(f.library.rows().length, 2, "the source's rows are back: a body already deleted is held by a row too many, never by one too few");
  await assert.rejects(f.ledger.hold(async () => { throw new Error("revoked"); }, { project_id: "p1", source_id: "s2" }, [a]), { message: "revoked" });
  assert.equal(f.library.rows().length, 2, "a hold refused before it begins writes nothing");
  assert.deepEqual(await f.ledger.release(noEffect, { project_id: "p1", source_id: "s1" }, [a, b]), { bodies_deleted: 1, bodies_kept: 0, complete: true }, "a retry finds one of them already gone");
});

// FI-C-06 (specs/archive/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §13): a deletion gives a source's history back in bounded
// batches; a batch not reached yet stays held, and a failure throws so the source stays to be deleted again.
test("FI-C-06: a large history is given back in batches of at most 5000 bodies and 1000 records; a failure part way keeps what is not reached, and deleting again finishes", async t => {
  const f = fixture(t);
  const ref = (n: number) => "molis-work-evidence/sha256/" + n.toString(16).padStart(64, "0");
  const refs = Array.from({ length: FEED_CONTENT_LEDGER_BATCH + 1_001 }, (_, n) => ref(n + 1)), stray = ref(999_999), shared = [refs[0]!, refs[FEED_CONTENT_LEDGER_BATCH + 500]!];
  // The bodies exist until the collector deletes them; it counts what it deleted, so a second deletion of the same body is no deletion.
  const existing = new Set([...refs, stray]);
  const collector: FeedEvidenceCollector = { collect({ candidates, isReferenced }) {
    const deleted: string[] = [], kept: string[] = [];
    for (const candidate of new Set(candidates)) if (isReferenced(candidate)) kept.push(candidate); else if (existing.delete(candidate)) deleted.push(candidate);
    return { deleted, kept };
  } };
  const ledger = createFeedContentLedger(f.library.store, collector), mine = { project_id: "p1", source_id: "s1" };
  await ledger.hold(noEffect, mine, refs.slice(0, FEED_CONTENT_LEDGER_BATCH));
  await ledger.hold(noEffect, mine, [...refs.slice(FEED_CONTENT_LEDGER_BATCH), stray]);
  await ledger.hold(noEffect, { project_id: "p2", source_id: "s1" }, shared);
  const operations = Array.from({ length: 2 * FEED_FORGET_BATCH + 500 }, (_, n) => `op-${n}`), forgotten = new Set<string>();
  const asked: string[] = [];
  let failAt = 2;
  const ports: FeedHistoryReleasePorts = {
    reclaim: async batch => { asked.push(`reclaim:${batch.length}`); if (--failAt === 0) throw new Error("the Home went away"); return ledger.reclaim(noEffect, mine, batch); },
    release: async batch => { asked.push(`release:${batch.length}`); if (--failAt === 0) throw new Error("the Home went away"); return ledger.release(noEffect, mine, batch); },
    forget: async ids => { asked.push(`forget:${ids.length}`); let n = 0; for (const id of ids) if (!forgotten.has(id)) { forgotten.add(id); n += 1; } return { records_deleted: n }; },
  };
  // The held history names a research note too: it is not a body of the ledger's, so no batch carries it.
  const held = { content_refs: [...refs, "research:note-1"], operation_ids: operations };
  await assert.rejects(releaseHeldHistory(held, ports), { message: "the Home went away" });
  assert.deepEqual(asked, [`reclaim:${FEED_CONTENT_LEDGER_BATCH}`, "release:1001"], "the first batch went back, the second failed, and no record was forgotten");
  const holdsOf = (project: string) => f.library.rows().filter(row => row.project_id === project).map(row => row.content_ref as string).sort();
  assert.deepEqual(holdsOf("p1"), [...refs.slice(FEED_CONTENT_LEDGER_BATCH), stray].sort(), "the batch not reached is still held by the source whose rows point at it");
  assert.deepEqual(holdsOf("p2"), [...shared].sort(), "another project's holds are never touched");
  assert.ok(shared.every(body => existing.has(body)), "a body another project holds stays");
  assert.ok(refs.slice(FEED_CONTENT_LEDGER_BATCH).every(body => existing.has(body)), "no body of the batch not reached went");
  assert.equal(refs.slice(1, FEED_CONTENT_LEDGER_BATCH).filter(body => existing.has(body)).length, 0, "the batch given back is gone");
  // Deleting again repeats each step: the batch already given back finds its bodies gone, the rest goes now, and every record is forgotten.
  asked.length = 0;
  assert.deepEqual(await releaseHeldHistory(held, ports), { bodies_deleted: 1_000, bodies_kept: 2, records_deleted: operations.length, complete: true });
  assert.deepEqual(asked, [`reclaim:${FEED_CONTENT_LEDGER_BATCH}`, "release:1001", `forget:${FEED_FORGET_BATCH}`, `forget:${FEED_FORGET_BATCH}`, "forget:500"]);
  assert.deepEqual(holdsOf("p1"), [], "the last batch takes back every hold the source had left, the stray one a failed pull left too");
  assert.deepEqual(holdsOf("p2"), [...shared].sort());
  assert.ok(shared.every(body => existing.has(body)) && existing.has(stray), "shared bodies stay; the stray one was no candidate, so it is kept, not deleted");
  // A forget that fails throws as well, after the bodies: the source stays to be deleted again.
  await assert.rejects(releaseHeldHistory({ content_refs: [], operation_ids: ["op-x"] }, { ...ports, forget: async () => { throw new Error("search went away"); } }), { message: "search went away" });
  // A Feed that may not forget records gives the bodies back and says the history is not all gone.
  assert.deepEqual(await releaseHeldHistory({ content_refs: [], operation_ids: ["op-y"] }, { ...ports, forget: null }), { bodies_deleted: 0, bodies_kept: 0, records_deleted: 0, complete: false });
});

/** A stand-in for a platform or application handle: only the members these cases exercise, the rest absent. */
const standIn = <T extends object>(members: Partial<Record<keyof T, unknown>>): T => members as T;

// FI-C-07 (specs/.../feed-inbox-runtime-plugins.md §13): the job that names a project's kept bodies in the Home's ledger at start does it in
// batches, tries again a bounded number of times while the ledger does not answer, then at each change of a connection until it has worked.
test("FI-C-07: the kept bodies are named in batches; a ledger that does not answer is tried a bounded number of times, then at each change until it works", async t => {
  const ref = (n: number) => "molis-work-evidence/sha256/" + n.toString(16).padStart(64, "0");
  const kept = Array.from({ length: 201 }, (_, n) => ref(n + 1));
  const snapshot = { sources: [{ source_id: "s1" }, { source_id: "s2" }], runs: [{ source_id: "s2", operation_id: "op-1", receipt: { content_refs: [ref(0)] } }],
    feed_items: [{ source_id: "s1", materials: [...kept.map(content_ref => ({ content_ref })), { content_ref: "research:note-1" }] }] };
  let failing = Number.POSITIVE_INFINITY;
  const asked: string[] = [];
  const ports: FeedReconcilePorts = { feed: standIn<FeedApplication>({ sources: { list: () => snapshot.sources }, reads: {
    *projectBodyRefs() {
      const rows = [
        ...snapshot.feed_items[0]!.materials.map(row => ({ source_id: "s1", ref: row.content_ref })),
        { source_id: "s2", ref: ref(0) },
      ];
      for (let offset = 0; offset < rows.length; offset += 200) yield rows.slice(offset, offset + 200);
    },
  } }), projectId: "p1", connections: undefined, commit: async (_control, body) => body(),
    hold: async (sourceId, refs) => {
      if (failing > 0) { failing -= 1; asked.push("refused"); throw new Error("the Home's ledger is unavailable"); }
      assert.ok(refs.every(each => each.startsWith("molis-work-evidence/sha256/")), "only the ledger's own bodies are named");
      asked.push(`${sourceId}:${refs.length}`);
    } };
  const abort = new AbortController();
  t.after(() => abort.abort());
  const control = standIn<PluginJobControl>({ job: "feed-reconcile", signal: abort.signal, beforeEffect: async () => {}, assert_authority_current: () => {} });
  let done: Promise<void> | undefined;
  const background = standIn<PluginBackgroundClient>({ keep: (_job: string, work: (control: PluginJobControl) => Promise<void>) => { done = work(control).catch(() => {}); return { done }; } });
  // Waits for the tries a step should make (a loaded machine may take longer than the delays), then a moment more to see none follows.
  const watch = createConnectionWatch(), settle = async (count: number) => {
    for (const start = Date.now(); asked.length < count && Date.now() - start < 5_000;) await new Promise(resolve => setTimeout(resolve, 5));
    await new Promise(resolve => setTimeout(resolve, 30));
  };
  keepFeedReconcile(background, ports, watch, [1, 1]);
  await settle(3);
  assert.deepEqual(asked, ["refused", "refused", "refused"], "at start: one try and one after each delay, then the job waits instead of swallowing it for good");
  watch.changed();
  await settle(4);
  assert.deepEqual(asked.slice(3), ["refused"], "a change of a connection tries once more");
  failing = 0;
  watch.changed();
  await settle(7);
  assert.deepEqual(asked.slice(4), ["s1:200", "s1:1", "s2:1"], "the ledger back, every kept body is named, in batches it takes");
  watch.changed();
  await settle(7);
  assert.equal(asked.length, 7, "once named, a change names nothing again");
  // At the next start the job names them again, so a library whose ledger entries went missing meanwhile is held again.
  abort.abort();
  await done;
  const again = new AbortController();
  t.after(() => again.abort());
  failing = 1;
  keepFeedReconcile(standIn<PluginBackgroundClient>({ keep: (_job: string, work: (control: PluginJobControl) => Promise<void>) => ({ done: work({ ...control, signal: again.signal }).catch(() => {}) }) }),
    ports, createConnectionWatch(), [1]);
  await settle(11);
  assert.deepEqual(asked.slice(7), ["refused", "s1:200", "s1:1", "s2:1"], "a start the ledger first refuses names them on the next try");
});

test("RAC-494: a hold cannot enter while a release deletes files, so a body is written again or kept, never lost under a new holder", async t => {
  const f = fixture(t);
  const x = f.evidence.write("shared body").contentRef;
  await f.ledger.hold(noEffect, { project_id: "p1", source_id: "s1" }, [x]);
  // While p1's release is deleting, p2's hold tries from another connection to the same library: the write lock is taken, so it cannot begin.
  const other = libraryAt(f.file, 0);
  t.after(() => other.db.close());
  let during: unknown;
  const watching: FeedEvidenceCollector = { collect(input) {
    try { other.db.exec("BEGIN IMMEDIATE"); during = "entered"; other.db.exec("ROLLBACK"); }
    catch (error) { during = sqliteErrorName(error); }
    return f.evidence.collect(input);
  } };
  assert.equal((await createFeedContentLedger(f.library.store, watching).release(noEffect, { project_id: "p1", source_id: "s1" }, [x])).bodies_deleted, 1);
  assert.equal(during, "SQLITE_BUSY");
  // p2 holds after the release: the file is gone, so it writes the body again, and it is held.
  await f.ledger.hold(noEffect, { project_id: "p2", source_id: "s9" }, [x]);
  assert.equal(f.evidence.has(x), false);
  assert.equal(f.evidence.write("shared body").contentRef, x);
  assert.deepEqual(f.library.rows().map(row => [row.project_id, row.source_id]), [["p2", "s9"]]);
  // And the other way round: a hold that landed first keeps the body from a release.
  await f.ledger.hold(noEffect, { project_id: "p1", source_id: "s2" }, [x]);
  assert.deepEqual(await f.ledger.release(noEffect, { project_id: "p2", source_id: "s9" }, [x]), { bodies_deleted: 0, bodies_kept: 1, complete: true });
  assert.ok(f.evidence.has(x));
});

test("RAC-494: a hold takes only well-formed body references, and a batch is bounded", async t => {
  const f = fixture(t);
  const a = f.evidence.write("body a").contentRef;
  assert.deepEqual(await f.ledger.hold(noEffect, { project_id: "p1", source_id: "s1" }, [a, a, "research:note-1", "../../etc/passwd", ""]), { held: 1 });
  assert.equal(f.library.rows().length, 1);
  const many = Array.from({ length: FEED_CONTENT_LEDGER_BATCH + 1 }, (_, index) => "molis-work-evidence/sha256/" + index.toString(16).padStart(64, "0"));
  await assert.rejects(f.ledger.hold(noEffect, { project_id: "p1", source_id: "s1" }, many), { code: "feed.request_invalid" });
  await assert.rejects(f.ledger.release(noEffect, { project_id: "p1", source_id: "s1" }, many), { code: "feed.request_invalid" });
  await assert.rejects(f.ledger.reclaim(noEffect, { project_id: "p1", source_id: "s1" }, many), { code: "feed.request_invalid" });
  assert.equal(f.library.rows().length, 1);
});

test("RAC-494: only Feed's own project instance may hold or release, and the project is the call's, not the input's", async t => {
  const f = fixture(t);
  const a = f.evidence.write("body a").contentRef;
  const handlers = createFeedContentLedgerHandlers(f.ledger), hold = handlers.find(item => item.capability_id === feedContentLedgerActions.hold.capability_id)!,
    release = handlers.find(item => item.capability_id === feedContentLedgerActions.release.capability_id)!,
    reclaim = handlers.find(item => item.capability_id === feedContentLedgerActions.reclaim.capability_id)!;
  const call = (overrides: Partial<ActionExecutionContext> & { plugin?: string | null }): ActionExecutionContext => {
    const { plugin = FEED_PLUGIN_ID, ...rest } = overrides;
    return { actor_id: "x", project_id: "p1", audience: "plugin", permissions: ["feed:write"], beforeEffect: async () => {},
      ...(plugin ? { calling_plugin_id: plugin } : {}), ...rest } as ActionExecutionContext;
  };
  const input = { source_id: "s1", content_refs: [a], project_id: "p2" };
  await hold.handle(call({}), input);
  assert.deepEqual(f.library.rows().map(row => row.project_id), ["p1"], "a project the input names is not a project the call is in");
  for (const refused of [call({ audience: "user" }), call({ audience: "workflow" }), call({ plugin: "io.molis.work.other" }), call({ plugin: null }), call({ project_id: null })]) {
    await assert.rejects(Promise.resolve(hold.handle(refused, input)), { code: "actions.forbidden" });
    await assert.rejects(Promise.resolve(release.handle(refused, { source_id: "s1", candidates: [a] })), { code: "actions.forbidden" });
    await assert.rejects(Promise.resolve(reclaim.handle(refused, { source_id: "s1", unreferenced: [a] })), { code: "actions.forbidden" });
  }
  assert.equal(f.library.rows().length, 1);
  assert.deepEqual(await release.handle(call({}), { source_id: "s1", candidates: [a] }), { bodies_deleted: 1, bodies_kept: 0, complete: true });
  assert.deepEqual(feedContentLedgerActions.hold.action.audiences, ["plugin"]);
  assert.deepEqual(feedContentLedgerActions.release.action.audiences, ["plugin"]);
  assert.deepEqual(feedContentLedgerActions.reclaim.action.audiences, ["plugin"]);
});

// RAC-2718: the maintenance that used to read every project once (and only then mark the ledger complete) is gone with the clean rebuild
// (#1633). A Home that has Feed installed somewhere must not wait for a mark nothing writes any more: its ledger takes the holds the day
// it starts, so deleting a source releases its bodies.
test("RAC-2718: a Home with Feed installed somewhere releases from the start, without waiting for a maintenance that no longer exists", async t => {
  const f = fixture(t);
  const plugin = createFeedHomePlugin({ manifest: feedManifest, evidence: () => f.evidence });
  const context: Partial<PluginStartContext> = { requireGrant() {}, services: { ui: { register() {}, unregister() {}, invalidate() {} },
    database: { ...f.library.store.read, transaction: f.library.store.write },
    installations: { list: () => [], get: () => null, projects: () => ({ project_ids: ["p1"], complete: true }) } } };
  await plugin.start(context as PluginStartContext);
  const body = f.evidence.write("a body of a source the person deletes").contentRef;
  await f.ledger.hold(noEffect, { project_id: "p1", source_id: "s1" }, [body]);
  assert.deepEqual(await f.ledger.release(noEffect, { project_id: "p1", source_id: "s1" }, [body]),
    { bodies_deleted: 1, bodies_kept: 0, complete: true }, "released at once: there is no completeness mark to wait for");
  assert.ok(!f.evidence.has(body), "the body nobody else holds is gone");
  // Reading the installation directory only served the wait: starting does not ask it anything, so every member would throw.
  const untouched = createFeedHomePlugin({ manifest: feedManifest, evidence: () => f.evidence });
  const notRead = (): never => { throw new Error("the installation directory is not read while starting"); };
  const withDirectory: Partial<PluginStartContext> = { requireGrant() {}, services: { ui: { register() {}, unregister() {}, invalidate() {} },
    database: { ...f.library.store.read, transaction: f.library.store.write },
    installations: { list: () => notRead(), get: () => notRead(), projects: () => notRead() } } };
  await assert.doesNotReject(untouched.start(withDirectory as PluginStartContext));
});

test("P0-09 holdKeptBodies registers active, retain_history retired, source_id IS NULL, and signal refs so cross-project release never deletes shared evidence", async (t) => {
  const f = fixture(t);
  const db = openTestSqlite(":memory:");
  t.after(() => db.close());
  db.pragma("foreign_keys = ON");
  db.exec("CREATE TABLE project_root (project_id TEXT PRIMARY KEY); INSERT INTO project_root (project_id) VALUES ('proj-a');");
  db.exec(FEED_PROJECT_DATABASE.schema);
  db.exec(ATTENTION_SCHEMA_SQL);
  db.exec(CONTEXT_LEDGER_SCHEMA);

  const sql = fromProjectConnection(db);
  const attention = new AttentionModule(db, { exists: () => true });
  const ledgerPort = feedLedgerPort(createContextLedger(db, { authorize: () => true }));
  const feedStore = new FeedModule(sql, unassignedFeedAttention(attention), { ledger: ledgerPort });
  const feed = assembleFeedApplication({
    sql,
    ledger: ledgerPort,
    attention: () => unassignedFeedAttention(attention),
    subscribeInboxCreated: () => {},
    appendEvent: () => {},
  });
  const sources = new SourcesModule(sql);
  const signals = new SignalsModule(sql);
  const at = "2026-11-26T10:00:00.000Z";

  const bodyActive = "active source body";
  const bodyShared = "shared body retained by project A after retain_history";
  const bodyUnassigned = "unassigned source_id IS NULL item body";
  const bodySignal = "signal content_refs_json body";
  const refActive = f.evidence.write(bodyActive).contentRef;
  const refShared = f.evidence.write(bodyShared).contentRef;
  const refUnassigned = f.evidence.write(bodyUnassigned).contentRef;
  const refSignal = f.evidence.write(bodySignal).contentRef;

  const saveSource = (sourceId: string) => sources.commands.save({
    project_id: "proj-a",
    source_id: sourceId,
    kind: "manual",
    definition_id: null,
    sync_kind: "manual",
    name: sourceId,
    description: "",
    status: "active",
    enabled: true,
    origin: "molis_work",
    config: {},
    schedule: { mode: "manual" },
    connection_ref: null,
    account_label: null,
    last_sync_at: null,
    last_outcome: null,
    last_error_code: null,
    imported_at: at,
    updated_at: at,
  });

  saveSource("s-active");
  saveSource("s-retired");

  const makeMaterial = (materialId: string, contentRef: string, body: string) => ({
    material_id: materialId,
    canonical_url: `https://example.test/${materialId}`,
    title: materialId,
    source_name: "Feed",
    published_at: at,
    preview: body,
    content_hash: `hash:${materialId}`,
    content_ref: contentRef,
    content_available: true,
    content_type: "text/markdown",
    character_count: body.length,
    captured_at: at,
    provenance: {},
    selected_for_context: false,
  });

  feedStore.commands.ingest({
    project_id: "proj-a",
    source_id: "s-active",
    source_kind: "manual",
    source_label: "s-active",
    external_id: "ext-active",
    title: "Active item",
    summary: "Summary",
    occurred_at: at,
    attention: false,
    material: makeMaterial("mat-active", refActive, bodyActive),
  });
  feedStore.commands.ingest({
    project_id: "proj-a",
    source_id: "s-retired",
    source_kind: "manual",
    source_label: "s-retired",
    external_id: "ext-retired",
    title: "Retained item",
    summary: "Summary",
    occurred_at: at,
    attention: false,
    material: makeMaterial("mat-retired", refShared, bodyShared),
  });
  const orphanItem = feedStore.commands.ingest({
    project_id: "proj-a",
    source_id: "s-active",
    source_kind: "manual",
    source_label: "Manual",
    external_id: "ext-orphan",
    title: "Unassigned item",
    summary: "Summary",
    occurred_at: at,
    attention: false,
    material: makeMaterial("mat-orphan", refUnassigned, bodyUnassigned),
  }).item;
  db.prepare("UPDATE feed_items SET source_id = NULL WHERE project_id = ? AND item_id = ?").run("proj-a", orphanItem.item_id);

  // Retire s-retired with retain_history so feed.sources.list("proj-a") no longer lists it.
  sources.commands.retire("proj-a", "s-retired", "retain_history", at);
  assert.deepEqual(feed.sources.list("proj-a").map((row) => row.source_id), ["s-active"]);

  signals.commands.submitDraft({
    project_id: "proj-a",
    source_id: "s-signal",
    provider_dedupe_id: "sig-1",
    kind: "update",
    occurred_at: at,
    observed_at: at,
    payload: { title: "Signal" },
    content_refs: [refSignal],
    raw_event_id: "raw-1",
    adapter: { plugin_id: "fixture", version: "1.0.0" },
    provenance: { source: "fixture" },
  });

  // Project B also holds the shared body before reconciliation runs for Project A.
  await f.ledger.hold(noEffect, { project_id: "proj-b", source_id: "s-b" }, [refShared]);

  await holdKeptBodies({
    feed,
    projectId: "proj-a",
    connections: undefined,
    commit: async (_control, body) => body(),
    hold: async (sourceId, contentRefs) => {
      await f.ledger.hold(noEffect, { project_id: "proj-a", source_id: sourceId }, contentRefs);
    },
  });

  const projectAHolds = f.library
    .rows()
    .filter((row) => row.project_id === "proj-a")
    .map((row) => [row.source_id, row.content_ref])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  assert.deepEqual(
    projectAHolds,
    [
      [FEED_UNASSIGNED_BODY_HOLDER, refUnassigned],
      ["s-active", refActive],
      ["s-retired", refShared],
      ["s-signal", refSignal],
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );

  // Project B deletes its source and releases refShared; Project A's retain_history hold must keep the file alive.
  assert.deepEqual(
    await f.ledger.release(noEffect, { project_id: "proj-b", source_id: "s-b" }, [refShared]),
    { bodies_deleted: 0, bodies_kept: 1, complete: true },
  );
  assert.equal(f.evidence.has(refShared), true);
  assert.equal(f.evidence.read(refShared), bodyShared);
  assert.equal(f.evidence.has(refActive), true);
  assert.equal(f.evidence.has(refUnassigned), true);
  assert.equal(f.evidence.has(refSignal), true);
});

test("P0-09 createProjectEvidenceContent runs holdEvidence before writing decoded evidence to Home pool", async (t) => {
  const homeA = mkdtempSync(join(tmpdir(), "feed-evidence-codec-a-"));
  const homeB = mkdtempSync(join(tmpdir(), "feed-evidence-codec-b-"));
  t.after(() => {
    rmSync(homeA, { recursive: true, force: true });
    rmSync(homeB, { recursive: true, force: true });
  });

  const evidenceA = runWithMolisWorkHome(homeA, () =>
    createEvidenceContentStore({ secretStore: createLazyFileSecretStore(homeA) }),
  );
  const evidenceB = runWithMolisWorkHome(homeB, () =>
    createEvidenceContentStore({ secretStore: createLazyFileSecretStore(homeB) }),
  );
  const ledgerDb = libraryAt(join(homeB, "ledger.db"));
  ledgerDb.db.exec(FEED_HOME_DATABASE.schema);
  t.after(() => ledgerDb.db.close());
  const ledger = createFeedContentLedger(ledgerDb.store, evidenceB);

  const sharedBody = "Shared synced evidence protected before disk write\n";
  const refShared = evidenceA.write(sharedBody).contentRef;
  const at = "2026-11-26T10:00:00.000Z";
  const spaceId = "space-p0-09";
  const key = JSON.stringify(["proj-a", "project_feed", "proj-a"]);
  const definition = feedContentReplicationDefinition();
  const wire = {
    ...PROJECT_SECTIONS_INLINE_ENCODING,
    spaceId,
    project: { id: "proj-a", title: "Project A" },
    facts: {
      [definition.id]: {
        feed_items: [
          {
            project_id: "proj-a",
            item_id: "item-1",
            source_id: "src-a",
            signal_id: null,
            signal_revision: null,
            kind: "update",
            title: "Synced item",
            summary: "Summary",
            body: null,
            source_kind: "manual",
            source_label: "Manual",
            external_id: "ext-1",
            url: null,
            origin_status: "active",
            priority: "medium",
            tags_json: "[]",
            author: null,
            disposition: "inbox",
            read_at: null,
            revision: 1,
            source_created_at: at,
            source_updated_at: at,
            imported_at: at,
            updated_at: at,
          },
        ],
        feed_materials: [
          {
            project_id: "proj-a",
            material_id: "mat-1",
            item_id: "item-1",
            canonical_url: "https://example.test/1",
            title: "Synced material",
            source_name: "Manual",
            published_at: at,
            preview: "Preview",
            content_hash: "hash:1",
            content_ref: refShared,
            content_available: 1,
            content_type: "text/markdown",
            character_count: sharedBody.length,
            captured_at: at,
            provenance_json: "{}",
            selected_for_context: 0,
            imported_at: at,
            updated_at: at,
          },
        ],
        feed_item_events: [],
      },
    },
  };

  const encoder = createProjectEvidenceContent(homeA, [definition], "project_feed", spaceId, () => {});
  const encoded = encoder.encode(key, wire);
  assert.ok(encoded.blobs.length > 0);

  let existedDuringHold: boolean | null = null;
  const decoder = createProjectEvidenceContent(
    homeB,
    [definition],
    "project_feed",
    spaceId,
    () => {},
    async ({ projectId, refs }) => {
      existedDuringHold = evidenceB.has(refShared);
      await ledger.hold(noEffect, { project_id: projectId, source_id: "src-a" }, refs);
    },
  );
  await decoder.decode(key, encoded.value, async (ref) => {
    const found = encoded.blobs.find((blob) => blob.digest === ref.digest && blob.size === ref.size);
    assert.ok(found);
    return found.bytes;
  });

  assert.equal(existedDuringHold, false, "holdEvidence must execute before writing the evidence file to disk");
  assert.equal(evidenceB.has(refShared), true);

  // Project B holds and then releases refShared; Project A's hold keeps the disk file readable.
  await ledger.hold(noEffect, { project_id: "proj-b", source_id: "src-b" }, [refShared]);
  assert.deepEqual(
    await ledger.release(noEffect, { project_id: "proj-b", source_id: "src-b" }, [refShared]),
    { bodies_deleted: 0, bodies_kept: 1, complete: true },
  );
  assert.equal(evidenceB.has(refShared), true);
  assert.equal(evidenceB.read(refShared), sharedBody);
});

test("F-pm3-06 FEED_HOME_DATABASE declares project_rows so deleting a project clears only that project's holds and unblocks shared-body release", async t => {
  const parsed = parsePluginManifest(feedManifest);
  assert.deepEqual(parsed.databases?.home?.project_rows?.tables, [{ table: "feed_content_holds", column: "project_id" }]);

  const home = mkdtempSync(join(tmpdir(), "feed-project-rows-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const baseline = openBaselineHomeSqlite(home, FEED_HOME_DATABASE.store_name, FEED_HOME_DATABASE);
  baseline.close();

  const evidence = runWithMolisWorkHome(home, () => createEvidenceContentStore({ secretStore: createLazyFileSecretStore(home) }));
  const refShared = evidence.write("shared body across projects").contentRef;
  const refOnlyA = evidence.write("project-a exclusive body").contentRef;

  const library = libraryAt(homeSqlitePath(home, FEED_HOME_DATABASE.store_name));
  t.after(() => library.db.close());
  const ledger = createFeedContentLedger(library.store, {
    collect: input => runWithMolisWorkHome(home, () => evidence.collect(input)),
  });

  await ledger.hold(noEffect, { project_id: "proj-a", source_id: "src-a" }, [refShared, refOnlyA]);
  await ledger.hold(noEffect, { project_id: "proj-b", source_id: "src-b" }, [refShared]);
  assert.equal(library.rows().length, 3);

  assert.equal(await projectDeletedHooksFor(home).clear("feed", "proj-a"), true);
  assert.deepEqual(library.rows(), [{ content_ref: refShared, project_id: "proj-b", source_id: "src-b" }]);

  assert.deepEqual(
    await ledger.release(noEffect, { project_id: "proj-b", source_id: "src-b" }, [refShared]),
    { bodies_deleted: 1, bodies_kept: 0, complete: true },
  );
  assert.equal(evidence.has(refShared), false, "once deleted proj-a's hold is cleared, proj-b's release collects the shared body");
  assert.deepEqual(library.rows(), []);
});
