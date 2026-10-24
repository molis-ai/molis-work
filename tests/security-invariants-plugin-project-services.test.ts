import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  PluginDatabaseDeclaration, PluginDefinition, PluginHostServices, PluginManifest, PluginProjectDatabaseTransaction,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { deferred } from "./fixtures/home-runtime.js";
import { pluginActions } from "./fixtures/plugin-actions.js";

// S-66 (PG-087, PG-094 S9-0b): a plugin reaches the project's Attention entries and Context Ledger edges only through
// `services.attention` and `services.contextLedger`. Each call asks the grants, the installation and the original caller of the action
// it runs for, a write joins the plugin's own transaction, and an entry is added only for a kind of subject the Manifest declares.

const HOST_ACTOR = "tester", OWNER = "owner", AT = "2026-10-24T00:00:00.000Z";
const A_READ = "attention:read", A_WRITE = "attention:write", L_READ = "context-ledger:read", L_WRITE = "context-ledger:write";
type Call = "create" | "setStatus" | "deleteSubject" | "put" | "remove" | "list" | "get" | "events" | "ledgerList" | "ledgerGet" | "history";
const WRITES: readonly Call[] = ["create", "setStatus", "deleteSubject", "put", "remove"];
const READS: readonly Call[] = ["list", "get", "events", "ledgerList", "ledgerGet", "history"];
const FAILURES = ["revoke", "cancel", "replace"] as const;

const ref = (id: string) => ({ module: "plugins" as const, id, version: null, scope: { kind: "personal" as const, id: DEMO_PROJECT_ID }, project_id: DEMO_PROJECT_ID, object_type: "probe" });

/** One call of the two services as a plugin makes it, inside its transaction (writes) or beside it (reads). */
function call(services: PluginHostServices, tx: PluginProjectDatabaseTransaction, which: Call, name: string, subject = "goal_decision"): unknown {
  const attention = services.attention!, ledger = services.contextLedger!;
  const type = subject as "goal_decision";
  switch (which) {
    case "create": return attention.join(tx, w => w.create({ subject_type: type, subject_id: name, reason: "goal_decision", detail: { name } }));
    case "setStatus": return attention.join(tx, w => w.setStatus("none", "in_progress"));
    case "deleteSubject": return attention.join(tx, w => w.deleteSubject(type, name));
    case "put": return ledger.join(tx, w => w.put({ key: `edge-${name}`, type: "probe.refers", source: ref(name), target: ref(`${name}-target`), cause: "测试" }));
    case "remove": return ledger.join(tx, w => w.remove(`edge-${name}`, "测试"));
    case "list": return attention.list();
    case "get": return attention.get("none");
    case "events": return attention.events();
    case "ledgerList": return ledger.list();
    case "ledgerGet": return ledger.get(`edge-${name}`);
    default: return ledger.history(`edge-${name}`);
  }
}

interface ProbeInput { readonly name: string; readonly step: string; readonly which?: Call; readonly subject?: string }

