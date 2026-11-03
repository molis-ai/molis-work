import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  PluginDatabaseDeclaration, PluginDefinition, PluginHostServices, PluginManifest, PluginProjectDatabaseTransaction,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { deferred } from "./fixtures/home-runtime.js";
import { pluginActions } from "./fixtures/plugin-actions.js";

// S-63 (PG-094 S9-0): a plugin reaches the project's journal (the events and the idempotency records of its actions) only through
// `services.project_database.journal`, which asks, on every call, what a statement of its own tables asks: the grants, and the
// original caller of the action it runs for. A call cancelled, revoked or moved to another provider writes nothing there either,
// and the actor of a row is the caller's, never the plugin's to choose. The journal is shared by every owner of the project, so
// each plugin has its own part of it: what it writes is stored under its plugin id, and it reads, counts and looks up only that.

const HOST_ACTOR = "tester", OWNER = "owner", AT = "2026-10-23T00:00:00.000Z", JOURNAL = "journal:project", NAMESPACE = "io.molis.work.example.";
type Method = "appendEvent" | "putIdempotency" | "getIdempotency" | "eventCursor" | "readEventsDescending";
const METHODS: readonly Method[] = ["appendEvent", "putIdempotency", "getIdempotency", "eventCursor", "readEventsDescending"];
const WRITES: readonly Method[] = ["appendEvent", "putIdempotency"];
const FAILURES = ["revoke", "cancel", "replace"] as const;

/** One call of the journal as a plugin makes it, on the transaction's handle. `extra` is what a plugin might add to the event to name its own project. */
function journalCall(tx: PluginProjectDatabaseTransaction, method: Method, actor: string, name: string, extra: Record<string, unknown> = {}): unknown {
  switch (method) {
    case "appendEvent": return tx.journal.appendEvent({ eventId: `ev-${name}`, actorId: actor, type: "probe.noted", objectType: "probe", objectId: name,
      reason: "测试", payload: { name }, at: AT, ...extra });
    case "putIdempotency": return tx.journal.putIdempotency({ actorId: actor, operation: "probe.note", key: name, requestHash: "hash", outcome: { name }, at: AT });
    case "getIdempotency": return tx.journal.getIdempotency(actor, "probe.note", name);
    case "eventCursor": return tx.journal.eventCursor();
    default: return tx.journal.readEventsDescending();
  }
}

interface ProbeInput { readonly name: string; readonly step: string; readonly method?: Method; readonly actor?: string; readonly project?: string }

