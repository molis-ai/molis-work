import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  PluginArtifactPublishInput, PluginArtifactWriter, PluginDatabaseDeclaration, PluginDefinition, PluginHostServices, PluginManifest, PluginProjectDatabaseTransaction,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { artifactPreview } from "./fixtures/artifact-preview.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { seedBoard } from "./fixtures/goal-application.js";
import { pluginActions } from "./fixtures/plugin-actions.js";

// S-100 (provisional number; RAC-510, specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §13): a plugin pins a 成果 version
// in its own project transaction through `services.artifacts.join`, as it writes an Inbox entry through `services.attention.join` (S-68). The
// version is a savepoint of the plugin's transaction, committed with its rows or rolled back with them. Every `head` and `publish` asks the
// gate S-68 asks (the installation and its grant, the original caller, a concurrent action that declares artifact:write), the type must be
// one the Manifest produces (S-81), and the producer and the author are the platform's.

const deferred = () => Promise.withResolvers<void>();
const HOST_ACTOR = "tester", OWNER = "owner", AUTHOR = "runtime:assistant:session-1", WRITE = "artifact:write";
const FAILURES = ["revoke", "cancel", "replace"] as const;

interface ProbeInput { readonly name: string; readonly step: string }

/** A plugin that exists only for the test: a table of its own in the project's library, one 成果 type of its own, and three actions that pin. */
function probe(short: string, grants: readonly string[], peer?: () => PluginHostServices) {
  // A 成果 type has one producer, so each probe declares its own.
  const id = `io.molis.work.example.${short}`, read = `${short}:read`, write = `${short}:write`, type = `${short}.capture`, preview = artifactPreview(id, type);
  const gate = { entered: deferred(), release: deferred(), hook: () => {}, inner: undefined as unknown, value: undefined as unknown };
  let services: PluginHostServices | undefined;
  const table: PluginDatabaseDeclaration = { store_name: short, version: 1, read_permission: read, write_permission: write,
    schema: `CREATE TABLE ${short}_notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);` };
  const define = (name: string, permissions: readonly string[], concurrent: boolean, operation: "command" | "query" = "command"): ActionDefinition<ProbeInput, boolean> => ({
    capability_id: `${id}.${name}`, version: 1, operation, action: { scope: "project", audiences: ["user"], permissions: [write, ...permissions], subject_kinds: [],
      title: "写一项并发布成果", description: "写一项并发布成果", kind: operation === "query" ? "query" : "operation", ...(concurrent ? { scheduling: "concurrent" as const } : {}),
      input_schema: { type: "object", additionalProperties: false, required: ["name", "step"], properties: { name: { type: "string" }, step: { type: "string" } } },
      output_schema: { type: "boolean" } } });
  // `act` waits and declares what the plugin holds; `serial` declares it but does not wait; `loose` waits but does not declare it; `peek` is a query.
  const act = define("act", grants, true), serial = define("serial", grants, false), loose = define("loose", [], true), peek = define("peek", grants, true, "query");
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: id, kind: "app",
    publisher: { publisher_id: "molis", signature: `probe-${short}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["storage:private", read, write, ...grants].map(permission => ({ permission, required: true, reason: "写自己的数据" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [preview.type], consumes: [] }, ui: { contributions: [] },
    actions: [act, serial, loose, peek, preview.definition], databases: { project: table },
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
  const pin = (name: string, typeId = type): PluginArtifactPublishInput => ({ artifact_id: `pin-${name}`, version: 1, artifact_type_id: typeId, schema_version: 1,
    content: { kind: "inline", payload: { name } }, ...pinnedArtifact(name) });
  const insert = (tx: PluginProjectDatabaseTransaction, name: string) => tx.run(`INSERT INTO ${short}_notes (text) VALUES (?)`, [name]);
  /** The call a case is about: what it answered, or the refusal it threw, so the case can tell the call's own refusal from the commit's. */
  const watched = <T>(run: () => T): T => {
    try { const value = run(); gate.inner = "allowed"; gate.value = value; return value; } catch (error) { gate.inner = error; throw error; }
  };
  const handle = async (raw: unknown) => {
    const input = raw as ProbeInput, own = services!, database = own.project_database!, artifacts = own.artifacts!;
    const pinned = (tx: PluginProjectDatabaseTransaction, value = pin(input.name)) => { insert(tx, input.name); return watched(() => artifacts.join!(tx, w => w.publish(value))); };
    switch (input.step) {
      case "pin": await database.transaction(async () => {}, tx => pinned(tx)); break;
      case "wait": await database.transaction(() => { gate.entered.resolve(); return gate.release.promise; }, tx => pinned(tx)); break;
      // The caller changes inside the write body, between the plugin's own statement and the pin.
      case "mid": await database.transaction(async () => {}, tx => { insert(tx, input.name); gate.hook(); watched(() => artifacts.join!(tx, w => w.publish(pin(input.name)))); }); break;
      // Two pins of one join; the caller changes between them, so the second must ask again.
      case "twice": await database.transaction(async () => {}, tx => {
        insert(tx, input.name);
        artifacts.join!(tx, w => { w.publish(pin(input.name)); gate.hook(); watched(() => w.publish(pin(`${input.name}-second`))); });
      }); break;
      case "throw": await database.transaction(async () => {}, tx => { pinned(tx); throw new Error("the plugin's own write failed after the pin"); }); break;
      case "undeclared": await database.transaction(async () => {}, tx => pinned(tx, pin(input.name, `${short}.other`))); break;
      // What the plugin names of the producer, the author, the project and the scope is not the plugin's to name.
      case "forged": await database.transaction(async () => {}, tx => pinned(tx, { ...pin(input.name), producer: { plugin_id: "io.molis.work.feed", plugin_version: "9.9.9",
        binding_signature: "official-feed-binding" }, actor_id: "someone-else", project_id: "another-project", scope: "team_project" } as PluginArtifactPublishInput)); break;
      case "head": await database.transaction(async () => {}, tx => {
        insert(tx, input.name);
        watched(() => artifacts.join!(tx, w => { const before = w.head(`pin-${input.name}`); w.publish(pin(input.name)); return [before, w.head(`pin-${input.name}`)]; }));
      }); break;
      case "keep": {
        // A writer kept past the transaction it joined.
        let kept: PluginArtifactWriter | undefined;
        await database.transaction(async () => {}, tx => { artifacts.join!(tx, w => { kept = w; }); });
        watched(() => kept!.publish(pin(input.name)));
        break;
      }
      case "retain": {
        // A transaction handle kept past its transaction.
        let kept: PluginProjectDatabaseTransaction | undefined;
        await database.transaction(async () => {}, tx => { kept = tx; });
        watched(() => artifacts.join!(kept!, w => w.publish(pin(input.name))));
        break;
      }
      // Another installation's join, handed this installation's transaction.
      case "foreign": await database.transaction(async () => {}, tx => { insert(tx, input.name); watched(() => peer!().artifacts!.join!(tx, w => w.publish(pin(input.name)))); }); break;
      // Another installation's database and join, used inside this installation's action.
      case "borrow": await peer!().project_database!.transaction(async () => {}, tx => { watched(() => peer!().artifacts!.join!(tx, w => w.publish(pin(input.name)))); }); break;
      // A pin in a savepoint the plugin discards: the version is on the plugin's own connection, so it goes with the savepoint.
      case "discard": await database.transaction(async () => {}, tx => {
        insert(tx, input.name);
        tx.savepoint(() => ({ keep: false, value: watched(() => artifacts.join!(tx, w => w.publish(pin(input.name)))) }));
      }); break;
      // A join body that is not synchronous; its pin runs before the body returns its promise.
      case "async": await database.transaction(async () => {}, tx => { insert(tx, input.name); watched(() => artifacts.join!(tx, async w => w.publish(pin(input.name)))); }); break;
      default: throw new Error(`unknown step ${input.step}`);
    }
    return true;
  };
  const definition: PluginDefinition = { manifest, async start(context) {
    services = context.services;
    return { kind: "app", views: [], actions: [...[act, serial, loose, peek].map(action => ({ ...action, handle: (_caller: ActionCallContext, raw: unknown) => handle(raw) })), preview.handler] };
  } };
  return { id, short, definition, act, serial, loose, peek, write, gate, services: () => services ?? assert.fail("the probe has not started"),
    /** The plugin's own code outside every action and job (its `start`, a route, a timer it set up). */
    outside: (name: string) => handle({ name, step: "pin" }),
    reset() { gate.entered = deferred(); gate.release = deferred(); gate.hook = () => {}; gate.inner = undefined; gate.value = undefined; } };
}

/** The project platform the Host builds, with the three probes: two that pin, and one without the grant. */
async function platform(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "plugin-artifact-join-")), file = join(home, "project.db");
  seedBoard(file);
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
  const main: ReturnType<typeof probe> = probe("pinmain", [WRITE], () => peer.services()), peer: ReturnType<typeof probe> = probe("pinpeer", [WRITE], () => main.services());
  const bare = probe("pinbare", []), probes = [main, peer, bare];
  // The probes stand in for plugins this Host ships (host trust).
  assert.deepEqual((await running.start(probes.map(item => ({ definition: item.definition, trust: { level: "host" as const } })))).running.toSorted(), probes.map(item => item.id).toSorted());
  const noted = (name: string) => probes.some(item => store.db.prepare(`SELECT 1 FROM ${item.short}_notes WHERE text = ?`).get(name) !== undefined);
  const pinned = (name: string) => store.db.prepare(`SELECT i.project_id, i.producer_plugin_id AS plugin, i.producer_binding_signature AS signature,
    v.producer_plugin_version AS version, v.created_by AS author, v.scope FROM library_artifacts i JOIN library_artifact_versions v USING (artifact_id) WHERE artifact_id = ?`).all(`pin-${name}`);
  // The journal names a version `<artifact_id>@<version>`.
  const announced = (name: string) => (store.db.prepare("SELECT count(*) AS n FROM events WHERE object_id = ?").get(`pin-${name}@1`) as { n: number }).n;
  /** Nothing of this name in any probe's table, the 成果库 or the journal. */
  const nothing = (name: string) => !noted(name) && pinned(name).length === 0 && announced(name) === 0;
  const installOf = (item: ReturnType<typeof probe>) => running.runtime.list().find(record => record.plugin_id === item.id)!.install_id;
  return { store, running, client: actions.client, main, peer, bare, noted, pinned, announced, nothing, installOf };
}

/** The original caller, who can be cancelled, revoked or moved to another provider from outside. */
function caller(permissions: readonly string[]) {
  const abort = new AbortController();
  let refusal: ActionError | undefined;
  const context: ActionCallContext = { actor_id: OWNER, project_id: DEMO_PROJECT_ID, audience: "user", permissions: [...permissions], signal: abort.signal,
    assert_authority_current: () => { if (refusal) throw refusal; } };
  return { context, cancel: () => abort.abort(), revoke: () => { refusal = new ActionError("actions.forbidden", "the caller was revoked"); },
    replace: () => { refusal = new ActionError("actions.provider_changed", "the caller's provider changed"); } };
}

const permissionsOf = (item: { write: string }) => [item.write, WRITE];
const codeOf = (failure: (typeof FAILURES)[number]) => failure === "revoke" ? "actions.forbidden" : "actions.provider_changed";
const outcomeOf = (promise: Promise<unknown>) => promise.then(() => "written" as const, (error: unknown) => error as { code?: string; name?: string; message?: string });
/** The caller's own refusal, by its message too: the installation's gate and the transaction refuse with the same code in other words. */
const refusedAs = (said: unknown, failure: (typeof FAILURES)[number], what: string) => {
  if (failure === "cancel") assert.equal((said as { name?: string }).name, "AbortError", what);
  else {
    const { code, message } = said as { code?: string; message?: string };
    assert.deepEqual({ code, message }, { code: codeOf(failure), message: failure === "revoke" ? "the caller was revoked" : "the caller's provider changed" }, what);
  }
};
/** Which layer refused: the gate S-68 asks of the installation and of the action, or the transaction the join was handed. */
const CLOSED = /^插件数据库已关闭$/, ACTION = /写入需要声明了这项权限的可等待并行动作/, TRANSACTION = /需要此插件当前项目库中仍在执行的事务/,
  BORROWED = /^这次写入属于另一个插件实例，不属于正在运行的动作$/;

test("S-100 a pinned version and the plugin's own row commit together, as the Manifest's producer and the caller; a failure after the pin rolls both back", async t => {
  const f = await platform(t);
  assert.equal(await f.client.invoke(caller(permissionsOf(f.main)).context, f.main.act, { name: "together", step: "pin" }), true);
  assert.equal(f.noted("together"), true);
  assert.deepEqual(f.pinned("together"), [{ project_id: DEMO_PROJECT_ID, plugin: f.main.id, signature: "probe-pinmain", version: "1.0.0", author: OWNER, scope: "personal" }]);
  assert.equal(f.announced("together"), 1, "the journal event is in the same commit");
  f.main.reset();
  assert.notEqual(await outcomeOf(f.client.invoke(caller(permissionsOf(f.main)).context, f.main.act, { name: "rolled", step: "throw" })), "written");
  assert.equal(f.main.gate.inner, "allowed", "the pin itself went in");
  assert.equal(f.nothing("rolled"), true, "the plugin's failure after the pin rolled the version back with its own row");
  f.main.reset();
  assert.equal(await f.client.invoke(caller(permissionsOf(f.main)).context, f.main.act, { name: "seen", step: "head" }), true);
  const [before, after] = f.main.gate.value as [unknown, { version: number } | null];
  assert.equal(before, null);
  assert.equal(after?.version, 1, "head sees the transaction's own pin");
});

test("S-100 a plugin's own wait does not stand in for its caller: revoked, cancelled or moved to another provider while it waits, neither the row nor the version is there", async t => {
  const f = await platform(t);
  for (const failure of FAILURES) {
    f.main.reset();
    const call = caller(permissionsOf(f.main)), name = `wait-${failure}`;
    const pending = outcomeOf(f.client.invoke(call.context, f.main.act, { name, step: "wait" }));
    await f.main.gate.entered.promise;
    call[failure]();
    f.main.gate.release.resolve();
    refusedAs(await pending, failure, name);
    assert.equal(f.nothing(name), true, `${name}: refused after the plugin's own wait passed`);
  }
});

