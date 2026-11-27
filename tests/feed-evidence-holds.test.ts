import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { EVIDENCE_COLLECT_PERMISSION, openEvidenceLedger, type EvidenceHolder } from "@molis-ai/molis-work-service-evidence";
import { createEvidenceContentStore, createLazyFileSecretStore, homeSqlitePath, runWithMolisWorkHome, sqliteErrorName, type EvidenceContentStore } from "@molis-ai/molis-work-storage";
import { FEED_CONTENT_LEDGER_BATCH, FEED_FORGET_BATCH, createConnectionWatch, keepFeedReconcile, releaseHeldHistory, type FeedApplication, type FeedHistoryReleasePorts,
  type FeedReconcilePorts } from "@molis-ai/molis-work-plugin-feed";
import type { PluginBackgroundClient, PluginJobControl } from "@molis-ai/molis-work-contracts/platform/plugin";

// RAC-494, RAC-1016, FI-C-06 and FI-C-07: Feed's holds on the bodies its sources retained. Since batch 109 they are the platform's evidence
// ledger's (`horizontal/evidence`, reached through `services.evidence`, S-98): a holder is a partition, Feed's installation and a source.
// What the ledger decides is proven here against the real ledger; what Feed does with it (batches, retries) against Feed's own code.

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
const COLLECT = { permissions: [EVIDENCE_COLLECT_PERMISSION] };
const holder = (partition: string, source: string): EvidenceHolder => ({ partition_id: partition, owner_install: "feed-install", holder_key: source });

/** A Home of its own: the evidence store sealed with its key, and the ledger in it. Never the Home the test process would resolve to by default. */
function fixture(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "feed-evidence-holds-"));
  const evidence = runWithMolisWorkHome(home, () => createEvidenceContentStore({ secretStore: createLazyFileSecretStore(home) }));
  const ledger = openEvidenceLedger(home);
  t.after(() => { ledger.close(); rmSync(home, { recursive: true, force: true }); });
  const rows = () => {
    const db = new DatabaseSync(homeSqlitePath(home, "evidence"), { readOnly: true });
    try {
      return db.prepare("SELECT content_ref, partition_id, holder_key FROM evidence_holds ORDER BY content_ref, partition_id, holder_key").all() as
        Array<{ content_ref: string; partition_id: string; holder_key: string }>;
    } finally { db.close(); }
  };
  /** The holder's holds go (all, or the named ones), then each candidate nobody holds is deleted: one transaction. */
  const give = (who: EvidenceHolder, refs: readonly string[] | "all", candidates: readonly string[], content: Pick<EvidenceContentStore, "collect"> = evidence) => {
    const outcome = runWithMolisWorkHome(home, () => ledger.releaseAndCollect(COLLECT, content, who, refs, candidates));
    return { holds_released: outcome.released, bodies_deleted: outcome.deleted.length, bodies_kept: outcome.kept.length };
  };
  return { home, evidence, ledger, rows, give };
}

test("RAC-494: a body goes only when no source of any partition holds it; a release takes only its own source's holds", async t => {
  const f = fixture(t);
  const a = f.evidence.write("body a").contentRef, b = f.evidence.write("body b").contentRef;
  f.ledger.hold(holder("p1", "s1"), [a, b]);
  f.ledger.hold(holder("p2", "s1"), [a]);
  assert.equal(f.ledger.hold(holder("p1", "s1"), [a]), 0, "holding again changes nothing");
  assert.equal(f.rows().length, 3);
  assert.deepEqual(f.give(holder("p1", "s1"), "all", [a, b]), { holds_released: 2, bodies_deleted: 1, bodies_kept: 1 });
  assert.ok(f.evidence.has(a) && !f.evidence.has(b), "the body another partition still holds stays, the one nobody holds goes");
  assert.deepEqual(f.rows().map(row => [row.partition_id, row.holder_key]), [["p2", "s1"]], "only the released source's holds went");
  assert.deepEqual(f.give(holder("p2", "s1"), "all", [a]), { holds_released: 1, bodies_deleted: 1, bodies_kept: 0 });
  assert.ok(!f.evidence.has(a));
  assert.deepEqual(f.rows(), []);
});