/** A plugin that exists only for the test, with a table of its own in the project's library; `journal` says whether it asks for the journal permission. */
function probe(short: string, journal: boolean, peer?: () => PluginHostServices, idOf = `io.molis.work.example.${short}`) {
  const id = idOf, read = `${short}:read`, write = `${short}:write`;
  const gate = { entered: deferred(), release: deferred(), left: undefined as Promise<unknown> | undefined, hook: () => {}, inner: undefined as unknown };
  let services: PluginHostServices | undefined;
  const table: PluginDatabaseDeclaration = { store_name: short, version: 1, read_permission: read, write_permission: write,
    schema: `CREATE TABLE ${short}_notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);` };
  const act: ActionDefinition<ProbeInput, boolean> = { capability_id: `${id}.act`, version: 1, operation: "command", action: { scope: "project", audiences: ["user"],
    permissions: [write], subject_kinds: [], scheduling: "concurrent", title: "写一项并记日志", description: "写一项并记日志", kind: "operation",
    input_schema: { type: "object", additionalProperties: false, required: ["name", "step"], properties: { name: { type: "string" }, step: { type: "string" },
      method: { type: "string" }, actor: { type: "string" }, project: { type: "string" } } }, output_schema: { type: "boolean" } } };
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: id, kind: "app",
    publisher: { publisher_id: "molis", signature: `probe-${short}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["storage:private", read, write, ...(journal ? [JOURNAL] : [])].map(permission => ({ permission, required: true, reason: "写自己的数据" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [act], databases: { project: table },
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
  const insert = (tx: PluginProjectDatabaseTransaction, name: string) => tx.run(`INSERT INTO ${short}_notes (text) VALUES (?)`, [name]);
  const definition: PluginDefinition = { manifest, start(context) {
    services = context.services;
    return { kind: "app", views: [], actions: [{ ...act, handle: async (caller, raw) => {
      const input = raw as ProbeInput, database = context.services!.project_database!, who = input.actor ?? caller.actor_id;
      const extra = input.project ? { projectId: input.project } : {};
      const held = () => { gate.entered.resolve(); return gate.release.promise; };
      if (input.step === "write") {
        // The plugin's own rows and the journal's in one transaction, after a wait that is the test's to end.
        await database.transaction(held, tx => { insert(tx, input.name); for (const method of WRITES) journalCall(tx, method, who, input.name, extra); });
      } else if (input.step === "both") {
        await database.transaction(async () => {}, tx => { insert(tx, input.name); for (const method of WRITES) journalCall(tx, method, who, input.name, extra); });
      } else if (input.step === "mid") {
        // The caller changes inside the write body, between the plugin's own statement and the journal call.
        await database.transaction(async () => {}, tx => {
          insert(tx, input.name); gate.hook();
          // What the journal call itself says, before the transaction's own check at COMMIT could refuse it for the same reason.
          try { journalCall(tx, input.method!, who, input.name); gate.inner = "allowed"; } catch (error) { gate.inner = error; throw error; }
        });
      } else if (input.step === "retain") {
        let kept: PluginProjectDatabaseTransaction | undefined;
        await database.transaction(async () => {}, tx => { kept = tx; });
        journalCall(kept!, input.method!, who, input.name);
      } else if (input.step === "leave") {
        gate.left = gate.release.promise.then(() => database.transaction(async () => {}, tx => { journalCall(tx, "appendEvent", who, input.name); }));
      } else if (input.step === "borrow") {
        await peer!().project_database!.transaction(async () => {}, tx => { journalCall(tx, "appendEvent", who, input.name); });
      } else if (input.step === "plain") {
        await database.transaction(async () => {}, tx => { insert(tx, input.name); journalCall(tx, input.method!, who, input.name); });
      }
      return true;
    } }] };
  } };
  return { id, short, definition, act, write, gate, services: () => services ?? assert.fail("the probe has not started"),
    reset() { gate.entered = deferred(); gate.release = deferred(); gate.left = undefined; gate.hook = () => {}; gate.inner = undefined; } };
}

/** The project platform the Host builds, with four plugins: three that hold the journal permission (`main`, `peer`, and `child`, whose id extends `main`'s) and one that does not (`bare`). */
async function platform(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "plugin-project-journal-")), file = join(home, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID);
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event),
    eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const running = createPluginPlatform({ actions, project_id: DEMO_PROJECT_ID, actor_id: HOST_ACTOR, db: store.db, journal: store,
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }), home: null });
  t.after(async () => {
    try {
      await running.closeCoordination();
      for (const instance of running.runtime.list()) if (instance.state === "running") await running.runtime.stop(instance.install_id);
    } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
  });
  const main = probe("journalmain", true), peer = probe("journalpeer", true, () => main.services()), bare = probe("journalbare", false);
  const child = probe("journalchild", true, undefined, `${main.id}.child`);
  assert.deepEqual((await running.start([main, peer, bare, child].map(item => ({ definition: item.definition, trust: { level: "host" } })))).running.toSorted(),
    [main.id, peer.id, bare.id, child.id].toSorted());
  const noted = (short: string, name: string) => store.db.prepare(`SELECT 1 FROM ${short}_notes WHERE text = ?`).get(name) !== undefined;
  const event = (name: string) => store.db.prepare("SELECT seq, project_id, actor_id, type, object_id FROM events WHERE event_id = ?").get(`ev-${name}`) as
    { seq: number; project_id: string; actor_id: string; type: string; object_id: string } | undefined;
  const record = (name: string) => store.db.prepare("SELECT project_id, actor_id, request_hash FROM idempotency_records WHERE operation LIKE '%:probe.note' AND idempotency_key = ?")
    .get(name) as { project_id: string; actor_id: string; request_hash: string } | undefined;
  const records = (key: string) => (store.db.prepare("SELECT operation, request_hash FROM idempotency_records WHERE idempotency_key = ? ORDER BY operation").all(key) as
    Array<{ operation: string; request_hash: string }>);
  /** An event the Host's own code wrote, in the bare name the journal's other owners (Governance, the native modules) use. */
  const hostEvent = (name: string) => store.appendEvent({ eventId: `ev-${name}`, projectId: DEMO_PROJECT_ID, actorId: HOST_ACTOR, type: "board.noted",
    objectType: "board", objectId: name, reason: "测试", payload: { name }, at: AT });
  /** Nothing of this name in the plugin's table, the events or the idempotency records. */
  const nothing = (short: string, name: string) => !noted(short, name) && event(name) === undefined && record(name) === undefined;
  return { client: actions.client, main, peer, bare, child, noted, event, record, records, hostEvent, nothing, stop: (item: { id: string }) =>
    running.runtime.stop(running.runtime.list().find(install => install.plugin_id === item.id)!.install_id) };
}

/** The original caller. `replace` is what a caller whose authority moved to another provider reports. */
function caller(permission: string, extra: Partial<ActionCallContext> = {}) {
  const abort = new AbortController();
  let refusal: ActionError | undefined;
  const context: ActionCallContext = { actor_id: OWNER, project_id: DEMO_PROJECT_ID, audience: "user", permissions: [permission], signal: abort.signal,
    assert_authority_current: () => { if (refusal) throw refusal; }, ...extra };
  const failures = { cancel: () => abort.abort(), revoke: () => { refusal = new ActionError("actions.forbidden", "the caller was revoked"); },
    replace: () => { refusal = new ActionError("actions.provider_changed", "the caller's provider changed"); } };
  return { context, ...failures };
}

const codeOf = (failure: (typeof FAILURES)[number]) => failure === "revoke" ? "actions.forbidden" : "actions.provider_changed";
const outcomeOf = (promise: Promise<unknown>) => promise.then(() => "written" as const, (error: unknown) => error as { code?: string; name?: string });

// RAC-265
test("S-63 a plugin's own wait does not stand in for its caller: revoked, cancelled or moved to another provider while it waits, the plugin's rows, the event and the idempotency record are all absent", async t => {
  const { client, main, nothing } = await platform(t);
  for (const failure of FAILURES) {
    main.reset();
    const call = caller(main.write), name = `wait-${failure}`;
    const pending = outcomeOf(client.invoke(call.context, main.act, { name, step: "write" }));
    await main.gate.entered.promise;
    call[failure]();
    main.gate.release.resolve();
    const outcome = await pending;
    if (failure === "cancel") assert.equal((outcome as { name?: string }).name, "AbortError", name);
    else assert.equal((outcome as { code?: string }).code, codeOf(failure), name);
    assert.equal(nothing(main.short, name), true, `${name}: refused after the plugin's own wait passed`);
  }
});