/** A plugin that exists only for the test, with a table of its own in the project's library; `grants` are the permissions it asks for. */
function probe(short: string, grants: readonly string[], subjects: readonly string[], peer?: () => PluginHostServices, actionPermissions?: readonly string[],
  idOf = `io.molis.work.example.${short}`) {
  const id = idOf, read = `${short}:read`, write = `${short}:write`;
  const gate = { entered: deferred(), release: deferred(), left: undefined as Promise<unknown> | undefined, hook: () => {}, inner: undefined as unknown, kept: undefined as (() => unknown) | undefined };
  let services: PluginHostServices | undefined;
  const table: PluginDatabaseDeclaration = { store_name: short, version: 1, read_permission: read, write_permission: write,
    schema: `CREATE TABLE ${short}_notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);` };
  const act: ActionDefinition<ProbeInput, boolean> = { capability_id: `${id}.act`, version: 1, operation: "command", action: { scope: "project", audiences: ["user"],
    permissions: [write, ...(actionPermissions ?? grants)], subject_kinds: [], scheduling: "concurrent", title: "写一项并记注意力", description: "写一项并记注意力", kind: "operation",
    input_schema: { type: "object", additionalProperties: false, required: ["name", "step"], properties: { name: { type: "string" }, step: { type: "string" },
      which: { type: "string" }, subject: { type: "string" } } }, output_schema: { type: "boolean" } } };
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: id, kind: "app",
    publisher: { publisher_id: "molis", signature: `probe-${short}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["storage:private", read, write, ...grants].map(permission => ({ permission, required: true, reason: "写自己的数据" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [act], databases: { project: table },
    ...(subjects.length > 0 ? { attention: { subjects: subjects as never } } : {}),
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
  const insert = (tx: PluginProjectDatabaseTransaction, name: string) => tx.run(`INSERT INTO ${short}_notes (text) VALUES (?)`, [name]);
  const definition: PluginDefinition = { manifest, start(context) {
    services = context.services;
    return { kind: "app", views: [], actions: [{ ...act, handle: async (_caller, raw) => {
      const input = raw as ProbeInput, own = context.services!, database = own.project_database!;
      const held = () => { gate.entered.resolve(); return gate.release.promise; };
      const both = (tx: PluginProjectDatabaseTransaction) => { insert(tx, input.name); for (const which of ["create", "put"] as const) call(own, tx, which, input.name); };
      if (input.step === "wait") await database.transaction(held, both);
      else if (input.step === "both") await database.transaction(async () => {}, both);
      else if (input.step === "mid") {
        // The caller changes inside the write body, between the plugin's own statement and the service call.
        await database.transaction(async () => {}, tx => {
          insert(tx, input.name); gate.hook();
          try { call(own, tx, input.which!, input.name, input.subject); gate.inner = "allowed"; } catch (error) { gate.inner = error; throw error; }
        });
      } else if (input.step === "plain") await database.transaction(async () => {}, tx => { insert(tx, input.name); call(own, tx, input.which!, input.name, input.subject); });
      else if (input.step === "retain") {
        let kept: PluginProjectDatabaseTransaction | undefined;
        await database.transaction(async () => {}, tx => { kept = tx; });
        call(own, kept!, input.which!, input.name);
      } else if (input.step === "leave") {
        gate.left = gate.release.promise.then(() => database.transaction(async () => {}, tx => { call(own, tx, "create", input.name); }));
      } else if (input.step === "borrow") {
        await peer!().project_database!.transaction(async () => {}, tx => { call(peer!(), tx, "create", input.name); });
      } else if (input.step === "foreign") {
        await database.transaction(async () => {}, tx => { insert(tx, input.name); own.contextLedger!.join(tx, w => w.put({ key: `edge-${input.name}`, type: "probe.refers",
          source: { ...ref(input.name), scope: { kind: "personal", id: "another-project" } }, target: ref(`${input.name}-target`), cause: "测试" })); });
      } else if (input.step === "twice") {
        // Two writes of one join; the caller changes between them, so the second must ask again.
        await database.transaction(async () => {}, tx => {
          insert(tx, input.name);
          const second = `${input.name}-second`;
          if (input.which === "put") own.contextLedger!.join(tx, w => {
            w.put({ key: `edge-${input.name}`, type: "probe.refers", source: ref(input.name), target: ref(`${input.name}-target`), cause: "测试" });
            gate.hook();
            try { w.put({ key: `edge-${second}`, type: "probe.refers", source: ref(second), target: ref(`${second}-target`), cause: "测试" }); gate.inner = "allowed"; } catch (error) { gate.inner = error; throw error; }
          });
          else own.attention!.join(tx, w => {
            w.create({ subject_type: "goal_decision", subject_id: input.name, reason: "goal_decision" });
            gate.hook();
            try { w.create({ subject_type: "goal_decision", subject_id: second, reason: "goal_decision" }); gate.inner = "allowed"; } catch (error) { gate.inner = error; throw error; }
          });
        });
      } else if (input.step === "stray") {
        // A plugin that names a project of its own in the entry it adds.
        await database.transaction(async () => {}, tx => { own.attention!.join(tx, w => { w.create({ subject_type: "goal_decision", subject_id: input.name, reason: "goal_decision", project_id: "another-project" } as never); }); });
      } else if (input.step === "keep") {
        // A writer kept past the transaction it joined.
        await database.transaction(async () => {}, tx => { own.attention!.join(tx, w => { gate.kept = () => w.create({ subject_type: "goal_decision", subject_id: input.name, reason: "goal_decision" }); }); });
        gate.kept!();
      }
      return true;
    } }] };
  } };
  return { id, short, definition, act, write, gate, services: () => services ?? assert.fail("the probe has not started"),
    reset() { gate.entered = deferred(); gate.release = deferred(); gate.left = undefined; gate.hook = () => {}; gate.inner = undefined; gate.kept = undefined; } };
}

/** The project platform the Host builds, with the plugins the cases need. */
async function platform(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "plugin-project-services-")), file = join(home, "project.db");
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
  const all = [A_READ, A_WRITE, L_READ, L_WRITE];
  const main = probe("attnmain", all, ["goal_decision"]), peer = probe("attnpeer", all, ["goal_decision"], () => main.services());
  const reader = probe("attnreader", [A_READ, L_READ], []), bare = probe("attnbare", [], []);
  // The action of `loose` does not declare the permissions it holds: holding them is not enough to write.
  const loose = probe("attnloose", all, ["goal_decision"], undefined, []);
  // An install whose id is main's id and a dot more: with a dot as the separator, main's namespace would contain its names.
  const child = probe("attnchild", all, ["goal_decision"], undefined, undefined, `${main.id}.child`);
  assert.deepEqual((await running.start([main, peer, reader, bare, loose, child].map(item => ({ definition: item.definition, bundled: true })))).running.toSorted(),
    [main, peer, reader, bare, loose, child].map(item => item.id).toSorted());
  const noted = (short: string, name: string) => store.db.prepare(`SELECT 1 FROM ${short}_notes WHERE text = ?`).get(name) !== undefined;
  const entry = (name: string) => store.db.prepare("SELECT project_id, status, reason FROM inbox_entries WHERE subject_id = ?").get(name) as
    { project_id: string; status: string; reason: string } | undefined;
  // The edge is stored under its plugin's id: `<plugin_id>:edge-<name>`.
  const edge = (name: string) => store.db.prepare("SELECT actor_id FROM context_edges WHERE edge_key LIKE ?").get(`%:edge-${name}`) as { actor_id: string } | undefined;
  const keys = () => (store.db.prepare("SELECT edge_key FROM context_edges ORDER BY edge_key").all() as Array<{ edge_key: string }>).map(row => row.edge_key);
  const events = (name: string) => store.db.prepare("SELECT actor_id, type, project_id FROM events WHERE object_type = 'inbox_entry' AND json_extract(payload_json, '$.subject_id') = ? ORDER BY seq")
    .all(name) as Array<{ actor_id: string; type: string; project_id: string }>;
  /** Nothing of this name in the plugin's table, the entries, the edges or the events. */
  const nothing = (short: string, name: string) => !noted(short, name) && entry(name) === undefined && edge(name) === undefined && events(name).length === 0;
  return { client: actions.client, main, peer, reader, bare, loose, child, noted, entry, edge, keys, events, nothing };
}

/** The original caller. */
function caller(permissions: readonly string[], extra: Partial<ActionCallContext> = {}) {
  const abort = new AbortController();
  let refusal: ActionError | undefined;
  const context: ActionCallContext = { actor_id: OWNER, project_id: DEMO_PROJECT_ID, audience: "user", permissions: [...permissions], signal: abort.signal,
    assert_authority_current: () => { if (refusal) throw refusal; }, ...extra };
  return { context, cancel: () => abort.abort(), revoke: () => { refusal = new ActionError("actions.forbidden", "the caller was revoked"); },
    replace: () => { refusal = new ActionError("actions.provider_changed", "the caller's provider changed"); } };
}

const permissionsOf = (item: { write: string }) => [item.write, A_WRITE, L_WRITE, A_READ, L_READ];
const codeOf = (failure: (typeof FAILURES)[number]) => failure === "revoke" ? "actions.forbidden" : "actions.provider_changed";
const outcomeOf = (promise: Promise<unknown>) => promise.then(() => "written" as const, (error: unknown) => error as { code?: string; name?: string });

// RAC-273
test("S-66 a plugin's own wait does not stand in for its caller: revoked, cancelled or moved to another provider while it waits, the plugin's row, the entry and the edge are all absent", async t => {
  const { client, main, nothing } = await platform(t);
  for (const failure of FAILURES) {
    main.reset();
    const call = caller(permissionsOf(main)), name = `wait-${failure}`;
    const pending = outcomeOf(client.invoke(call.context, main.act, { name, step: "wait" }));
    await main.gate.entered.promise;
    call[failure]();
    main.gate.release.resolve();
    const outcome = await pending;
    if (failure === "cancel") assert.equal((outcome as { name?: string }).name, "AbortError", name);
    else assert.equal((outcome as { code?: string }).code, codeOf(failure), name);
    assert.equal(nothing(main.short, name), true, `${name}: refused after the plugin's own wait passed`);
  }
});

