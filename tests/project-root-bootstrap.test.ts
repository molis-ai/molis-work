import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { createPrivateDevelopmentHost, developInPrivateHost, initializeProjectDatabase, LocalMcpServer, LocalProjectDatabase, MolisWorkLocalHost, molisWorkHostProjectReference, runV1Cli } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import type { McpToolResult } from "@molis-ai/molis-work-app-mcp";
import { artifactsActions, ARTIFACTS_PROVIDER_ID } from "@molis-ai/molis-work-module-artifacts";
import { actionSourceIdentity, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";

// Standalone management creates the same project-owned identity as Catalog; reads never repair it.
async function setup(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "project-root-bootstrap-"));
  const host = new MolisWorkLocalHost({ homeDirectory: join(directory, "home"), completeText: null });
  t.after(async () => { try { await host.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  return { directory, host, path: join(directory, "project.db") };
}

function roots(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return db.prepare("SELECT project_id, created_at, data_instance_id FROM project_root ORDER BY project_id").all(); }
  finally { db.close(); }
}

function boards(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return { boards: db.prepare("SELECT project_id FROM boards").all(), created: db.prepare("SELECT actor_id FROM events WHERE type = 'io.molis.work.goals:board.created'").all() }; }
  finally { db.close(); }
}

const artifactCaller = (project_id: string): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id, permissions: ["artifacts:read"] });
const artifactSource = { capability_id: artifactsActions.subject.capability_id, version: artifactsActions.subject.version, provider_id: ARTIFACTS_PROVIDER_ID };

async function initializeCli(host: MolisWorkLocalHost, path: string, projectId: string) {
  return runV1Cli(["init", "--db", path, "--json", JSON.stringify({ project_id: projectId, actor_id: "owner", idempotency_key: "bootstrap" })], { localHost: host });
}

function management(host: MolisWorkLocalHost) {
  // Same embedded production entry as mcp-management-actions.test.ts; no resident autostart or environment Catalog.
  return new LocalMcpServer(withMolisWorkProjectCatalog, "management", null, {
    runtimeContext: { runtime_id: "management-test", stable_work_context_id: "bootstrap", host_declares_stable: true },
  }, host);
}

async function initializeMcp(server: LocalMcpServer, path: string, projectId: string) {
  const response = await server.handleMessage({ id: 1, method: "tools/call", params: {
    name: "molis_work_v1_initialize", arguments: { database_path: path, project_id: projectId, idempotency_key: "bootstrap" },
  } }) as { result: McpToolResult };
  return response.result;
}

test("CLI init creates one persistent root and replay preserves its creation time and instance", async t => {
  const f = await setup(t);
  t.mock.method(console, "log", () => {});
  assert.equal(existsSync(f.path), false);
  assert.equal(await initializeCli(f.host, f.path, "cli"), 0);
  const first = roots(f.path);
  assert.equal(first.length, 1); assert.equal(first[0]!.project_id, "cli");
  assert.ok(Number.isFinite(Date.parse(String(first[0]!.created_at))));
  assert.match(String(first[0]!.data_instance_id), /^[0-9a-f-]{36}$/);
  assert.equal(await initializeCli(f.host, f.path, "cli"), 0);
  await f.host.close();
  assert.deepEqual(roots(f.path), first, "closing and reopening SQLite preserves the original root");
});

test("management MCP initializes a new library and repeats without replacing its root", async t => {
  const f = await setup(t), server = management(f.host);
  t.after(() => server.close());
  assert.equal(existsSync(f.path), false);
  const firstReply = await initializeMcp(server, f.path, "mcp");
  assert.equal(firstReply.isError, false, JSON.stringify(firstReply));
  const first = roots(f.path);
  assert.equal(first.length, 1); assert.equal(first[0]!.project_id, "mcp");
  const replay = await initializeMcp(server, f.path, "mcp");
  assert.equal(replay.isError, false, JSON.stringify(replay));
  await server.close(); await f.host.close();
  assert.deepEqual(roots(f.path), first);
});