for (const step of ["mid", "twice"] as const) {
  test(`S-100 ${step}: publish asks the original caller again inside the transaction; a caller gone by then pins nothing, and the plugin's row of the same transaction rolls back`, async t => {
    const f = await platform(t);
    for (const failure of FAILURES) {
      f.main.reset();
      const call = caller(permissionsOf(f.main)), name = `${step}-${failure}`;
      f.main.gate.hook = call[failure];
      const outcome = await outcomeOf(f.client.invoke(call.context, f.main.act, { name, step }));
      assert.notEqual(f.main.gate.inner, "allowed", `${name}: the pin itself refused, not only the commit after it`);
      for (const said of [outcome, f.main.gate.inner]) refusedAs(said, failure, name);
      assert.equal(f.nothing(name), true, `${name}: the plugin's row and the first pin went with it`);
      assert.equal(f.nothing(`${name}-second`), true, `${name}: the second pin left nothing`);
    }
  });
}

test("S-100 an installation stopped, or stopped and its artifact:write revoked, while its action waits pins nothing; artifact:write gone from the stored grant of one that runs is refused at the join", async t => {
  for (const reason of ["stop", "revoke"] as const) {
    const f = await platform(t), name = `installation-${reason}`, install = f.installOf(f.main);
    const pending = outcomeOf(f.client.invoke(caller(permissionsOf(f.main)).context, f.main.act, { name, step: "wait" }));
    await f.main.gate.entered.promise;
    await f.running.runtime.stop(install);
    if (reason === "revoke") f.running.runtime.grant(install, ["storage:private", "pinmain:read", "pinmain:write"]);
    f.main.gate.release.resolve();
    const outcome = await pending;
    assert.notEqual(outcome, "written", name);
    // Stopping an installation closes its library, so the write after the wait is refused there, before any join.
    assert.match(String((outcome as { message?: string }).message), CLOSED, `${name}: the installation's own refusal`);
    assert.equal(f.main.gate.inner, undefined, `${name}: no join was reached`);
    assert.equal(f.nothing(name), true, `${name}: nothing of the call stays`);
  }
  // The Runtime changes a grant only on a stopped installation; this is the stored grant changing under one that runs, inside the write body,
  // after the plugin's own row. The join's first check asks the transaction, which asks the caller again, and the dispatcher's own check of the
  // provider sees the required grant gone: the join refuses as the call's provider, before its S-68 gate reads the installation record.
  const f = await platform(t), name = "installation-stored", install = f.installOf(f.main), records = new SqlitePluginRuntimeRepository(f.store.db);
  f.main.gate.hook = () => { const record = records.get(install)!; records.save({ ...record, grants: record.grants.filter(permission => permission !== WRITE) }); };
  const outcome = await outcomeOf(f.client.invoke(caller(permissionsOf(f.main)).context, f.main.act, { name, step: "mid" }));
  for (const said of [outcome, f.main.gate.inner]) {
    const { code, message } = said as { code?: string; message?: string };
    assert.deepEqual({ code, message }, { code: "actions.plugin_permission", message: "插件所需授权已撤销" }, `${name}: the join itself refused, after the plugin's own row went in`);
  }
  assert.equal(f.nothing(name), true, `${name}: the plugin's row of the same transaction rolled back`);
});

