import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { LocalHost } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SearchRetentionResult } from "@molis-ai/molis-work-contracts/services/search";
import { defineSubjectRetentionAction } from "@molis-ai/molis-work-plugin-sdk";
import { KnowledgeCards, KnowledgeOrganizer, type KnowledgeOrganizerOptions, type KnowledgePiece } from "@molis-ai/molis-work-service-knowledge";
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
  const make = (catalog: KnowledgePiece[], retention: NonNullable<KnowledgeOrganizerOptions["retention"]> = unsupported,
    prepareUnboundRetention?: KnowledgeOrganizerOptions["prepareUnboundRetention"]) => {
    const organizer = new KnowledgeOrganizer({ store, catalog: async () => catalog, writer: () => null, retention, ...(prepareUnboundRetention ? { prepareUnboundRetention } : {}) });
    organizers.push(organizer);
    return organizer;
  };
  t.after(async () => { for (const organizer of organizers) await organizer.close(); if (!closed) raw.close(); await rm(home, { recursive: true, force: true }); });
  await make(pieces).reconcile(project);
  return { raw, make, accesses, onList: (notify: () => void) => { afterList = notify; },
    closeStore: () => { raw.close(); closed = true; } };
}

test("Knowledge prepares once for unbound cards and keeps every bound card on the original query path", async t => {
  const pieces = [piece("ordinary"), piece("null-generation"), piece("bound"), piece("leftover")], f = await fixture(t, pieces);
  for (const [id, generation] of [["null-generation", null], ["bound", "original-installation"]] as const) {
    const card = f.raw.get(project, piece(id).subject)!;
    f.raw.put({ ...card, retention: { generation, restoration_operation_id: null } });
  }
  const before = f.raw.list(project).filter(card => card.retention);
  let prepared = 0;
  const classified: string[] = [], queried: string[] = [];
  const catalog = [{ ...pieces[0]!, title: "Updated owner title" }, ...pieces.slice(1, 3), piece("new")];
  const organizer = f.make(catalog, async identity => {
    queried.push(identity.subject.id); return { state: "unavailable" };
  }, async () => { prepared += 1; return identity => { classified.push(identity.subject.id); return "unsupported"; }; });
  await organizer.reconcile(project);
  assert.equal(prepared, 1);
  assert.deepEqual(classified, ["ordinary", "new", "leftover"]);
  assert.deepEqual(queried, ["null-generation", "bound"]);
  assert.deepEqual(f.raw.list(project).filter(card => card.retention), before);
  assert.equal(f.raw.get(project, piece("ordinary").subject)?.title, "Updated owner title");
  assert.equal(f.raw.get(project, piece("new").subject)?.state, "listed");
  assert.equal(f.raw.get(project, piece("leftover").subject), null);
});

test("Knowledge preparation failure preserves the entire pass without falling back to writes", async t => {
  const f = await fixture(t), before = f.raw.list(project), accesses = f.accesses.length;
  let queried = 0;
  await f.make([piece("new")], async () => { queried += 1; return { state: "unsupported" }; }, async () => { throw new Error("owner unavailable"); }).reconcile(project);
  assert.equal(queried, 0);
  assert.equal(f.accesses.length, accesses, "preparation failed before reading or writing cards");
  assert.deepEqual(f.raw.list(project), before);
});

test("Knowledge treats a failed synchronous classification as unavailable for that piece", async t => {
  const f = await fixture(t, [piece("one"), piece("other")]), before = f.raw.get(project, piece("one").subject);
  await f.make([], unsupported, async () => identity => {
    if (identity.subject.id === "one") throw new Error("metadata unavailable");
    return "unsupported";
  }).reconcile(project);
  assert.deepEqual(f.raw.get(project, piece("one").subject), before);
  assert.equal(f.raw.get(project, piece("other").subject), null);
});