// RAC-266
for (const method of METHODS) {
  test(`S-63 ${method}: asks the original caller again inside the transaction; a caller that is gone by then writes and reads nothing, and the transaction rolls back`, async t => {
    const { client, main, event, record, nothing } = await platform(t);
    for (const failure of FAILURES) {
      main.reset();
      const call = caller(main.write), name = `${method}-${failure}`;
      main.gate.hook = call[failure];
      const outcome = await outcomeOf(client.invoke(call.context, main.act, { name, step: "mid", method }));
      const inner = main.gate.inner as { code?: string; name?: string } | "allowed" | undefined;
      assert.notEqual(inner, "allowed", `${name}: the journal call itself refused, not only the commit after it`);
      for (const said of [outcome as { code?: string; name?: string }, inner as { code?: string; name?: string }]) {
        if (failure === "cancel") assert.equal(said.name, "AbortError", name);
        else assert.equal(said.code, codeOf(failure), name);
      }
      assert.equal(nothing(main.short, name), true, `${name}: the plugin's own row of the same transaction is rolled back with it`);
    }
    main.reset();
    const current = `${method}-current`;
    assert.equal(await client.invoke(caller(main.write).context, main.act, { name: current, step: "plain", method }), true, "a current caller reaches the same call");
    if (method === "appendEvent") assert.equal(event(current)?.actor_id, OWNER);
    if (method === "putIdempotency") assert.equal(record(current)?.actor_id, OWNER);
  });
}

