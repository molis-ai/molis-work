import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  PluginDatabaseDeclaration, PluginDefinition, PluginManifest, PluginProjectDatabaseTransaction,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

// S-67 and RAC-703 (PG-094 S10/S11): a plugin undoes part of its own write transaction through `transaction.savepoint`, a primitive every plugin
// has alike. The platform makes and names the point, so nothing the plugin passes reaches SQL; the body is synchronous; a nested
// point undoes only its own writes; the handle is dead once the transaction is over; and every step asks the grants and the original
// caller again, as a statement does, so a call that was cancelled or revoked writes nothing, the rows and the journal included.

const HOST_ACTOR = "tester", OWNER = "owner", AT = "2026-10-25T00:00:00.000Z", JOURNAL = "journal:project";
type Step = "keep" | "undo" | "throw" | "nested" | "value" | "async" | "retain" | "entry" | "body" | "sql" | "journal";
const FAILURES = ["revoke", "cancel", "replace"] as const;

interface ProbeInput { readonly name: string; readonly step: Step }

/** A plugin that exists only for the test, with a table of its own in the project's library and the journal permission. */
function probe() {
  const short = "savepointprobe", id = `io.molis.work.example.${short}`, read = `${short}:read`, write = `${short}:write`;
  const gate = { hook: () => {}, value: undefined as unknown, kept: undefined as PluginProjectDatabaseTransaction | undefined };
  const table: PluginDatabaseDeclaration = { store_name: short, version: 1, read_permission: read, write_permission: write,
    schema: `CREATE TABLE ${short}_notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);` };
  const act: ActionDefinition<ProbeInput, boolean> = { capability_id: `${id}.act`, version: 1, operation: "command", action: { scope: "project", audiences: ["user"],
    permissions: [write], subject_kinds: [], scheduling: "concurrent", title: "写几项并撤销一部分", description: "写几项并撤销一部分", kind: "operation",
    input_schema: { type: "object", additionalProperties: false, required: ["name", "step"], properties: { name: { type: "string" }, step: { type: "string" } } },
    output_schema: { type: "boolean" } } };
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: id, kind: "app",
    publisher: { publisher_id: "molis", signature: `probe-${short}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["storage:private", read, write, JOURNAL].map(permission => ({ permission, required: true, reason: "写自己的数据" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [act], databases: { project: table },
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
  const insert = (tx: PluginProjectDatabaseTransaction, text: string) => tx.run(`INSERT INTO ${short}_notes (text) VALUES (?)`, [text]);
  const event = (tx: PluginProjectDatabaseTransaction, name: string) => tx.journal.appendEvent({ eventId: `ev-${name}`, actorId: OWNER, type: "probe.noted",
    objectType: "probe", objectId: name, reason: "测试", payload: { name }, at: AT });
  const definition: PluginDefinition = { manifest, start(context) {
    return { kind: "app", views: [], actions: [{ ...act, handle: async (_caller, raw) => {
      const { name, step } = raw as ProbeInput, database = context.services!.project_database!, none = async () => {};
      await database.transaction(none, tx => {
        insert(tx, `${name}:outer`);
        switch (step) {
          case "keep": tx.savepoint(() => { insert(tx, `${name}:inner`); return { keep: true, value: null }; }); break;
          case "undo": tx.savepoint(() => { insert(tx, `${name}:inner`); return { keep: false, value: null }; }); break;
          case "throw":
            try { tx.savepoint(() => { insert(tx, `${name}:inner`); throw new Error("body failed"); }); } catch (error) { gate.value = (error as Error).message; }
            insert(tx, `${name}:after`);
            break;
          case "nested":
            tx.savepoint(() => {
              insert(tx, `${name}:b`);
              tx.savepoint(() => { insert(tx, `${name}:c`); return { keep: false, value: null }; });
              insert(tx, `${name}:d`);
              return { keep: true, value: null };
            });
            break;
          case "value": gate.value = tx.savepoint(() => ({ keep: false, value: { answer: 42 } })); break;
          case "async": tx.savepoint((async () => ({ keep: true, value: null })) as never); break;
          case "retain": gate.kept = tx; break;
          case "entry":
            // Nothing in the body touches a statement, so only the point's own check can refuse it; what it says is kept before the commit's check could say the same.
            gate.hook();
            try { tx.savepoint(() => ({ keep: true, value: null })); gate.value = "allowed"; } catch (error) { gate.value = error; throw error; }
            break;
          case "body": tx.savepoint(() => { gate.hook(); insert(tx, `${name}:inner`); return { keep: true, value: null }; }); break;
          case "sql": {
            const results: string[] = [];
            for (const sql of ["SAVEPOINT plugin_named", "ROLLBACK TO plugin_named", "RELEASE plugin_named"]) {
              try { tx.run(sql); results.push("allowed"); } catch (error) { results.push((error as ActionError).code ?? "refused"); }
            }
            gate.value = results;
            break;
          }
          case "journal":
            event(tx, `${name}-kept`);
            tx.savepoint(() => { event(tx, `${name}-undone`); insert(tx, `${name}:inner`); return { keep: false, value: null }; });
            break;
        }
      });
      return true;
    } }] };
  } };
  return { id, short, definition, act, write, gate, reset() { gate.hook = () => {}; gate.value = undefined; gate.kept = undefined; } };
}

async function platform(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "plugin-savepoint-")), file = join(home, "project.db");
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
  const main = probe();
  assert.deepEqual((await running.start([{ definition: main.definition, bundled: true }])).running, [main.id]);
  const notes = (name: string) => (store.db.prepare(`SELECT text FROM ${main.short}_notes WHERE text LIKE ? ORDER BY id`).all(`${name}:%`) as Array<{ text: string }>)
    .map(row => row.text.slice(name.length + 1));
  const event = (name: string) => store.db.prepare("SELECT 1 FROM events WHERE event_id = ?").get(`ev-${name}`) !== undefined;
  return { client: actions.client, main, notes, event };
}

function caller(permission: string) {
  const abort = new AbortController();
  let refusal: ActionError | undefined;
  const context: ActionCallContext = { actor_id: OWNER, project_id: DEMO_PROJECT_ID, audience: "user", permissions: [permission], signal: abort.signal,
    assert_authority_current: () => { if (refusal) throw refusal; } };
  return { context, cancel: () => abort.abort(),
    revoke: () => { refusal = new ActionError("actions.forbidden", "the caller was revoked"); },
    replace: () => { refusal = new ActionError("actions.provider_changed", "the caller's provider changed"); } };
}
const codeOf = (failure: (typeof FAILURES)[number]) => failure === "revoke" ? "actions.forbidden" : "actions.provider_changed";

// RAC-703
test("S-67 a savepoint keeps or undoes only its own writes: the rest of the transaction commits, a throw undoes the body and leaves the error to the plugin, a nested point undoes only itself", async t => {
  const { client, main, notes } = await platform(t);
  const run = (name: string, step: Step) => client.invoke(caller(main.write).context, main.act, { name, step });
  assert.equal(await run("keep", "keep"), true);
  assert.deepEqual(notes("keep"), ["outer", "inner"]);
  assert.equal(await run("undo", "undo"), true);
  assert.deepEqual(notes("undo"), ["outer"], "keep: false undid the body's write and nothing else");
  main.reset();
  assert.equal(await run("throw", "throw"), true);
  assert.equal(main.gate.value, "body failed", "the body's own error reached the plugin");
  assert.deepEqual(notes("throw"), ["outer", "after"], "the write before the throw was undone, the write after it was not");
  assert.equal(await run("nested", "nested"), true);
  assert.deepEqual(notes("nested"), ["outer", "b", "d"], "the inner point undid only its own write");
  main.reset();
  assert.equal(await run("value", "value"), true);
  assert.deepEqual(main.gate.value, { answer: 42 }, "the body's value comes back whether or not it was kept");
});

// RAC-703
test("S-67 the point is the platform's: the plugin sends no SQL for it, an async body is refused with its writes undone, and a handle kept past the transaction is dead", async t => {
  const { client, main, notes } = await platform(t);
  const run = (name: string, step: Step) => client.invoke(caller(main.write).context, main.act, { name, step });
  assert.equal(await run("sql", "sql"), true);
  assert.equal((main.gate.value as string[]).length, 3);
  assert.equal((main.gate.value as string[]).includes("allowed"), false, "SAVEPOINT, ROLLBACK TO and RELEASE are not statements a plugin can run");
  assert.deepEqual(notes("sql"), ["outer"]);
  main.reset();
  await assert.rejects(run("async", "async"), { code: "actions.async_required" });
  assert.deepEqual(notes("async"), [], "the refused body's transaction rolled back whole");
  main.reset();
  assert.equal(await run("retain", "retain"), true);
  assert.throws(() => main.gate.kept!.savepoint(() => ({ keep: true, value: null })), { code: "actions.forbidden" });
});

/** The caller's authority moves at `stage`; the point and the transaction around it write nothing, and a current caller reaches the same point. */
async function authorityMoves(t: TestContext, stage: "entry" | "body") {
  const { client, main, notes } = await platform(t);
  for (const failure of FAILURES) {
    main.reset();
    const call = caller(main.write), name = `${stage}-${failure}`;
    main.gate.hook = call[failure];
    const outcome = await client.invoke(call.context, main.act, { name, step: stage }).then(() => "written" as const, (error: unknown) => error as { code?: string; name?: string });
    const said = stage === "entry" ? [outcome, main.gate.value] : [outcome];
    for (const each of said as Array<{ code?: string; name?: string } | "allowed">) {
      assert.notEqual(each, "allowed", `${name}: the point itself refused, not only the commit after it`);
      if (failure === "cancel") assert.equal((each as { name?: string }).name, "AbortError", name);
      else assert.equal((each as { code?: string }).code, codeOf(failure), name);
    }
    assert.deepEqual(notes(name), [], `${name}: refused, and the outer row went with it`);
  }
  main.reset();
  assert.equal(await client.invoke(caller(main.write).context, main.act, { name: `${stage}-current`, step: stage }), true, "a current caller reaches the same point");
  assert.deepEqual(notes(`${stage}-current`), stage === "entry" ? ["outer"] : ["outer", "inner"]);
}

// RAC-703
test("S-67 entry: a caller that is revoked, cancelled or moved to another provider before the point is made writes nothing, the transaction's own rows included", t => authorityMoves(t, "entry"));

// RAC-703
test("S-67 body: a caller that is revoked, cancelled or moved to another provider inside the body writes nothing, the transaction's own rows included", t => authorityMoves(t, "body"));

// RAC-703
test("S-67 the project's journal follows the point: an event appended inside an undone savepoint is gone with it, one before it stays", async t => {
  const { client, main, notes, event } = await platform(t);
  assert.equal(await client.invoke(caller(main.write).context, main.act, { name: "journal", step: "journal" }), true);
  assert.equal(event("journal-kept"), true);
  assert.equal(event("journal-undone"), false, "the undone savepoint's event is not in the log");
  assert.deepEqual(notes("journal"), ["outer"]);
});