test("root initialization preserves same-id roots and refuses wrong identity, multiple roots and old schema unchanged", async t => {
  const f = await setup(t);
  await initializeProjectDatabase(f.path, "original");
  const original = roots(f.path);
  await initializeProjectDatabase(f.path, "original");
  assert.deepEqual(roots(f.path), original);
  const beforeWrong = await readFile(f.path);
  await assert.rejects(initializeProjectDatabase(f.path, "other"), { code: "catalog.database_invalid" });
  assert.deepEqual(roots(f.path), original);
  assert.deepEqual(await readFile(f.path), beforeWrong, "wrong-id refusal leaves the persisted library unchanged");
  const prefixed = molisWorkHostProjectReference({ databasePath: f.path, projectId: `database:${f.path}:another-name` });
  await assert.rejects(f.host.withProject(prefixed, () => undefined), { code: "artifacts.project_storage_invalid" }, "the database: prefix alone is not the exact unnamed storage scope");
  assert.deepEqual(roots(f.path), original);

  // Deliberately corrupt the one-root invariant; both identities still come from the project owner, not handwritten UUIDs.
  const damaged = new LocalProjectDatabase(f.path);
  try { writeProjectRoot(damaged.db, "second", new Date().toISOString()); } finally { damaged.close(); }
  const multiple = roots(f.path), beforeMultiple = await readFile(f.path);
  await assert.rejects(initializeProjectDatabase(f.path, "original"), { code: "catalog.database_invalid" });
  assert.deepEqual(roots(f.path), multiple);
  assert.deepEqual(await readFile(f.path), beforeMultiple);

  const oldPath = join(f.directory, "old.db"), old = new DatabaseSync(oldPath);
  old.exec("CREATE TABLE retained (value TEXT); INSERT INTO retained VALUES ('old user fact'); PRAGMA user_version = 10"); old.close();
  await assert.rejects(initializeProjectDatabase(oldPath, "old"), { code: "storage.schema_version_mismatch", found: 10 });
  const refused = new DatabaseSync(oldPath, { readOnly: true });
  try {
    assert.equal(refused.prepare("PRAGMA user_version").get()!.user_version, 10);
    assert.deepEqual(refused.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name), ["retained"]);
    assert.equal(refused.prepare("SELECT value FROM retained").get()!.value, "old user fact");
  } finally { refused.close(); }
});

test("two processes racing different project IDs on one library commit exactly one root", { timeout: 30_000 }, async t => {
  const f = await setup(t);
  // Prepare only the current empty schema so the barrier exercises root acquisition, not unrelated schema installation.
  new LocalProjectDatabase(f.path).close();
  assert.deepEqual(roots(f.path), []);
  const script = `import { initializeProjectDatabase } from '@molis-ai/molis-work-app-local-host';
    process.once('message', async () => {
      let result;
      try { await initializeProjectDatabase(process.argv[1], process.argv[2]); result = { ok: true }; }
      catch (error) { result = { ok: false, code: error.code, message: error.message }; }
      process.send(result, () => process.disconnect());
    });
    process.send({ ready: true });`;
  const workers = ["first", "second"].map(projectId => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script, f.path, projectId], {
      cwd: process.cwd(), stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let errors = "", outcome: { ok: boolean; code?: string; message?: string } | undefined;
    child.stderr!.on("data", bytes => { errors += String(bytes); });
    let announce!: () => void, refuse!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => { announce = resolve; refuse = reject; });
    const done = new Promise<void>((resolve, reject) => {
      child.on("error", error => { refuse(error); reject(error); });
      child.on("message", (message: { ready?: boolean; ok: boolean; code?: string; message?: string }) => {
        if (message.ready) announce(); else outcome = message;
      });
      child.on("exit", code => {
        if (code === 0 && outcome) resolve();
        else { const error = new Error(errors || `initializer child exited ${code} without a result`); refuse(error); reject(error); }
      });
    });
    // Observe early failures while the parent is still waiting for both ready messages.
    void done.catch(() => {});
    t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill(); await done.catch(() => {}); });
    return { projectId, child, ready, done, result: () => outcome! };
  });
  await Promise.all(workers.map(worker => worker.ready));
  for (const worker of workers) worker.child.send({ start: true });
  await Promise.all(workers.map(worker => worker.done));
  const winners = workers.filter(worker => worker.result().ok);
  assert.equal(winners.length, 1, JSON.stringify(workers.map(worker => worker.result())));
  const loser = workers.find(worker => !worker.result().ok)!;
  assert.equal(loser.result().code, "catalog.database_invalid", JSON.stringify(loser.result()));
  const stored = roots(f.path);
  assert.equal(stored.length, 1); assert.equal(stored[0]!.project_id, winners[0]!.projectId);
  await initializeProjectDatabase(f.path, winners[0]!.projectId);
  assert.deepEqual(roots(f.path), stored, "the winner's instance survives a later independent initialization");
});