// RAC-267
test("S-63 a handle kept past its transaction, and work an action leaves running, write nothing once the transaction or the call has ended", async t => {
  const { client, main, nothing } = await platform(t);
  for (const method of METHODS) {
    main.reset();
    const name = `retained-${method}`;
    await assert.rejects(client.invoke(caller(main.write).context, main.act, { name, step: "retain", method }), { code: "actions.forbidden" }, method);
    assert.equal(nothing(main.short, name), true, `${method}: a retained handle writes nothing`);
  }
  main.reset();
  assert.equal(await client.invoke(caller(main.write).context, main.act, { name: "left", step: "leave" }), true);
  main.gate.release.resolve();
  await assert.rejects(main.gate.left!, { code: "actions.expired" });
  assert.equal(nothing(main.short, "left"), true, "work left running after the action returned writes no event");
});

// RAC-267
test("S-63 a journal reached through one installation refuses inside another installation's action", async t => {
  const { client, main, peer, nothing } = await platform(t);
  peer.reset();
  await assert.rejects(client.invoke(caller(peer.write).context, peer.act, { name: "borrowed", step: "borrow" }), { code: "actions.forbidden" });
  assert.equal(nothing(main.short, "borrowed"), true, "the peer's action cannot write the main plugin's journal rows");
});

// RAC-268
test("S-63 the journal is the plugin's by grant: without the permission every call refuses, the statements still cannot reach the tables, and a granted plugin reads them", async t => {
  const { client, main, bare, nothing } = await platform(t);
  for (const method of METHODS) {
    bare.reset();
    const name = `bare-${method}`;
    await assert.rejects(client.invoke(caller(bare.write).context, bare.act, { name, step: "plain", method }), { code: "plugin.grant_denied" }, method);
    assert.equal(nothing(bare.short, name), true, `${method}: refused for want of the permission, with its transaction`);
  }
  const database = bare.services().project_database!;
  assert.throws(() => database.journal.eventCursor(), { code: "plugin.grant_denied" });
  assert.throws(() => database.journal.readEventsDescending(), { code: "plugin.grant_denied" });
  for (const table of ["events", "idempotency_records"]) {
    assert.throws(() => bare.services().project_database!.all(`SELECT * FROM ${table}`), undefined, `a statement still cannot reach ${table}`);
  }
  assert.equal(typeof main.services().project_database!.journal.eventCursor(), "number", "a plugin holding the permission reads the journal");
});

// RAC-269
test("S-63 the actor of a row is the action's caller or its recorded author; outside every action it is the one the Host runs the project's plugins as", async t => {
  const { client, main, event, record, nothing } = await platform(t);
  const audited = caller(main.write, { audit_actor_id: "author" });
  assert.equal(await client.invoke(audited.context, main.act, { name: "as-caller", step: "both" }), true);
  assert.equal(event("as-caller")?.actor_id, OWNER);
  assert.equal(record("as-caller")?.actor_id, OWNER);
  main.reset();
  assert.equal(await client.invoke(audited.context, main.act, { name: "as-author", step: "both", actor: "author" }), true);
  assert.equal(event("as-author")?.actor_id, "author");
  for (const method of METHODS.filter(item => !["eventCursor", "readEventsDescending"].includes(item))) {
    main.reset();
    const name = `forged-${method}`;
    await assert.rejects(client.invoke(caller(main.write).context, main.act, { name, step: "plain", method, actor: "someone-else" }), { code: "actions.forbidden" }, method);
    assert.equal(nothing(main.short, name), true, `${method}: no row in another actor's name, and none of another actor's read`);
  }
  const services = main.services().project_database!;
  await services.transaction(async () => {}, tx => journalCall(tx, "appendEvent", HOST_ACTOR, "outside"));
  assert.equal(event("outside")?.actor_id, HOST_ACTOR);
  await assert.rejects(services.transaction(async () => {}, tx => journalCall(tx, "appendEvent", OWNER, "outside-forged")), { code: "actions.forbidden" });
  assert.equal(event("outside-forged"), undefined, "outside every action the caller's actor is nobody's to claim");
});

// RAC-270
test("S-63 the project of a row is the library's: an event naming another project lands in this one, and a read shows this project's events only", async t => {
  const { client, main, event } = await platform(t);
  assert.equal(await client.invoke(caller(main.write).context, main.act, { name: "mine", step: "both", project: "another-project" }), true);
  assert.equal(event("mine")?.project_id, DEMO_PROJECT_ID);
  const journal = main.services().project_database!.journal;
  const seen = journal.readEventsDescending();
  assert.equal(seen[0]?.object_id, "mine", "the newest event is first");
  assert.equal(seen.every(item => typeof item.event_id === "string"), true);
  assert.equal(journal.eventCursor(), seen[0]?.seq);
  assert.equal(journal.eventCursor("probe"), seen[0]?.seq, "the cursor of one object type");
  assert.equal(journal.eventCursor("no-such-type"), 0);
});