test("S-100 a type the Manifest does not produce is refused as artifacts.plugin_incompatible, and nothing of the transaction stays", async t => {
  const f = await platform(t);
  await assert.rejects(f.client.invoke(caller(permissionsOf(f.main)).context, f.main.act, { name: "undeclared", step: "undeclared" }), { code: "artifacts.plugin_incompatible" });
  assert.equal((f.main.gate.inner as { code?: string }).code, "artifacts.plugin_incompatible");
  assert.equal(f.nothing("undeclared"), true);
});

test("S-100 only a concurrent action that declares artifact:write pins, for an installation granted it: a serial action, an action that does not declare it and a plugin without the grant are refused", async t => {
  const f = await platform(t);
  // The serial action holds the probe's own write and artifact:write and is not concurrent: its transaction opens, and only the join refuses it.
  assert.deepEqual([f.main.serial.action.scheduling, f.main.serial.action.permissions], [undefined, [f.main.write, WRITE]]);
  for (const [item, action, code, message] of [[f.main, f.main.serial, "actions.forbidden", ACTION], [f.main, f.main.loose, "actions.forbidden", ACTION],
    [f.bare, f.bare.act, "plugin.grant_denied", /artifact:write/]] as const) {
    item.reset();
    const name = `refused-${action.capability_id.split(".").at(-1)}-${item.short}`;
    await assert.rejects(f.client.invoke(caller(permissionsOf(item)).context, action, { name, step: "pin" }), { code }, name);
    assert.equal((item.gate.inner as { code?: string }).code, code, `${name}: the join itself refused`);
    assert.match(String((item.gate.inner as { message?: string }).message), message, `${name}: refused for the action or the grant, not the caller`);
    assert.equal(f.nothing(name), true, `${name}: nothing stays`);
  }
});