// RAC-1016 (4c-1 condition): a pull that fails after it held bodies leaves holds nobody refers to; they are taken back.
test("RAC-1016: holds a failed pull left behind are taken back: only this source's, only the ones named, and a body goes when nobody else holds it", async t => {
  const f = fixture(t);
  const kept = f.evidence.write("a body the source's rows point at").contentRef, shared = f.evidence.write("a body another partition holds").contentRef,
    stray = f.evidence.write("a body only the failed pull held").contentRef;
  const unwritten = "molis-work-evidence/sha256/" + "0".repeat(63) + "1";
  f.ledger.hold(holder("p1", "s1"), [kept, shared, stray, unwritten]);
  f.ledger.hold(holder("p2", "s1"), [shared]);
  // The pull failed after holding all four; the source's rows point at `kept` only. The named three are the ones it does not point at.
  const named = [shared, stray, unwritten];
  assert.deepEqual(f.give(holder("p1", "s1"), named, named), { holds_released: 3, bodies_deleted: 1, bodies_kept: 1 });
  assert.ok(f.evidence.has(kept) && f.evidence.has(shared) && !f.evidence.has(stray), "the held-and-pointed-at body and the shared one stay, the stray one goes");
  assert.deepEqual(f.rows().map(row => [row.content_ref === kept ? "kept" : row.content_ref === shared ? "shared" : "?", row.partition_id, row.holder_key]).sort(),
    [["kept", "p1", "s1"], ["shared", "p2", "s1"]], "this source still holds what it points at; the other partition still holds its own");
  assert.deepEqual(f.give(holder("p1", "s1"), named, named), { holds_released: 0, bodies_deleted: 0, bodies_kept: 1 }, "taking back twice changes nothing");
  // A source that did not hold it, a malformed reference and a caller without evidence:collect change nothing.
  f.give(holder("p1", "s9"), [kept], [kept]);
  assert.ok(f.evidence.has(kept), "another source's reclaim leaves a body this source holds");
  assert.throws(() => f.ledger.releaseAndCollect(COLLECT, f.evidence, holder("p1", "s1"), ["research:note-1"], []), { code: "actions.input_invalid" });
  assert.throws(() => f.ledger.releaseAndCollect({ permissions: ["feed:write"] }, f.evidence, holder("p1", "s1"), [kept], [kept]), { code: "actions.forbidden" });
  assert.equal(f.rows().length, 2);
  assert.ok(f.evidence.has(kept));
});

test("RAC-494: a release that fails part way leaves the ledger as it was, so a hold is never missing for a body something points at", async t => {
  const f = fixture(t);
  const a = f.evidence.write("body a").contentRef, b = f.evidence.write("body b").contentRef;
  f.ledger.hold(holder("p1", "s1"), [a, b]);
  const failing = { collect(input: { candidates: Iterable<string> }): never {
    const [first] = input.candidates;
    f.evidence.delete(first!);
    throw new Error("disk went away");
  } };
  assert.throws(() => f.give(holder("p1", "s1"), "all", [a, b], failing), { message: "disk went away" });
  assert.equal(f.rows().length, 2, "the source's holds are back: a body already deleted is held once too many, never once too few");
  assert.deepEqual(f.give(holder("p1", "s1"), "all", [a, b]), { holds_released: 2, bodies_deleted: 1, bodies_kept: 0 }, "a retry finds one of them already gone");
});