// RAC-271
test("S-63 a journal write joins the plugin's transaction: an idempotency record already there refuses the second, and the plugin's row goes with it", async t => {
  const { client, main, noted, record } = await platform(t);
  assert.equal(await client.invoke(caller(main.write).context, main.act, { name: "twice", step: "plain", method: "putIdempotency" }), true);
  const first = record("twice");
  assert.equal(first?.request_hash, "hash");
  main.reset();
  await assert.rejects(client.invoke(caller(main.write).context, main.act, { name: "twice", step: "plain", method: "putIdempotency" }));
  assert.equal(noted(main.short, "twice"), true, "the first call's row stays");
  assert.equal(Number(main.services().project_database!.all("SELECT count(*) AS n FROM journalmain_notes")[0]!.n), 1, "the second call's row did not stay");
});

// RAC-294
test("S-63 a plugin reads and counts only its own events: another owner's events, and the Host's, are not in its answer or its cursor, and the names it gets back are its own bare ones", async t => {
  const { client, main, peer, event, hostEvent } = await platform(t);
  assert.equal(await client.invoke(caller(main.write).context, main.act, { name: "main-note", step: "both" }), true);
  peer.reset();
  assert.equal(await client.invoke(caller(peer.write).context, peer.act, { name: "peer-note", step: "both" }), true);
  hostEvent("later");
  const mainSeq = event("main-note")!.seq, peerSeq = event("peer-note")!.seq;
  assert.ok(peerSeq > mainSeq, "the other owner's event is the newer one, so a cursor that counted it would be higher");
  assert.equal(event("main-note")!.type, `${NAMESPACE}journalmain:probe.noted`, "stored under the plugin's id and a colon");
  const mine = main.services().project_database!.journal, theirs = peer.services().project_database!.journal;
  assert.deepEqual(mine.readEventsDescending().map(item => `${item.object_id} ${item.type} ${item.object_type}`), ["main-note probe.noted probe"], "main: its own event, bare");
  assert.deepEqual(theirs.readEventsDescending().map(item => `${item.object_id} ${item.type} ${item.object_type}`), ["peer-note probe.noted probe"], "peer: its own event, bare");
  assert.deepEqual(mine.readEventsDescending().filter(item => JSON.stringify(item.payload).includes("peer")), [], "no payload of another owner's");
  assert.equal(mine.eventCursor(), mainSeq, "main's cursor ends at its own last event, not the project's");
  assert.equal(mine.eventCursor("probe"), mainSeq);
  assert.equal(theirs.eventCursor(), peerSeq);
  assert.equal(mine.eventCursor("board"), 0, "the Host's object type is nobody's but the Host's");
  // A name that already carries another owner's namespace is only a longer name of this one's: it lands in main's part, not in the peer's.
  await main.services().project_database!.transaction(async () => {}, tx => tx.journal.appendEvent({ eventId: "ev-impersonated", actorId: HOST_ACTOR, type: `${NAMESPACE}journalpeer.probe.noted`,
    objectType: `${NAMESPACE}journalpeer.probe`, objectId: "impersonated", reason: "测试", payload: {}, at: AT }));
  assert.deepEqual(theirs.readEventsDescending().map(item => item.object_id), ["peer-note"], "the peer still sees only its own");
  assert.equal(theirs.eventCursor(), peerSeq);
  assert.equal(mine.readEventsDescending()[0]?.object_id, "impersonated", "and the impersonating event is the plugin's own");
});