// RAC-274
for (const which of [...WRITES, ...READS]) {
  test(`S-66 ${which}: asks the original caller again inside the transaction; a caller that is gone by then writes and reads nothing, and the transaction rolls back`, async t => {
    const { client, main, nothing } = await platform(t);
    for (const failure of FAILURES) {
      main.reset();
      const call = caller(permissionsOf(main)), name = `${which}-${failure}`;
      main.gate.hook = call[failure];
      const outcome = await outcomeOf(client.invoke(call.context, main.act, { name, step: "mid", which }));
      const inner = main.gate.inner as { code?: string; name?: string } | "allowed" | undefined;
      assert.notEqual(inner, "allowed", `${name}: the service call itself refused, not only the commit after it`);
      for (const said of [outcome as { code?: string; name?: string }, inner as { code?: string; name?: string }]) {
        if (failure === "cancel") assert.equal(said.name, "AbortError", name);
        else assert.equal(said.code, codeOf(failure), name);
      }
      assert.equal(nothing(main.short, name), true, `${name}: the plugin's own row of the same transaction is rolled back with it`);
    }
  });
}

// RAC-274
for (const which of ["create", "put"] as const) {
  test(`S-66 ${which}: a second write of the same join asks the original caller again; one that is gone by then writes nothing, not even the first`, async t => {
    const { client, main, nothing } = await platform(t);
    for (const failure of FAILURES) {
      main.reset();
      const call = caller(permissionsOf(main)), name = `twice-${which}-${failure}`;
      main.gate.hook = call[failure];
      const outcome = await outcomeOf(client.invoke(call.context, main.act, { name, step: "twice", which }));
      const inner = main.gate.inner as { code?: string; name?: string } | "allowed" | undefined;
      assert.notEqual(inner, "allowed", `${name}: the second write itself refused`);
      for (const said of [outcome as { code?: string; name?: string }, inner as { code?: string; name?: string }]) {
        if (failure === "cancel") assert.equal(said.name, "AbortError", name);
        else assert.equal(said.code, codeOf(failure), name);
      }
      assert.equal(nothing(main.short, name), true, `${name}: the first write and the plugin's row went with it`);
      assert.equal(nothing(main.short, `${name}-second`), true, `${name}: the second write left nothing`);
    }
  });
}