for (const operation of ["create", "update", "remove"] as const) {
  test(`Knowledge cannot ${operation} an unbound card when a new protocol appears after preparation`, async t => {
    const f = await fixture(t), reference = { project_id: project, storage_key: `memory:${project}` };
    const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
    t.after(() => host.close());
    const registry = host.actionRegistry(reference), oldCaller = { ...caller, permissions: [], allowed_actions: [] };
    const action = defineSubjectRetentionAction("notes.retention", "note", "Notes", ["notes:private"]);
    if (operation === "create") f.raw.remove(project, piece("one").subject);
    const before = f.raw.list(project), registered = Promise.withResolvers<void>();
    let invoked = 0, availabilityReads = 0;
    f.onList(() => { setImmediate(() => {
      registry.registerProvider({ provider: { provider_id: "notes", title: "Notes", kind: "plugin", plugin_installation_generation: "new-installation" },
        definitions: [action], availability: () => { availabilityReads += 1; return { available: false, code: "notes.denied", reason: "denied" }; },
        handlers: [{ ...action, handle: () => { invoked += 1; throw new Error("must not invoke"); } }] });
      registered.resolve();
    }); });
    const organizer = f.make(operation === "remove" ? [] : [{ ...piece("one"), title: "Changed owner title" }], unsupported, async () => {
      assert.deepEqual(await host.actionClient(reference).discover(oldCaller), []);
      return () => host.inspectActionMetadata(oldCaller, reference).some(view => view.capability_id === action.capability_id) ? "unavailable" : "unsupported";
    });
    await organizer.reconcile(project); await registered.promise;
    assert.deepEqual(await host.actionClient(reference).discover(oldCaller), [], "the old caller still cannot discover or invoke the new protocol");
    assert.deepEqual(f.raw.list(project), before);
    assert.equal(invoked, 0);
    assert.equal(availabilityReads, 0, "metadata inspection is not an availability or authorization call");
  });
}

test("Knowledge's prepared path preserves edits, replacement revisions and new cards across its I/O turn", async t => {
  const pieces = [piece("edit"), piece("revision"), piece("new"), piece("removed"), piece("leftover")], f = await fixture(t, pieces);
  const fresh = f.raw.get(project, piece("new").subject)!;
  f.raw.remove(project, fresh.subject);
  const organizer = f.make(pieces.slice(0, 4), unsupported, async () => () => "unsupported");
  const cards = new KnowledgeCards(f.raw, organizer), edited = Promise.withResolvers<void>();
  let expected: ReturnType<typeof f.raw.list> = [];
  f.onList(() => { setImmediate(() => {
    try {
      for (const id of ["edit", "leftover"]) cards.edit(caller, { subject: piece(id).subject, title: "Personal title" });
      cards.exclude(caller, { subject: piece("edit").subject, excluded: true });
      f.raw.put({ ...f.raw.get(project, piece("revision").subject)!, revision: "r2" });
      f.raw.put({ ...fresh, title: "New card", edited: ["title"] });
      f.raw.remove(project, piece("removed").subject);
      expected = f.raw.list(project); edited.resolve();
    } catch (error) { edited.reject(error); }
  }); });
  const running = organizer.reconcile(project);
  await edited.promise; await running;
  assert.deepEqual(f.raw.list(project), expected);
});

for (const stop of ["close", "remove"] as const) for (const stage of ["prepare", "io"] as const) {
  test(`Knowledge's prepared path stops without Store access after ${stop} during ${stage}`, async t => {
    const release = Promise.withResolvers<void>(); t.after(() => release.resolve());
    const f = await fixture(t), entered = Promise.withResolvers<void>(), stopped = Promise.withResolvers<void>();
    let classified = 0, accesses = -1;
    const organizer = f.make([piece("one")], unsupported, async () => {
      if (stage === "prepare") { entered.resolve(); await release.promise; }
      return () => { classified += 1; return "unsupported"; };
    });
    const halt = async () => {
      accesses = f.accesses.length;
      if (stop === "close") { await organizer.close(); f.closeStore(); }
      else { organizer.removeProject(project); f.raw.removeProject(project); }
    };
    if (stage === "io") f.onList(() => { setImmediate(() => { void halt().then(stopped.resolve, stopped.reject); }); });
    const running = organizer.reconcile(project);
    try {
      if (stage === "prepare") { await entered.promise; await halt(); release.resolve(); }
      else await stopped.promise;
      await running;
      assert.equal(classified, 0);
      assert.equal(f.accesses.length, accesses);
    } finally { release.resolve(); await running; }
  });
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
