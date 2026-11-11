import assert from "node:assert/strict";
import { StatementSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import type { ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PluginHostExecutor, readMcpToolPreference } from "@molis-ai/molis-work-app-local-host";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { openTestHome } from "./fixtures/test-home.js";
import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";

// BL-943 / BCC-10 (S-plugin-read-original-caller): a plugin's read of its own library asks the action's original caller, not only the
// installation's grants. A real MCP client already inside the handler loses its exact action grant; the next native read is refused
// before SQLite runs it and nothing is delivered, while another client granted on its own still reads. A write handler whose caller
// passed `beforeEffect` and is revoked during the library's wait begins no transaction (the write fence this change keeps).

const action = (capability_id: string, permission: string, operation: "query" | "command"): ActionDefinition => ({
  capability_id, version: 1, operation, action: {
    title: "BL-943 probe", description: "Reads or writes the probe's own library", kind: operation === "query" ? "query" : "operation",
    scope: "project", scheduling: "concurrent", audiences: ["mcp"], permissions: [permission], subject_kinds: [],
    input_schema: { type: "object", additionalProperties: false, properties: { id: { type: "integer" } } },
    output_schema: { type: "object", required: ["id"], properties: { id: { type: "integer" } } },
  },
} as ActionDefinition);

const origin = action("fixture.bl943.read", "bl943:read", "query");
const peer = action("fixture.bl943.peer", "bl943:read", "query");
const journalRead = action("fixture.bl943.journal", "bl943:read", "query");
const command = action("fixture.bl943.write", "bl943:write", "command");
const grants = ["storage:private", "bl943:read", "bl943:write", "journal:project"];
const PROBE = "bl943_probe_read";

async function probeHome(t: TestContext) {
  const home = await openTestHome(t), project = await home.createProject("BL-943 original caller");
  const parked = { read: false, journal: false, write: false };
  const enter = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  t.signal.addEventListener("abort", () => release.resolve(), { once: true });
  let nativeReads = 0;
  const get = StatementSync.prototype.get;
  t.mock.method(StatementSync.prototype, "get", function (this: StatementSync, ...args: Parameters<StatementSync["get"]>) {
    if (this.sourceSQL.includes(PROBE)) nativeReads++;
    return Reflect.apply(get, this, args);
  });
  const park = async (which: keyof typeof parked) => { if (parked[which]) { enter.resolve(); await release.promise; } };
  const definition: PluginDefinition = {
    manifest: {
      schema_version: 1, host_api_version: 1, plugin_id: "io.molis.work.example.bl943", version: "1.0.0", name: "Original caller probe", kind: "app",
      publisher: { publisher_id: "fixture", signature: "fixture-bl943" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: grants.map(permission => ({ permission, required: true, reason: "Probe the library" })),
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
      actions: [origin, peer, journalRead, command],
      databases: { project: { store_name: "bl943", version: 1, read_permission: "bl943:read", write_permission: "bl943:write",
        schema: "CREATE TABLE bl943_notes (id INTEGER PRIMARY KEY)" } },
    },
    async start(context) {
      const library = context.services.project_database;
      assert.ok(library);
      const read = () => ({ id: Number(library.get(`SELECT id AS ${PROBE} FROM bl943_notes WHERE id=?`, [1])?.[PROBE]) });
      return { kind: "app", actions: [
        { ...origin, handle: async () => { await park("read"); return read(); } },
        { ...peer, handle: read },
        { ...journalRead, handle: async () => { await park("journal"); return { id: library.journal.eventCursor() }; } },
        { ...command, handle: async (caller: ActionExecutionContext, input: { id: number }) => {
          await library.transaction(async () => { await caller.beforeEffect(); await park("write"); }, tx => {
            tx.run("INSERT INTO bl943_notes(id) VALUES (?)", [input.id]);
          });
          return { id: input.id };
        } },
      ] };
    },
  };
  const actions = { registry: home.host.actionRegistry(project.reference), client: home.host.actionClient(project.reference, false), project_id: project.project_id };
  const owner = await home.host.withProject(project.reference, opened => opened);
  const executor = new PluginHostExecutor({
    actions, project_id: project.project_id, actor_id: "owner", artifacts: owner.artifacts, processItems: owner.processItems,
    ui: new UiHost(), capabilities: home.host.client(project.reference),
    projectLibrary: { db: owner.store.db, path: project.reference.storage_key, journal: { project_id: project.project_id, actor_id: "owner", writer: owner.store } },
    privateStorageFor: () => ({ get: () => null, set: () => assert.fail("no private values declared"), delete: () => false }),
  });
  const runtime = new PluginRuntime(undefined, executor, { hostIds: ISOLATED_HOST_IDS, actions });
  const record = runtime.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants }).install;
  t.after(async () => { release.resolve(); await runtime.stop(record.install_id); });
  await runtime.start(record.install_id);
  owner.store.db.exec("INSERT INTO bl943_notes(id) VALUES (1)");
  const clientId = "runtime:bl943-original-caller", otherId = "runtime:bl943-other-client";
  await home.grant(clientId, project.project_id, [origin, peer, journalRead, command]);
  await home.grant(otherId, project.project_id, [origin]);
  const mcp = await home.mcp(clientId, project.project_id), other = await home.mcp(otherId, project.project_id);
  const invoke = (client: typeof mcp, target: ActionDefinition, input: object = {}) => client.client.invoke(client.caller, target, input);
  /** Starts `target` parked inside its handler, revokes exactly that action for the client, then lets it go on. */
  const revokedWhileRunning = async (which: keyof typeof parked, target: ActionDefinition, input: object = {}) => {
    parked[which] = true;
    const pending = invoke(mcp, target, input).then(result => ({ result, error: undefined }), (error: unknown) => ({ result: undefined, error }));
    await Promise.race([enter.promise, pending.then(settled => { throw new Error("the call ended before reaching the barrier", { cause: settled.error }); })]);
    parked[which] = false; // Only this call waits; later calls of the same action run straight through.
    await home.revoke(clientId, project.project_id, [target]);
    const rows = (await readMcpToolPreference(home.home)).action_grants.filter(row => row.client_id === clientId && row.project_id === project.project_id);
    assert.equal(rows.find(row => row.capability_id === target.capability_id)?.enabled, false);
    return { pending };
  };
  return { home, project, owner, mcp, other, invoke, revokedWhileRunning, release, reads: () => nativeReads };
}