// RAC-275
test("S-66 a writer kept past its transaction, a handle kept past its transaction, and work an action leaves running, write nothing", async t => {
  const { client, main, nothing } = await platform(t);
  main.reset();
  await assert.rejects(client.invoke(caller(permissionsOf(main)).context, main.act, { name: "kept", step: "keep" }), { code: "actions.forbidden" });
  assert.equal(nothing(main.short, "kept"), true, "a writer kept past its transaction writes nothing");
  for (const which of WRITES) {
    main.reset();
    const name = `retained-${which}`;
    await assert.rejects(client.invoke(caller(permissionsOf(main)).context, main.act, { name, step: "retain", which }), { code: "actions.forbidden" }, which);
    assert.equal(nothing(main.short, name), true, `${which}: a transaction handle kept past its transaction writes nothing`);
  }
  main.reset();
  assert.equal(await client.invoke(caller(permissionsOf(main)).context, main.act, { name: "left", step: "leave" }), true);
  main.gate.release.resolve();
  await assert.rejects(main.gate.left!, { code: "actions.expired" });
  assert.equal(nothing(main.short, "left"), true, "work left running after the action returned writes nothing");
});

// RAC-275
test("S-66 a service reached through one installation refuses inside another installation's action", async t => {
  const { client, main, peer, nothing } = await platform(t);
  peer.reset();
  await assert.rejects(client.invoke(caller(permissionsOf(peer)).context, peer.act, { name: "borrowed", step: "borrow" }), { code: "actions.forbidden" });
  assert.equal(nothing(main.short, "borrowed"), true, "the peer's action cannot write the main plugin's entries");
});