// RAC-295
test("S-63 an idempotency operation is the plugin's own: two owners using the same operation and key keep two records, and neither gets the other's", async t => {
  const { main, peer, records } = await platform(t);
  const put = (item: typeof main, hash: string) => item.services().project_database!.transaction(async () => {}, tx => tx.journal.putIdempotency({
    actorId: HOST_ACTOR, operation: "probe.note", key: "shared", requestHash: hash, outcome: { by: hash }, at: AT }));
  const get = (item: typeof main, key = "shared") => item.services().project_database!.transaction(async () => {}, tx => tx.journal.getIdempotency(HOST_ACTOR, "probe.note", key));
  await put(main, "main-hash");
  await put(peer, "peer-hash");
  assert.deepEqual(records("shared"), [{ operation: `${NAMESPACE}journalmain:probe.note`, request_hash: "main-hash" },
    { operation: `${NAMESPACE}journalpeer:probe.note`, request_hash: "peer-hash" }], "two records, each under its owner's id");
  assert.deepEqual(await get(main), { request_hash: "main-hash", outcome: { by: "main-hash" } });
  assert.deepEqual(await get(peer), { request_hash: "peer-hash", outcome: { by: "peer-hash" } });
  await main.services().project_database!.transaction(async () => {}, tx => tx.journal.putIdempotency({ actorId: HOST_ACTOR, operation: "probe.note", key: "only-main",
    requestHash: "x", outcome: null, at: AT }));
  assert.equal(await get(peer, "only-main"), null, "a key one owner stored is not found by another");
  await assert.rejects(put(main, "main-again"), "the same owner repeating its own operation and key is still the conflict it was");
});

// RAC-296
test("S-63 two installs whose ids are dot-prefixes of each other are strangers to the journal: no reads of each other's events, no writes under each other's names, no collisions of operations", async t => {
  const { main, child, event, records, hostEvent } = await platform(t);
  assert.ok(child.id.startsWith(`${main.id}.`), "the child's id extends the parent's at a dot");
  const parent = main.services().project_database!, kid = child.services().project_database!;
  const append = (database: typeof parent, id: string, type: string, objectType: string) => database.transaction(async () => {}, tx => tx.journal.appendEvent({
    eventId: id, actorId: HOST_ACTOR, type, objectType, objectId: id, reason: "测试", payload: { id }, at: AT }));
  // The bare names a dot-separated namespace would have stored as one and the same string: `a.b` + `c.x` and `a.b.c` + `x`.
  await append(parent, "ev-parent", "child.probe.noted", "child.probe");
  await append(kid, "ev-child", "probe.noted", "probe");
  hostEvent("unprefixed");
  assert.deepEqual(parent.journal.readEventsDescending().map(item => `${item.object_id} ${item.type}`), ["ev-parent child.probe.noted"], "the parent reads its own event and not the child's");
  assert.deepEqual(kid.journal.readEventsDescending().map(item => `${item.object_id} ${item.type}`), ["ev-child probe.noted"], "the child reads its own event and not the parent's");
  const parentSeq = event("parent")!.seq, childSeq = event("child")!.seq, hostSeq = event("unprefixed")!.seq;
  assert.ok(parentSeq < childSeq && childSeq < hostSeq, "written in this order, so a cursor that counted a stranger's event would end later");
  assert.equal(parent.journal.eventCursor(), parentSeq, "the parent's log ends at its own event");
  assert.equal(parent.journal.eventCursor("child.probe"), parentSeq, "and so does the cursor of its own object type");
  assert.equal(kid.journal.eventCursor(), childSeq, "the child's log ends at its own event, not at the Host's later one");
  assert.equal(kid.journal.eventCursor("probe"), childSeq);
  assert.equal(parent.journal.eventCursor("probe"), 0, "the child's object type is nothing of the parent's");
  const put = (database: typeof parent, operation: string, hash: string) => database.transaction(async () => {}, tx => tx.journal.putIdempotency({
    actorId: HOST_ACTOR, operation, key: "same", requestHash: hash, outcome: { by: hash }, at: AT }));
  const get = (database: typeof parent, operation: string) => database.transaction(async () => {}, tx => tx.journal.getIdempotency(HOST_ACTOR, operation, "same"));
  await put(parent, "child.probe.note", "parent-hash");
  await put(kid, "probe.note", "child-hash");
  assert.equal(records("same").length, 2, "two records, not one record the second could not write");
  assert.deepEqual(await get(parent, "child.probe.note"), { request_hash: "parent-hash", outcome: { by: "parent-hash" } });
  assert.deepEqual(await get(kid, "probe.note"), { request_hash: "child-hash", outcome: { by: "child-hash" } });
  assert.equal(await get(parent, "probe.note"), null, "the parent does not find the child's record under the child's name");
});
