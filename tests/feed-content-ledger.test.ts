import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createEvidenceContentStore, createFileSecretStore } from "@molis-ai/molis-work-storage";
import { createFeedContentLedger, createFeedContentLedgerHandlers, createFeedHomePlugin, FEED_CONTENT_LEDGER_BATCH, FEED_FORGET_BATCH, FEED_HOME_DATABASE, FEED_PLUGIN_ID, feedContentLedgerActions, feedManifest,
  createConnectionWatch, keepFeedReconcile, releaseHeldHistory, type FeedApplication, type FeedContentLedgerStore, type FeedEvidenceCollector, type FeedHistoryReleasePorts,
  type FeedReconcilePorts } from "@molis-ai/molis-work-plugin-feed";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginBackgroundClient, PluginJobControl, PluginManifest, PluginSqlValue, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";

// RAC-494 and RAC-2718 (the ledger half; the project half comes with Feed's move into the Runtime).

const noEffect = async () => {};
function libraryAt(file: string, timeout = 5_000) {
  const db = new Database(file, { timeout });
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
  const unwritten = "molis-work-feed/sha256/" + "0".repeat(63) + "1";
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

// FI-C-06 (specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §13): a deletion gives a source's history back in bounded
// batches; a batch not reached yet stays held, and a failure throws so the source stays to be deleted again.
test("FI-C-06: a large history is given back in batches of at most 5000 bodies and 1000 records; a failure part way keeps what is not reached, and deleting again finishes", async t => {
  const f = fixture(t);
  const ref = (n: number) => "molis-work-feed/sha256/" + n.toString(16).padStart(64, "0");
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
  const ref = (n: number) => "molis-work-feed/sha256/" + n.toString(16).padStart(64, "0");
  const kept = Array.from({ length: FEED_CONTENT_LEDGER_BATCH + 1 }, (_, n) => ref(n + 1));
  const snapshot = { sources: [{ source_id: "s1" }, { source_id: "s2" }], runs: [{ source_id: "s2", operation_id: "op-1", receipt: { content_refs: [ref(0)] } }],
    feed_items: [{ source_id: "s1", materials: [...kept.map(content_ref => ({ content_ref })), { content_ref: "research:note-1" }] }] };
  let failing = Number.POSITIVE_INFINITY;
  const asked: string[] = [];
  const ports: FeedReconcilePorts = { feed: standIn<FeedApplication>({ snapshot: () => snapshot }), projectId: "p1", connections: undefined, commit: async (_control, body) => body(),
    hold: async (sourceId, refs) => {
      if (failing > 0) { failing -= 1; asked.push("refused"); throw new Error("the Home's ledger is unavailable"); }
      assert.ok(refs.every(each => each.startsWith("molis-work-feed/sha256/")), "only the ledger's own bodies are named");
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
  assert.deepEqual(asked.slice(4), [`s1:${FEED_CONTENT_LEDGER_BATCH}`, "s1:1", "s2:1"], "the ledger back, every kept body is named, in batches it takes");
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
  assert.deepEqual(asked.slice(7), ["refused", `s1:${FEED_CONTENT_LEDGER_BATCH}`, "s1:1", "s2:1"], "a start the ledger first refuses names them on the next try");
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
    catch (error) { during = (error as { code?: string }).code; }
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
  const many = Array.from({ length: FEED_CONTENT_LEDGER_BATCH + 1 }, (_, index) => "molis-work-feed/sha256/" + index.toString(16).padStart(64, "0"));
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