// RAC-276
test("S-66 the services are the plugin's by grant: without the permissions there is no service, a reader cannot write, and an action that does not declare the permission cannot either", async t => {
  const { client, reader, bare, loose, nothing } = await platform(t);
  assert.equal(bare.services().attention, undefined, "no attention permission, no attention service");
  assert.equal(bare.services().contextLedger, undefined, "no ledger permission, no ledger service");
  assert.equal(typeof reader.services().attention!.list, "function");
  for (const which of WRITES) {
    reader.reset();
    const name = `reader-${which}`;
    await assert.rejects(client.invoke(caller([reader.write, A_READ, L_READ]).context, reader.act, { name, step: "plain", which }), { code: "plugin.grant_denied" }, which);
    assert.equal(nothing(reader.short, name), true, `${which}: a plugin holding only the read permission writes nothing`);
    loose.reset();
    const quiet = `loose-${which}`;
    await assert.rejects(client.invoke(caller(permissionsOf(loose)).context, loose.act, { name: quiet, step: "plain", which }), { code: "actions.forbidden" }, which);
    assert.equal(nothing(loose.short, quiet), true, `${which}: an action that does not declare the permission writes nothing`);
  }
  assert.equal(Array.isArray(reader.services().attention!.list()), true, "outside every action a reader reads");
});

// RAC-277
test("S-66 an entry is added or deleted only for a kind of subject the Manifest declares, and the project is the call's", async t => {
  const { client, main, entry, events, nothing } = await platform(t);
  for (const which of ["create", "deleteSubject"] as const) {
    main.reset();
    const name = `undeclared-${which}`;
    await assert.rejects(client.invoke(caller(permissionsOf(main)).context, main.act, { name, step: "plain", which, subject: "feed_item" }), { code: "actions.forbidden" }, which);
    assert.equal(nothing(main.short, name), true, `${which}: another kind of subject is not this plugin's`);
  }
  main.reset();
  assert.equal(await client.invoke(caller(permissionsOf(main)).context, main.act, { name: "declared", step: "both" }), true);
  assert.equal(entry("declared")?.project_id, DEMO_PROJECT_ID);
  main.reset();
  assert.equal(await client.invoke(caller(permissionsOf(main)).context, main.act, { name: "stray", step: "stray" }), true);
  assert.equal(entry("stray")?.project_id, DEMO_PROJECT_ID, "a project the plugin names is overwritten by the call's");
  assert.deepEqual(events("declared").map(item => [item.type, item.actor_id, item.project_id]), [["inbox_entry.created", OWNER, DEMO_PROJECT_ID]], "the entry's event is written for the caller");
  assert.equal(main.services().attention!.findActiveForSubject("goal_decision", "declared")?.status, "open");
  assert.equal(main.services().attention!.list().some(item => item.subject_id === "declared"), true);
});

// RAC-277
test("S-66 the edge of the ledger is written for the caller in this project; a reference into another scope is refused and nothing stays", async t => {
  const { client, main, edge, nothing } = await platform(t);
  assert.equal(await client.invoke(caller(permissionsOf(main), { audit_actor_id: "author" }).context, main.act, { name: "audited", step: "both" }), true);
  assert.equal(edge("audited")?.actor_id, "author", "the recorded author of the call");
  const ledger = main.services().contextLedger!;
  assert.equal(ledger.get("edge-audited")?.state, "active");
  assert.equal(ledger.list({ type: "probe.refers" }).some(item => item.key === "edge-audited"), true);
  assert.equal(ledger.history("edge-audited").length, 1);
  await assert.rejects(main.services().project_database!.transaction(async () => {}, tx => ledger.join(tx, w => w.put({ key: "edge-outside", type: "probe.refers",
    source: ref("outside"), target: ref("outside-target"), cause: "测试" }))), { code: "actions.forbidden" }, "outside every action nothing is writable");
  main.reset();
  await assert.rejects(client.invoke(caller(permissionsOf(main)).context, main.act, { name: "foreign", step: "foreign" }), { code: "context_ledger.scope_mismatch" });
  assert.equal(nothing(main.short, "foreign"), true, "a reference into another project's scope leaves nothing behind");
});

// RAC-278
test("S-66 an Inbox entry and the plugin's own rows land together or not at all: a failure after the entry rolls it back", async t => {
  const { client, main, entry, noted } = await platform(t);
  assert.equal(await client.invoke(caller(permissionsOf(main)).context, main.act, { name: "once", step: "both" }), true);
  main.reset();
  // The second call finds the entry already there (created: false) and the edge unchanged, so it succeeds without a second row.
  assert.equal(await client.invoke(caller(permissionsOf(main)).context, main.act, { name: "once", step: "both" }), true);
  assert.equal(noted(main.short, "once"), true);
  assert.equal(main.services().attention!.findForSubject("goal_decision", "once").length, 1, "the same subject and reason is one entry");
  main.reset();
  await assert.rejects(client.invoke(caller(permissionsOf(main)).context, main.act, { name: "bad", step: "plain", which: "setStatus" }), undefined);
  assert.equal(entry("bad"), undefined);
  assert.equal(noted(main.short, "bad"), false, "the plugin's row went with the failed service call");
});