test("S-100 a writer or a transaction handle kept past its transaction, another installation's transaction, and a join used inside another installation's action are refused", async t => {
  const f = await platform(t);
  // Another installation's library refuses a transaction opened inside this installation's action, before its join is reached.
  for (const [item, step, message] of [[f.main, "keep", TRANSACTION], [f.main, "retain", TRANSACTION], [f.main, "foreign", TRANSACTION], [f.peer, "borrow", BORROWED]] as const) {
    item.reset();
    const name = `${step}-${item.short}`;
    await assert.rejects(f.client.invoke(caller(permissionsOf(item)).context, item.act, { name, step }), { code: "actions.forbidden", message }, name);
    assert.equal(f.nothing(name), true, `${name}: nothing stays`);
  }
});

test("S-100 the producer, the author, the project and the scope are the platform's: a plugin that names its own is stamped with its Manifest and its caller", async t => {
  const f = await platform(t);
  assert.equal(await f.client.invoke(caller(permissionsOf(f.main)).context, f.main.act, { name: "forged", step: "forged" }), true);
  assert.deepEqual(f.pinned("forged"), [{ project_id: DEMO_PROJECT_ID, plugin: f.main.id, signature: "probe-pinmain", version: "1.0.0", author: OWNER, scope: "personal" }]);
});