test("an opened Host refuses another path for the same project and a closed Host creates no target library", async t => {
  const f = await setup(t);
  t.mock.method(console, "log", () => {});
  await initializeCli(f.host, f.path, "same");
  const original = roots(f.path), other = join(f.directory, "other.db");
  await assert.rejects(initializeCli(f.host, other, "same"), { code: "host.project_identity_conflict" });
  assert.equal(existsSync(other), false);
  assert.deepEqual(roots(f.path), original);
  await f.host.close();
  const afterClose = join(f.directory, "closed.db");
  await assert.rejects(initializeCli(f.host, afterClose, "closed"), { code: "host.closed" });
  assert.equal(existsSync(afterClose), false);
  assert.deepEqual(roots(f.path), original);
});

test("project close while explicit development initialization waits refuses before writing a root", async t => {
  const directory = await mkdtemp(join(tmpdir(), "project-root-closing-")), path = join(directory, "project.db");
  const host = createPrivateDevelopmentHost();
  t.after(async () => { try { await host.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  const reference = molisWorkHostProjectReference({ databasePath: path, projectId: "closing-project" });
  await host.withProject(reference, () => undefined);
  assert.deepEqual(roots(path), []);
  assert.deepEqual(boards(path), { boards: [], created: [] });
  const pending = developInPrivateHost(host, reference, { directory: join(process.cwd(), "examples", "plugin-sample"),
    project_id: reference.project_id, grants: [], allow_unsigned_development: true });
  const closing = host.closeProject(reference);
  assert.equal(host.lifecycle(), "running");
  assert.equal(host.projects().find(entry => entry.storage_key === reference.storage_key)?.state, "closing");
  await assert.rejects(pending, { code: "host.project_closing" });
  assert.equal(await closing, true);
  assert.deepEqual(roots(path), [], "the rejected initialization never commits a project root");
  assert.deepEqual(boards(path), { boards: [], created: [] });
});

test("ordinary CLI reads and Runtime MCP management requests never repair a rootless library", async t => {
  const f = await setup(t);
  new LocalProjectDatabase(f.path).close();
  await assert.rejects(runV1Cli(["snapshot", "--db", f.path, "--json", JSON.stringify({ project_id: "rootless" })], { localHost: f.host }), { code: "goals.board.not_found" });
  assert.deepEqual(roots(f.path), []);
  assert.deepEqual(boards(f.path), { boards: [], created: [] });
  const reference = molisWorkHostProjectReference({ databasePath: f.path, projectId: "rootless" });
  assert.equal(await f.host.withProject(reference, runtime => runtime.project_id), "rootless", "opening a bare library remains permitted");
  const caller = artifactCaller("rootless"), client = f.host.actionClient(reference);
  const sources = (await client.discover(caller)).filter(view => view.provider.provider_id === ARTIFACTS_PROVIDER_ID);
  assert.ok(sources.length > 0, "the unavailable system source keeps its registered contract");
  assert.ok(sources.every(view => !view.availability.available && actionSourceIdentity(view.provider, "rootless") === null));
  for (const audience of ["user", "agent"] as const) await assert.rejects(client.invoke({ ...caller, audience }, artifactsActions.browser, {}), { code: "artifacts.project_storage_invalid" });
  assert.throws(() => client.captureSources!([{ context: caller, references: [artifactSource] }]), { code: "artifacts.project_storage_invalid" });
  const server = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", {
    databasePath: f.path, projectId: "rootless", webBaseUrl: "http://127.0.0.1:4173",
  }, { runtimeContext: { runtime_id: "management-test", stable_work_context_id: "bootstrap", host_declares_stable: true } }, f.host);
  t.after(() => server.close());
  const result = await initializeMcp(server, f.path, "rootless");
  assert.equal(result.isError, true, JSON.stringify(result));
  await server.close(); await f.host.close();
  assert.deepEqual(roots(f.path), []);
  assert.deepEqual(boards(f.path), { boards: [], created: [] });
});

test("explicit initialization activates the same bare Runtime once and never revives an old instance's source fence", async t => {
  const f = await setup(t);
  t.mock.method(console, "log", () => {});
  const reference = molisWorkHostProjectReference({ databasePath: f.path, projectId: "live" });
  const runtime = await f.host.withProject(reference, value => value);
  assert.deepEqual(roots(f.path), []);
  assert.deepEqual(boards(f.path), { boards: [], created: [] });
  assert.equal(await initializeCli(f.host, f.path, "live"), 0);
  assert.strictEqual(await f.host.withProject(reference, value => value), runtime, "initialization keeps the existing Runtime and connection");
  const first = roots(f.path), caller = artifactCaller("live"), client = f.host.actionClient(reference);
  const source = (await client.discover(caller)).find(view => view.capability_id === artifactSource.capability_id)!;
  assert.equal(source.availability.available, true);
  assert.deepEqual(actionSourceIdentity(source.provider, "live"), { kind: "project-data", data_instance_id: first[0]!.data_instance_id });
  await client.invoke(caller, artifactsActions.browser, {});
  const current = client.captureSources!([{ context: caller, references: [artifactSource] }]);
  current();
  assert.equal(await initializeCli(f.host, f.path, "live"), 0);
  assert.deepEqual(roots(f.path), first);
  current(); // Re-registering the unchanged source would invalidate this original token.

  // Deliberately replace the root through its owner; the Artifact event cursor itself remains unchanged.
  const cursor = runtime.store.eventCursor("live", "artifact");
  await f.host.withProject(reference, value => value.store.immediate(() => {
    value.store.db.prepare("DELETE FROM project_root").run();
    writeProjectRoot(value.store.db, "live", new Date().toISOString());
  }));
  assert.equal(runtime.store.eventCursor("live", "artifact"), cursor);
  assert.notEqual(roots(f.path)[0]!.data_instance_id, first[0]!.data_instance_id);
  assert.throws(current, { code: "artifacts.project_storage_invalid" }, "the owner reader checks the live root before any refresh");
  assert.equal(await initializeCli(f.host, f.path, "live"), 0);
  assert.throws(current, { code: "artifacts.project_storage_invalid" }, "new registration cannot bless an old instance's source fence");
  const refreshed = (await client.discover(caller)).find(view => view.capability_id === artifactSource.capability_id)!;
  assert.deepEqual(actionSourceIdentity(refreshed.provider, "live"), { kind: "project-data", data_instance_id: roots(f.path)[0]!.data_instance_id });
  client.captureSources!([{ context: caller, references: [artifactSource] }])();
  await client.invoke(caller, artifactsActions.browser, {});
  assert.strictEqual(await f.host.withProject(reference, value => value), runtime);
});