// FI-C-06 (specs/archive/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §13): a deletion gives a source's history back in bounded
// batches; a batch not reached yet stays held, and a failure throws so the source stays to be deleted again.
test("FI-C-06: a large history is given back in batches of at most 5000 bodies and 1000 records; a failure part way keeps what is not reached, and deleting again finishes", async t => {
  const f = fixture(t);
  const ref = (n: number) => "molis-work-evidence/sha256/" + n.toString(16).padStart(64, "0");
  const refs = Array.from({ length: FEED_CONTENT_LEDGER_BATCH + 1_001 }, (_, n) => ref(n + 1)), stray = ref(999_999), shared = [refs[0]!, refs[FEED_CONTENT_LEDGER_BATCH + 500]!];
  // The bodies exist until the store deletes them; it counts what it deleted, so a second deletion of the same body is no deletion.
  const existing = new Set([...refs, stray]);
  const store = { collect({ candidates, isReferenced }: { candidates: Iterable<string>; isReferenced(ref: string): boolean }) {
    const deleted: string[] = [], kept: string[] = [];
    for (const candidate of new Set(candidates)) if (isReferenced(candidate)) kept.push(candidate); else if (existing.delete(candidate)) deleted.push(candidate);
    return { deleted, kept };
  } };
  const mine = holder("p1", "s1");
  f.ledger.hold(mine, refs.slice(0, FEED_CONTENT_LEDGER_BATCH));
  f.ledger.hold(mine, [...refs.slice(FEED_CONTENT_LEDGER_BATCH), stray]);
  f.ledger.hold(holder("p2", "s1"), shared);
  const operations = Array.from({ length: 2 * FEED_FORGET_BATCH + 500 }, (_, n) => `op-${n}`), forgotten = new Set<string>();
  const asked: string[] = [];
  let failAt = 2;
  // As Feed's deletion asks `services.evidence`: a reclaim names its batch, the last batch releases every hold the source has left.
  const ports: FeedHistoryReleasePorts = {
    reclaim: async batch => { asked.push(`reclaim:${batch.length}`); if (--failAt === 0) throw new Error("the Home went away"); return { ...f.give(mine, batch, batch, store), complete: true }; },
    release: async batch => { asked.push(`release:${batch.length}`); if (--failAt === 0) throw new Error("the Home went away"); return { ...f.give(mine, "all", batch, store), complete: true }; },
    forget: async ids => { asked.push(`forget:${ids.length}`); let n = 0; for (const id of ids) if (!forgotten.has(id)) { forgotten.add(id); n += 1; } return { records_deleted: n }; },
  };
  // The held history names a research note too: it is not a body of the ledger's, so no batch carries it.
  const held = { content_refs: [...refs, "research:note-1"], operation_ids: operations };
  await assert.rejects(releaseHeldHistory(held, ports), { message: "the Home went away" });
  assert.deepEqual(asked, [`reclaim:${FEED_CONTENT_LEDGER_BATCH}`, "release:1001"], "the first batch went back, the second failed, and no record was forgotten");
  const holdsOf = (partition: string) => f.rows().filter(row => row.partition_id === partition).map(row => row.content_ref).sort();
  assert.deepEqual(holdsOf("p1"), [...refs.slice(FEED_CONTENT_LEDGER_BATCH), stray].sort(), "the batch not reached is still held by the source whose rows point at it");
  assert.deepEqual(holdsOf("p2"), [...shared].sort(), "another partition's holds are never touched");
  assert.ok(shared.every(body => existing.has(body)), "a body another partition holds stays");
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

// FI-C-07 (specs/.../feed-inbox-runtime-plugins.md §13): the job that names a partition's kept bodies in the evidence ledger at start does it in
// batches, tries again a bounded number of times while the ledger does not answer, then at each change of a connection until it has worked.
test("FI-C-07: the kept bodies are named in batches; a ledger that does not answer is tried a bounded number of times, then at each change until it works", async t => {
  const ref = (n: number) => "molis-work-evidence/sha256/" + n.toString(16).padStart(64, "0");
  const kept = Array.from({ length: 201 }, (_, n) => ref(n + 1));
  const snapshot = { sources: [{ source_id: "s1" }, { source_id: "s2" }], runs: [{ source_id: "s2", operation_id: "op-1", receipt: { content_refs: [ref(0)] } }],
    feed_items: [{ source_id: "s1", materials: [...kept.map(content_ref => ({ content_ref })), { content_ref: "research:note-1" }] }] };
  let failing = Number.POSITIVE_INFINITY;
  const asked: string[] = [];
  const ports: FeedReconcilePorts = { feed: standIn<FeedApplication>({ sources: { list: () => snapshot.sources }, reads: {
    *history(_project: string, sourceId: string) {
      const refs = sourceId === "s1" ? snapshot.feed_items[0]!.materials.map(row => row.content_ref) : [ref(0)];
      for (let offset = 0; offset < refs.length; offset += 200) yield refs.slice(offset, offset + 200);
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
  f.ledger.hold(holder("p1", "s1"), [x]);
  // While p1's release is deleting, p2's hold tries from another connection to the same ledger: the write lock is taken, so it cannot begin.
  const other = new DatabaseSync(homeSqlitePath(f.home, "evidence"), { timeout: 0 });
  t.after(() => other.close());
  let during: unknown;
  const watching = { collect(input: { candidates: Iterable<string>; isReferenced(ref: string): boolean }) {
    try { other.exec("BEGIN IMMEDIATE"); during = "entered"; other.exec("ROLLBACK"); }
    catch (error) { during = sqliteErrorName(error); }
    return f.evidence.collect(input);
  } };
  assert.equal(f.give(holder("p1", "s1"), "all", [x], watching).bodies_deleted, 1);
  assert.equal(during, "SQLITE_BUSY");
  // p2 holds after the release: the file is gone, so it writes the body again, and it is held.
  f.ledger.hold(holder("p2", "s9"), [x]);
  assert.equal(f.evidence.has(x), false);
  assert.equal(f.evidence.write("shared body").contentRef, x);
  assert.deepEqual(f.rows().map(row => [row.partition_id, row.holder_key]), [["p2", "s9"]]);
  // And the other way round: a hold that landed first keeps the body from a release.
  f.ledger.hold(holder("p1", "s2"), [x]);
  assert.deepEqual(f.give(holder("p2", "s9"), "all", [x]), { holds_released: 1, bodies_deleted: 0, bodies_kept: 1 });
  assert.ok(f.evidence.has(x));
});