// RAC-279
test("S-66 a Manifest declares attention subjects only with attention:write, only the platform's kinds, once each", () => {
  const base = { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.subjects", version: "1.0.0", name: "subjects", kind: "app",
    publisher: { publisher_id: "molis", signature: "probe-subjects" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
  const permission = (name: string) => ({ permission: name, required: true, reason: "测试" });
  const parse = (permissions: string[], attention: unknown) => parsePluginManifest({ ...base, permissions: permissions.map(permission), attention });
  assert.equal(parse([A_WRITE], { subjects: ["goal_decision"] }).attention?.subjects[0], "goal_decision");
  assert.throws(() => parse([], { subjects: ["goal_decision"] }), /attention:write/);
  assert.throws(() => parse([A_WRITE], { subjects: ["somebody_elses"] }), /平台登记/);
  assert.throws(() => parse([A_WRITE], { subjects: ["goal_decision", "goal_decision"] }), /重复/);
  assert.throws(() => parse([A_WRITE], { subjects: [] }), /至少/);
  assert.throws(() => parse([A_WRITE], { subjects: ["goal_decision"], other: 1 }), /不认/);
});

// RAC-280
test("S-66 the key of an edge is the plugin's own: stored under its id and read back bare, so two plugins' edges of one key are two edges and neither reaches the other's", async t => {
  const { client, main, peer, keys } = await platform(t);
  const run = (who: typeof main, which: "put" | "remove") => { who.reset(); return client.invoke(caller(permissionsOf(who)).context, who.act, { name: "shared", step: "plain", which }); };
  assert.equal(await run(main, "put"), true);
  assert.equal(await run(peer, "put"), true);
  assert.deepEqual(keys(), [`${main.id}:edge-shared`, `${peer.id}:edge-shared`].toSorted(), "each edge is stored under its plugin's id");
  const mine = main.services().contextLedger!, theirs = peer.services().contextLedger!;
  assert.deepEqual(mine.list().map(item => item.key), ["edge-shared"], "a list shows this plugin's edges only, with the key the plugin wrote");
  assert.deepEqual(theirs.list().map(item => item.key), ["edge-shared"]);
  assert.equal(mine.get("edge-shared")?.key, "edge-shared");
  assert.equal(mine.history("edge-shared").length, 1);
  assert.equal(mine.get(`${peer.id}:edge-shared`), null, "naming another plugin's stored key reaches nothing: it is read as a bare key of this plugin");
  assert.deepEqual(mine.history(`${peer.id}:edge-shared`), []);
  assert.equal(await run(main, "remove"), true);
  assert.equal(mine.get("edge-shared"), null, "a removed edge is no longer read");
  assert.equal(mine.history("edge-shared").at(-1)?.state, "removed");
  assert.equal(theirs.get("edge-shared")?.state, "active", "removing the plugin's own edge leaves the other plugin's edge of the same key as it was");
  assert.equal(theirs.history("edge-shared").length, 1);
});

// RAC-281
test("S-66 two installs whose ids are dot-prefixes of each other are strangers to the ledger: neither lists, reads or removes the other's edges", async t => {
  const { client, main, child, keys } = await platform(t);
  const put = (who: typeof main, name: string) => { who.reset(); return client.invoke(caller(permissionsOf(who)).context, who.act, { name, step: "plain", which: "put" }); };
  assert.equal(await put(main, "parent"), true);
  assert.equal(await put(child, "kid"), true);
  assert.deepEqual(keys(), [`${child.id}:edge-kid`, `${main.id}:edge-parent`].toSorted());
  const parentLedger = main.services().contextLedger!, kidLedger = child.services().contextLedger!;
  assert.deepEqual(parentLedger.list().map(item => item.key), ["edge-parent"], "the parent's namespace does not contain the child's names");
  assert.deepEqual(kidLedger.list().map(item => item.key), ["edge-kid"]);
  assert.equal(parentLedger.get("child:edge-kid"), null);
  assert.equal(parentLedger.get("edge-kid"), null);
  assert.equal(kidLedger.get("edge-parent"), null);
});