// The author a trusted adapter (an Agent run, MCP) records for the call wins over the actor whose grants it holds: `audit_actor_id ?? actor_id`.
test("S-100 the author is the audit_actor_id the call carries, not its actor_id, when the two differ", async t => {
  const f = await platform(t), authored: ActionCallContext = { ...caller(permissionsOf(f.main)).context, audit_actor_id: AUTHOR };
  assert.equal(await f.client.invoke(authored, f.main.act, { name: "authored", step: "pin" }), true);
  assert.deepEqual(f.pinned("authored"), [{ project_id: DEMO_PROJECT_ID, plugin: f.main.id, signature: "probe-pinmain", version: "1.0.0", author: AUTHOR, scope: "personal" }]);
});

test("S-100 a read-only call is refused by the plugin's own library before any join, and a join outside every call by the join's gate; neither leaves anything", async t => {
  const f = await platform(t);
  // A query cannot open a write transaction at all, so it never reaches the join.
  await assert.rejects(f.client.invoke(caller(permissionsOf(f.main)).context, f.main.peek, { name: "peek", step: "pin" }), { code: "actions.forbidden", message: "只读场景不能写入业务记录" });
  assert.deepEqual([f.main.gate.inner], [undefined], "the join was never reached");
  assert.equal(f.nothing("peek"), true);
  // The plugin's own code outside every call writes its own rows, but there is no caller for a 成果: the join refuses inside the open transaction.
  f.main.reset();
  await assert.rejects(f.main.outside("outside"), { code: "actions.forbidden", message: "写入需要当前项目中的可写插件调用" });
  assert.equal((f.main.gate.inner as { message?: string }).message, "写入需要当前项目中的可写插件调用", "the join itself refused");
  assert.equal(f.nothing("outside"), true, "the plugin's row of the same transaction rolled back");
});

test("S-100 a pin in a savepoint the plugin discards goes with the savepoint, and the transaction around it commits: the 成果 is on the plugin's own connection", async t => {
  const f = await platform(t);
  assert.equal(await f.client.invoke(caller(permissionsOf(f.main)).context, f.main.act, { name: "discarded", step: "discard" }), true);
  assert.equal(f.main.gate.inner, "allowed", "the pin itself went in");
  assert.equal(f.noted("discarded"), true, "the transaction around the savepoint committed");
  assert.deepEqual([f.pinned("discarded"), f.announced("discarded")], [[], 0], "the version and its journal event went with the savepoint");
});

test("S-100 a join body that is not synchronous is refused, and the pin it made before returning rolls back with the transaction", async t => {
  const f = await platform(t);
  await assert.rejects(f.client.invoke(caller(permissionsOf(f.main)).context, f.main.act, { name: "async", step: "async" }), { code: "actions.async_required" });
  assert.equal((f.main.gate.inner as { code?: string }).code, "actions.async_required", "the join itself refused");
  assert.equal(f.nothing("async"), true);
});
