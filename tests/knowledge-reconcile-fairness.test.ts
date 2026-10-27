import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SearchRetentionResult } from "@molis-ai/molis-work-contracts/services/search";
import { KnowledgeCards, KnowledgeOrganizer, type KnowledgePiece } from "@molis-ai/molis-work-service-knowledge";
import { openKnowledgeCards } from "@molis-ai/molis-work-storage";

const project = "reconcile-project";
const caller: ActionCallContext = { actor_id: "person", project_id: project, audience: "user", permissions: ["knowledge:write"] };
const piece = (id: string): KnowledgePiece => ({ subject: { kind: "note", id }, source_key: "notes", provider_id: "notes", plugin_id: "notes",
  plugin_title: "Notes", revision: "r1", title: id, summary: "Owner summary", content: "", content_policy: "summary", updated_at: null, open: null });
const unsupported = (): Promise<SearchRetentionResult> => Promise.resolve({ state: "unsupported" });

async function fixture(t: TestContext, pieces = [piece("one")]) {
  const home = await mkdtemp(join(tmpdir(), "molis-knowledge-reconcile-"));
  const raw = openKnowledgeCards({ homeDirectory: home });
  const organizers: KnowledgeOrganizer[] = [];
  let closed = false, afterList: (() => void) | undefined;
  const accesses: string[] = [];
  const store = new Proxy(raw, { get(target, key) {
    const value = Reflect.get(target, key);
    if (typeof value !== "function") return value;
    return (...args: unknown[]) => {
      accesses.push(String(key));
      const result: unknown = Reflect.apply(value, target, args);
      if (key === "list") { const notify = afterList; afterList = undefined; notify?.(); }
      return result;
    };
  } });
  const make = (catalog: KnowledgePiece[], retention = unsupported) => {
    const organizer = new KnowledgeOrganizer({ store, catalog: async () => catalog, writer: () => null, retention });
    organizers.push(organizer);
    return organizer;
  };
  t.after(async () => { for (const organizer of organizers) await organizer.close(); if (!closed) raw.close(); await rm(home, { recursive: true, force: true }); });
  await make(pieces).reconcile(project);
  return { raw, make, accesses, onList: (notify: () => void) => { afterList = notify; },
    closeStore: () => { raw.close(); closed = true; } };
}

test("Knowledge reconciliation lets the host check phase run between entries and leftover cards", async t => {
  const pieces = [piece("one"), piece("two"), piece("three")], f = await fixture(t, pieces);
  let turns = 0, timer: ReturnType<typeof setImmediate> | undefined, finished = false;
  const seen: number[] = [];
  const tick = () => { if (!finished) { turns += 1; timer = setImmediate(tick); } };
  f.onList(() => { timer = setImmediate(tick); });
  const organizer = f.make(pieces.slice(0, 2), async () => { seen.push(turns); return { state: "unsupported" }; });
  try { await organizer.reconcile(project); }
  finally { finished = true; if (timer) clearImmediate(timer); }
  assert.equal(seen.length, 3, "both present entries and the leftover card are checked");
  assert.ok(seen.every((turn, index) => turn > (seen[index - 1] ?? 0)), "each check follows a host I/O turn");
  assert.equal(f.raw.get(project, pieces[2]!.subject), null, "normal removal still completes");
});

type Change = "edit" | "revision" | "identity" | "create" | "remove";
const changes: Array<{ leftover: boolean; change: Change }> = [
  { leftover: false, change: "edit" }, { leftover: true, change: "edit" },
  { leftover: false, change: "revision" }, { leftover: true, change: "revision" },
  { leftover: false, change: "identity" },
  { leftover: false, change: "create" }, { leftover: false, change: "remove" },
];

for (const stage of ["io", "retention"] as const) for (const { leftover, change } of changes) {
  test(`Knowledge keeps a concurrent ${change} at the ${stage} wait (${leftover ? "leftover" : "entry"})`, async t => {
    const release = Promise.withResolvers<void>();
    t.after(() => release.resolve());
    const f = await fixture(t), original = f.raw.get(project, piece("one").subject)!;
    if (change === "create") f.raw.remove(project, original.subject);
    const entered = Promise.withResolvers<void>();
    const organizer = f.make(leftover ? [] : [{ ...piece("one"), title: "Later owner title", summary: "Later owner summary" }], async () => {
      if (stage === "retention") { entered.resolve(); await release.promise; }
      return { state: "unsupported" };
    });
    const cards = new KnowledgeCards(f.raw, organizer);
    const mutate = () => {
      if (change === "edit") {
        cards.edit(caller, { subject: original.subject, title: "Personal title", brief: "Personal brief", keywords: ["personal"] });
        cards.exclude(caller, { subject: original.subject, excluded: true });
      } else if (change === "revision") {
        f.raw.put({ ...original, revision: "r2", title: "Current source revision" });
      } else if (change === "identity") {
        f.raw.put({ ...original, provider_id: "replacement-owner", retention: { generation: "next-installation", restoration_operation_id: null } });
      } else if (change === "create") {
        f.raw.put({ ...original, title: "New concurrent card", edited: ["title"] });
      } else f.raw.remove(project, original.subject);
      return f.raw.get(project, original.subject);
    };
    let expected: ReturnType<typeof mutate> | undefined;
    const changed = Promise.withResolvers<void>();
    if (stage === "io") f.onList(() => { setImmediate(() => { try { expected = mutate(); changed.resolve(); } catch (error) { changed.reject(error); } }); });
    const running = organizer.reconcile(project);
    try {
      if (stage === "retention") { await entered.promise; expected = mutate(); release.resolve(); }
      else await changed.promise;
      await running;
      assert.deepEqual(f.raw.get(project, original.subject), expected, "stale reconciliation cannot overwrite, remove or recreate the current card");
    } finally { release.resolve(); await running; }
  });
}

for (const stage of ["io", "retention"] as const) for (const leftover of [false, true]) for (const stop of ["close", "remove"] as const) {
  test(`Knowledge ${stop} during ${stage} stops Store access (${leftover ? "leftover" : "entry"})`, async t => {
    const release = Promise.withResolvers<void>();
    t.after(() => release.resolve());
    const f = await fixture(t), entered = Promise.withResolvers<void>();
    const organizer = f.make(leftover ? [] : [piece("one")], async () => {
      if (stage === "retention") { entered.resolve(); await release.promise; }
      return { state: "unsupported" };
    });
    let accessCount = -1;
    const halt = async () => {
      accessCount = f.accesses.length;
      if (stop === "close") await organizer.close();
      else organizer.removeProject(project);
      if (stop === "close") f.closeStore();
      else f.raw.removeProject(project);
    };
    const stopped = Promise.withResolvers<void>();
    if (stage === "io") f.onList(() => { setImmediate(() => { void halt().then(stopped.resolve, stopped.reject); }); });
    const running = organizer.reconcile(project);
    try {
      if (stage === "retention") { await entered.promise; await halt(); release.resolve(); }
      else await stopped.promise;
      await running;
      assert.equal(f.accesses.length, accessCount, "neither reads nor writes happen after stopping");
    } finally { release.resolve(); await running; }
  });
}