const code = (error: unknown) => (error as { code?: unknown } | undefined)?.code;

test("BCC-10 S-plugin-read-original-caller the original MCP caller revoked inside the handler: its next native read runs no statement and returns nothing; another granted client still reads", { timeout: 60_000 }, async t => {
  const probe = await probeHome(t);
  assert.deepEqual(await probe.invoke(probe.mcp, origin), { id: 1 });
  assert.equal(probe.reads(), 1);
  const { pending } = await probe.revokedWhileRunning("read", origin);
  // The installation keeps its read grant: the same read for a client granted on its own still runs.
  assert.deepEqual(await probe.invoke(probe.mcp, peer), { id: 1 });
  assert.deepEqual(await probe.invoke(probe.other, origin), { id: 1 });
  const before = probe.reads();
  probe.release.resolve();
  const settled = await pending;
  assert.equal(probe.reads() - before, 0, "the revoked call's read must not reach SQLite");
  assert.equal(settled.result, undefined);
  assert.equal(code(settled.error), "mcp.action_revoked");
});

test("BCC-10 S-plugin-read-original-caller the project journal read asks the original caller too", { timeout: 60_000 }, async t => {
  const probe = await probeHome(t);
  assert.deepEqual(await probe.invoke(probe.mcp, journalRead), { id: 0 });
  const { pending } = await probe.revokedWhileRunning("journal", journalRead);
  probe.release.resolve();
  const settled = await pending;
  assert.equal(settled.result, undefined);
  assert.equal(code(settled.error), "mcp.action_revoked");
});

test("BCC-10 S-plugin-read-original-caller a write whose caller passed beforeEffect and is revoked during the wait begins no transaction and writes nothing", { timeout: 60_000 }, async t => {
  const probe = await probeHome(t);
  assert.deepEqual(await probe.invoke(probe.mcp, command, { id: 2 }), { id: 2 });
  const { pending } = await probe.revokedWhileRunning("write", command, { id: 3 });
  const db = probe.owner.store.db, exec = db.exec, boundaries: string[] = [];
  t.mock.method(db, "exec", function (this: typeof db, sql: string) {
    if (/^(BEGIN IMMEDIATE|COMMIT)$/iu.test(sql)) boundaries.push(sql);
    return Reflect.apply(exec, this, [sql]);
  });
  probe.release.resolve();
  const settled = await pending;
  assert.equal(code(settled.error), "mcp.action_revoked");
  assert.equal(settled.result, undefined);
  assert.deepEqual(boundaries, []);
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM bl943_notes WHERE id=3").get()?.n), 0);
});
