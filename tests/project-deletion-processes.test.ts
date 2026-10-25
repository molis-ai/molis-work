import { memoryData } from "./fixtures/current-memory.js";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { memoryActions, MEMORY_PERMISSIONS } from "@molis-ai/molis-work-contracts/services/memory";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { DEMO_PROJECT_ID, MolisWorkLocalHost, ensureSystemAgentService, molisWorkHostProjectReference, projectDeletedHooksFor, type ProjectDeletedOwner } from "@molis-ai/molis-work-app-local-host";
import { openLingguangStore } from "./fixtures/plugin-home-stores.js";
import { openMemoryLedger, openTextSearchIndex } from "@molis-ai/molis-work-storage";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { assertHomeBusinessUnchanged, homeBusinessTree, runtimeBusinessEntries } from "./fixtures/home-storage-files.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";

/**
 * What deleting a project does when the process that deletes it is not the one that has every service: another process
 * holds the Agent runtime (memory lives in it), a Host only forwards to the one that runs it (the stdio MCP's), or the
 * process is only a catalog (the CLI, the uninstaller) with no memory or search service at all. A deletion is accepted
 * only after its Memory/Session plan is fixed; later owner failures stay pending. Demo rebuild retains its separate contract.
 */
type Catalog = Awaited<ReturnType<typeof openMolisWorkProjectCatalog>>;
const input = { actor_id: "test-user", user_confirmed: true };
const deletion = (id: string, key = `delete-${id}`) => ({ project_id: id, actor_id: "test-user", delete_confirmed: true, idempotency_key: key });
const pendingOwners = (receipt: { owner_steps: ReadonlyArray<{ owner_id: string; state: string }> }) => receipt.owner_steps.filter(step => step.state === "pending").map(step => step.owner_id);
function recorder(id: string) {
  const calls: string[] = [];
  const owner: ProjectDeletedOwner = { id, label: null, clear(projectId) { calls.push(projectId); } };
  return { owner, calls };
}
async function scratchHome(t: TestContext): Promise<{ home: string; catalog: Catalog }> {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-deletion-processes-"));
  const home = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  t.after(async () => { catalog.close(); await rm(directory, { recursive: true, force: true }); });
  return { home, catalog };
}
/** The Home as an app that has run in it leaves it: an Agent runtime directory and a search index. */
async function ranBefore(home: string): Promise<void> {
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "0.0.0" },
    storageRoot: join(home, "agent-runtime"), modelConfiguration: async () => { throw new Error("Runtime presence must not call a model"); } });
  await adapter.close();
  openTextSearchIndex({ homeDirectory: home }).close();
}
/**
 * Another process holding the Home's Agent runtime, the way a running Molis Work does (`tests/fixtures/agent-storage-owner.ts`
 * opens the runtime through the Agent Host's public entry). It also tells whether the runtime was free: this rejects when
 * some other process, this one included, already holds it.
 */
async function holdAgentRuntime(home: string): Promise<{ release(): Promise<void> }> {
  const script = fileURLToPath(new URL("./fixtures/agent-storage-owner.ts", import.meta.url));
  const child = spawn(process.execPath, ["--import", "tsx", script, home], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  let errors = "";
  child.stderr?.on("data", data => { errors += String(data); });
  const release = async () => {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill("SIGKILL"); await exited; }
  };
  try {
    const [message] = await Promise.race([once(child, "message"), once(child, "exit").then(() => { throw new Error(errors || "the process holding the runtime exited"); })]);
    assert.deepEqual(message, { ready: true });
  } catch (error) { await release(); throw error; }
  return { release };
}

test("RAC-105-A-07: an idle Home Host refuses unprepared deletion, retains exclusive ownership, and its successor can accept the original request", { timeout: 180_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  await ranBefore(home);
  // A business Home Host owns the runtime even before adopting its Agent service.
  const forwarding = new MolisWorkLocalHost({ homeDirectory: home });
  t.after(() => forwarding.close());
  const project = await catalog.createProject({ display_name: "要删除的项目", actor_id: "test-user" });

  await assert.rejects(() => catalog.deleteProject(deletion(project.project_id)), /运行中的 Molis Work/);
  assert.deepEqual(catalog.listProjectDeletions(), [], "without a fixed Memory plan no deletion was accepted");
  assert.equal(catalog.getProject(project.project_id).database_path, project.database_path);
  assert.equal(existsSync(project.database_path), true);
  await assert.rejects(holdAgentRuntime(home), /agent.storage_busy/, "an idle Home Host already excludes a second execution process");

  // The successor can prepare the original request only after the Home owner closes.
  await forwarding.close();
  const executor = new MolisWorkLocalHost({ homeDirectory: home });
  t.after(() => executor.close());
  await ensureSystemAgentService(executor, home, withMolisWorkProjectCatalog).ready;
  assert.deepEqual(catalog.listProjectDeletions(), [], "starting an executor cannot turn an unaccepted request into a receipt");
  const finished = await catalog.deleteProject(deletion(project.project_id));
  assert.equal(finished.replayed, false);
  assert.equal(finished.deletion.cleanup_state, "complete");
  assert.deepEqual(finished.deletion.owner_steps.filter(step => step.owner_id === "memory").map(step => [step.state, step.error]), [["complete", null]]);
});

test("RAC-105-A-09: a forwarding stdio with no resident refuses binding and deletion without changing the Home or occupying its runtime", { timeout: 180_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  await ranBefore(home);
  const project = await catalog.createProject({ display_name: "要删除的项目", actor_id: "test-user" });
  const before = homeBusinessTree(home);
  // As apps/desktop/launchers/mcp/server.ts builds it: the Runtime's Home and the resident Host's address, so every action
  // is forwarded to that Host and this process runs none.
  const server = new MolisWorkServer("runtime", null, { homeDirectory: home, runtimeContext: { runtime_id: "codex", stable_work_context_id: "project-deletion-processes", host_declares_stable: true } },
    undefined, "http://127.0.0.1:1");
  t.after(() => server.close());
  const call = async (name: string, args: Record<string, unknown>) => (await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) as
    { result: { isError: boolean; content: Array<{ text: string }> } }).result;

  const bound = await call("molis_work_v1_context_bind", { project_id: project.project_id, user_confirmed: true });
  assert.equal(bound.isError, true, bound.content[0]?.text);
  assert.match(bound.content[0]?.text ?? "", /actions.service_unavailable/);
  const deleted = await call("molis_work_v1_project_delete", { project_id: project.project_id, delete_confirmed: true, idempotency_key: "mcp-forwarding-delete" });
  assert.equal(deleted.isError, true, deleted.content[0]?.text);
  assert.match(deleted.content[0]?.text ?? "", /actions.service_unavailable/);
  assert.deepEqual(homeBusinessTree(home), before, "the forwarding entry has no local Catalog or business fallback");
  assert.equal(existsSync(project.database_path), true);
  assert.deepEqual(catalog.listRuntimeContextBindings(), []);
  assert.deepEqual(catalog.listProjectDeletions(), []);
  assert.equal(catalog.getProject(project.project_id).database_path, project.database_path);
  const free = await holdAgentRuntime(home).catch((error: Error) => error);
  assert.ok(!(free instanceof Error), `the tool call did not take the Agent runtime from the resident Host (${free instanceof Error ? free.message.slice(0, 200) : ""})`);
  if (!(free instanceof Error)) await free.release();
});

test("RAC-105-A-07: a real SDK owner refuses Host startup and unprepared deletion, and a successor accepts once ownership is free", { timeout: 180_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  let host: MolisWorkLocalHost | undefined;
  const held = await holdAgentRuntime(home);
  t.after(async () => { await held.release(); await host?.close(); });
  const project = await catalog.createProject({ display_name: "要删除的项目", actor_id: "test-user" });
  const before = homeBusinessTree(home);
  assert.throws(() => { host = new MolisWorkLocalHost({ homeDirectory: home }); }, { code: "storage.owner.busy" });
  assertHomeBusinessUnchanged(before, homeBusinessTree(home), ["projects/catalog.db"], "a refused Host initializes no business owner");

  await assert.rejects(() => catalog.deleteProject(deletion(project.project_id)), /运行中的 Molis Work/);
  assert.deepEqual(catalog.listProjectDeletions(), [], "without a fixed Memory plan no deletion was accepted");
  assert.equal(catalog.getProject(project.project_id).database_path, project.database_path);
  assert.equal(existsSync(project.database_path), true);
  assertHomeBusinessUnchanged(before, homeBusinessTree(home), ["projects/catalog.db"], "refused deletion leaves all business data unchanged");

  await held.release();
  host = new MolisWorkLocalHost({ homeDirectory: home });
  await ensureSystemAgentService(host, home, withMolisWorkProjectCatalog).ready;
  const finished = await catalog.deleteProject(deletion(project.project_id));
  assert.equal(finished.replayed, false, "the first request never committed a decision");
  assert.equal(finished.deletion.cleanup_state, "complete");
  assert.deepEqual(finished.deletion.owner_steps.filter(item => item.owner_id === "memory").map(item => [item.state, item.error]), [["complete", null]]);
});

test("a Host whose runtime has already started clears the memory step itself, whatever transport it serves", { timeout: 180_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  const gone = (await catalog.createProject({ project_id: "project-onboarding-00000000-0000-4000-8000-000000000001", display_name: "要删除的项目", actor_id: "test-user" })).project_id;
  const seedHost = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const client = (host: MolisWorkLocalHost) => bindActionClient(host.actionClient(molisWorkHostProjectReference({ projectId: gone, databasePath: catalog.getProject(gone).database_path })), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID,
    project_id: gone, audience: "user" as const, permissions: [...MEMORY_PERMISSIONS] }));
  try {
    await ensureSystemAgentService(seedHost, home, withMolisWorkProjectCatalog).ready;
    const actions = client(seedHost);
    assert.equal((await actions.invoke(memoryActions.write, { scope: "project", text: "本项目周报先写风险" })).outcome, "written");
    assert.equal((await actions.invoke(memoryActions.write, { scope: "personal", text: "个人回答使用短段落" })).outcome, "written");
  } finally { await seedHost.close(); }
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  try {
    // No transport adopted the service (no catalog owner), but something needed the runtime, so this process holds it.
    const service = ensureSystemAgentService(host, home);
    await service.ready;
    const result = await catalog.deleteProject({ ...deletion(gone), actor_id: "runtime:codex:project-deletion" });

    assert.equal(result.deletion.cleanup_state, "complete", "waiting for another process could never help: this one holds the runtime");
    assert.deepEqual(result.deletion.owner_steps.filter(step => step.owner_id === "memory").map(step => [step.state, step.error]), [["complete", null]]);
    // Reuse the public fixed project identity only after cleanup, so current-authority reads can inspect the old scope.
    await catalog.createProject({ project_id: gone, display_name: "重新建立的项目", actor_id: "test-user" });
    ensureSystemAgentService(host, home, withMolisWorkProjectCatalog);
    assert.deepEqual((memoryData(await client(host).invoke(memoryActions.list, { scope: "project" }))).items, []);
    assert.deepEqual((memoryData(await client(host).invoke(memoryActions.list, { scope: "personal" }))).items.map(item => item.text), ["个人回答使用短段落"]);
  } finally { await host.close(); }
});

for (const adopted of [false, true]) test(`RAC-105-A-07: ledger-only notes ${adopted ? "require a full Runtime deletion plan" : "remain intact without an adopted executor"}`, { timeout: 60_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  t.after(() => host.close());
  if (adopted) ensureSystemAgentService(host, home, withMolisWorkProjectCatalog);
  const gone = (await catalog.createProject({ display_name: "要删除的项目", actor_id: "test-user" })).project_id;
  const ledger = openMemoryLedger({ homeDirectory: home });
  t.after(() => ledger.close());
  ledger.setMarker("web-user", `tidy:project:${gone}`, { seen: true }, new Date().toISOString());
  assert.ok(ledger.marker("web-user", `tidy:project:${gone}`));

  assert.deepEqual(runtimeBusinessEntries(join(home, "agent-runtime")), [], "only the Home owner exists before deletion preparation");
  if (adopted) {
    const hooks = projectDeletedHooksFor(home), memory = hooks.owners().find(owner => owner.id === "memory")!;
    let prepared = false;
    const dispose = hooks.register({ ...memory, withRecovery: (request, work) => memory.withRecovery!(request, (plan, proof) => {
      assert.equal(plan.kind, "runtime", "the executor prepares the full Runtime plan before Catalog accepts deletion");
      assert.deepEqual(catalog.listProjectDeletions(), []);
      prepared = true;
      return work(plan, proof);
    }) });
    try {
      const result = await catalog.deleteProject(deletion(gone));
      assert.equal(prepared, true);
      assert.equal(result.deletion.cleanup_state, "complete");
      assert.equal(ledger.marker("web-user", `tidy:project:${gone}`), null);
      assert.ok(runtimeBusinessEntries(join(home, "agent-runtime")).length > 0, "preparing the first Runtime plan may initialize SDK business storage");
    } finally { dispose(); }
  } else {
    const before = homeBusinessTree(home);
    await assert.rejects(() => catalog.deleteProject(deletion(gone)), /已有记忆账注/);
    assert.deepEqual(catalog.listProjectDeletions(), []);
    assert.equal(catalog.getProject(gone).project_id, gone);
    assert.deepEqual(ledger.marker("web-user", `tidy:project:${gone}`)?.body, { seen: true });
    assertHomeBusinessUnchanged(before, homeBusinessTree(home), ["projects/catalog.db"], "unknown ledger notes cannot prove emptiness or authorize cleanup");
    assert.deepEqual(runtimeBusinessEntries(join(home, "agent-runtime")), [], "technical owner files do not count as SDK business storage");
  }
});

for (const entry of ["unknown", "technical-link"] as const) test(`RAC-105-A-07: ${entry} runtime data cannot be mistaken for owner-only bookkeeping during memory preflight`, async t => {
  const { home, catalog } = await scratchHome(t), host = new MolisWorkLocalHost({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "保留的记忆", actor_id: "test-user" });
  const ledger = openMemoryLedger({ homeDirectory: home }), marker = `tidy:project:${project.project_id}`;
  const file = join(home, "agent-runtime", entry === "unknown" ? "unknown-sdk-entry" : ".molis-runtime-owner.db-wal");
  try {
    ledger.setMarker("web-user", marker, { original: true }, new Date().toISOString());
    if (entry === "unknown") writeFileSync(file, "original unknown runtime bytes");
    else symlinkSync(join(home, "missing-target"), file);
    const before = homeBusinessTree(home);
    if (entry === "unknown") await assert.rejects(projectDeletedHooksFor(home).ready(), /记忆放在 Agent/);
    else await assert.rejects(projectDeletedHooksFor(home).ready(), { code: "storage.owner.invalid" });
    assert.deepEqual(homeBusinessTree(home), before);
    assert.ok(ledger.marker("web-user", marker), "an unresolved runtime never clears ledger history");
    assert.equal(catalog.getProject(project.project_id).project_id, project.project_id);
  } finally { rmSync(file, { force: true }); ledger.close(); await host.close(); }
});

test("RAC-105-A-07: an occupied Home refuses its business Host before a demo rebuild, and the rebuild works after ownership is available", { timeout: 180_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  let host: MolisWorkLocalHost | undefined;
  const created = await catalog.ensureDemoProject(input);
  const held = await holdAgentRuntime(home);
  t.after(async () => { await held.release(); await host?.close(); });
  const files = recorder("test-files");
  const dispose = projectDeletedHooksFor(home).register(files.owner);
  t.after(dispose);

  assert.equal(created.status, "created", "there is no earlier demo, so there is nothing for the runtime to clear");
  assert.deepEqual(files.calls, []);
  const before = homeBusinessTree(home);
  assert.throws(() => { host = new MolisWorkLocalHost({ homeDirectory: home }); }, { code: "storage.owner.busy" });
  assert.deepEqual(homeBusinessTree(home), before);
  assert.deepEqual(files.calls, [], "no owner cleared a part before the rebuild refused: the runtime is only busy, and a retry can clear it");
  assert.equal(existsSync(created.project.database_path), true, "the demo is as it was");

  await held.release();
  host = new MolisWorkLocalHost({ homeDirectory: home });
  ensureSystemAgentService(host, home, withMolisWorkProjectCatalog);
  const rebuilt = await catalog.resetDemoProject(input);
  assert.deepEqual(files.calls, [DEMO_PROJECT_ID]);
  assert.equal(rebuilt.owners_left, undefined, "an executor that has the runtime leaves nothing to anyone");
});

test("a process without the Agent runtime rebuilds the demo, clears what it can, and reports what it left to Molis Work", async t => {
  const { home, catalog } = await scratchHome(t);
  await ranBefore(home);
  await catalog.ensureDemoProject(input);
  const sparks = () => { const store = openLingguangStore(home); try { return store.list(DEMO_PROJECT_ID).map(spark => spark.title); } finally { store.close(); } };
  const addSpark = (title: string) => { const store = openLingguangStore(home); store.create({ project_id: DEMO_PROJECT_ID, title, body: "私密" }); store.close(); };
  addSpark("重建前的想法");
  const files = recorder("test-files");
  const dispose = projectDeletedHooksFor(home).register(files.owner);
  t.after(dispose);

  const rebuilt = await catalog.resetDemoProject(input);

  assert.equal(rebuilt.status, "reset", "the rebuild is not refused for what only a running Molis Work can clear");
  assert.deepEqual(rebuilt.owners_left, ["memory", "search"], "it says which owners it left");
  assert.deepEqual(files.calls, [DEMO_PROJECT_ID], "every owner that could clear here did");
  assert.deepEqual(sparks(), [], "what the file-level owners kept for the old demo is gone");
  assert.equal(existsSync(rebuilt.project.database_path), true);
});

test("a catalog-only process cannot accept runtime cleanup; an accepted executor plan stays pending until its remaining owner completes", async t => {
  const { home, catalog } = await scratchHome(t);
  await ranBefore(home);
  const demo = await catalog.ensureDemoProject(input);
  const request = { project_id: DEMO_PROJECT_ID, actor_id: "test-user", delete_confirmed: true, idempotency_key: "demo-remove-1" };
  await assert.rejects(() => catalog.removeDemoProject(request), /运行中的 Molis Work/);
  assert.deepEqual(catalog.listProjectDeletions(), []);
  assert.equal(existsSync(demo.project.database_path), true);

  const host = new MolisWorkLocalHost({ homeDirectory: home });
  t.after(() => host.close());
  await ensureSystemAgentService(host, home, withMolisWorkProjectCatalog).ready;
  const search = recorder("search");
  let ready = false;
  const dispose = projectDeletedHooksFor(home).register({ ...search.owner, clear(projectId) {
    search.calls.push(projectId);
    if (!ready) throw new Error("搜索主人尚未完成");
  } });
  t.after(dispose);
  const removed = await catalog.removeDemoProject(request);
  assert.equal(removed.deletion.cleanup_state, "pending");
  assert.deepEqual(pendingOwners(removed.deletion), ["search"]);
  assert.equal(removed.deletion.owner_steps.find(step => step.owner_id === "memory")?.state, "complete");
  await assert.rejects(() => catalog.ensureDemoProject(input), /清理/);
  assert.equal(catalog.listProjects().some(project => project.project_id === DEMO_PROJECT_ID), false);
  assert.equal(existsSync(demo.project.database_path), true, "the original directory remains until all owners complete");

  ready = true;
  assert.equal((await catalog.ensureDemoProject(input)).status, "created");
  assert.equal(catalog.listProjectDeletions().find(item => item.deletion_id === removed.deletion.deletion_id)?.cleanup_state, "complete");
  assert.equal(search.calls.length, 4, "three original receipt attempts are followed by the new demo's ordinary owner cleanup");
  const next = catalog.getProject(DEMO_PROJECT_ID);
  const store = openLingguangStore(home); store.create({ project_id: DEMO_PROJECT_ID, title: "后继实例的记录", body: "保留" }); store.close();
  assert.equal((await catalog.ensureDemoProject(input)).status, "existing");
  assert.equal((await catalog.removeDemoProject(request)).replayed, true);
  assert.equal(existsSync(next.database_path), true);
  const reopened = openLingguangStore(home);
  try { assert.deepEqual(reopened.list(DEMO_PROJECT_ID).map(item => item.title), ["后继实例的记录"]); } finally { reopened.close(); }
});

test("demo recreation waits for a current resident Memory proof after Host shutdown and rejects a receipt with no owner steps", async t => {
  const { home, catalog } = await scratchHome(t);
  await ranBefore(home);
  const demo = await catalog.ensureDemoProject(input);
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  t.after(() => host.close());
  await ensureSystemAgentService(host, home, withMolisWorkProjectCatalog).ready;
  const removed = await catalog.removeDemoProject({ project_id: DEMO_PROJECT_ID, actor_id: "test-user", delete_confirmed: true, idempotency_key: "demo-remove-1" });
  assert.equal(removed.deletion.cleanup_state, "complete");
  await host.close();

  await assert.rejects(() => catalog.ensureDemoProject(input), /Molis Work/);
  assert.equal(catalog.listProjects().some(project => project.project_id === DEMO_PROJECT_ID), false);
  assert.equal(existsSync(dirname(demo.project.database_path)), false, "a historical receipt cannot authorize a new directory");
  const nextHost = new MolisWorkLocalHost({ homeDirectory: home });
  t.after(() => nextHost.close());
  await ensureSystemAgentService(nextHost, home, withMolisWorkProjectCatalog).ready;
  assert.equal((await catalog.ensureDemoProject(input)).status, "created", "the same request resumes through the actual resident owner");
  const next = await catalog.removeDemoProject({ project_id: DEMO_PROJECT_ID, actor_id: "test-user", delete_confirmed: true, idempotency_key: "demo-remove-2" });
  assert.equal(next.deletion.cleanup_state, "complete");
  await nextHost.close();
  // A pre-plan receipt without owner results is not proof that Memory has been cleared.
  const receipts = new DatabaseSync(join(home, "projects", "catalog.db"));
  try { receipts.exec("PRAGMA busy_timeout = 5000; DELETE FROM project_deletion_steps; UPDATE project_deletions SET recovery_plan = NULL"); } finally { receipts.close(); }
  await assert.rejects(() => catalog.ensureDemoProject(input), /Molis Work/);
  assert.equal(catalog.listProjects().some(project => project.project_id === DEMO_PROJECT_ID), false);
});

test("a catalog-only process in a Home that never ran the app has no memory or search to wait for", async t => {
  const { catalog } = await scratchHome(t);
  const original = await catalog.ensureDemoProject(input);
  const removed = await catalog.removeDemoProject({ project_id: DEMO_PROJECT_ID, actor_id: "test-user", delete_confirmed: true, idempotency_key: "demo-remove-1" });
  assert.equal(removed.deletion.cleanup_state, "complete");
  assert.deepEqual(removed.deletion.owner_steps.filter(step => step.owner_id === "memory" || step.owner_id === "search").map(step => step.state), ["complete", "complete"]);
  mkdirSync(dirname(original.project.database_path));
  await assert.rejects(catalog.ensureDemoProject(input), { code: "catalog.project_storage_invalid" });
  assert.equal(existsSync(dirname(original.project.database_path)), true, "an unexplained directory is not covered by an old complete receipt");
  await rm(dirname(original.project.database_path), { recursive: true });
  assert.equal((await catalog.ensureDemoProject(input)).status, "created");
  const rebuilt = await catalog.resetDemoProject(input);
  assert.equal(rebuilt.status, "reset");
  assert.equal(rebuilt.owners_left, undefined, "nothing was left: there is no runtime or index that could hold anything");
});

test("demo recreation owns its staging and rechecks the live empty proof inside a queued Catalog commit", { timeout: 60_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  const demo = await catalog.ensureDemoProject(input), directory = dirname(demo.project.database_path);
  const host = new MolisWorkLocalHost({ homeDirectory: home }); t.after(() => host.close());
  const agents = ensureSystemAgentService(host, home, withMolisWorkProjectCatalog); await agents.ready;
  assert.equal((await catalog.removeDemoProject(deletion(DEMO_PROJECT_ID))).deletion.cleanup_state, "complete");
  const hooks = projectDeletedHooksFor(home), memory = hooks.owners().find(owner => owner.id === "memory")!;
  const proofChecks: boolean[] = [];
  let entered!: () => void, release!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const dispose = hooks.register({ ...memory, withRecreation: (facts, work) => memory.withRecreation!(facts, async current => {
    entered(); await gate; return work(() => { proofChecks.push(memory.alive?.() === true); current(); });
  }) }); t.after(dispose);
  const creating = catalog.ensureDemoProject(input); void creating.catch(() => undefined); await waiting;
  const staging = join(home, "projects", `.staging-${DEMO_PROJECT_ID}`);
  assert.equal(existsSync(staging), true);
  await assert.rejects(catalog.ensureDemoProject(input), { code: "EEXIST" });
  assert.equal(existsSync(staging), true, "the losing request does not remove the winner's staging");
  await assert.rejects(agents.agentHost.adapter("prologue").createSession({ project_id: DEMO_PROJECT_ID,
    plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: LOCAL_PERSON_ACTOR_ID,
    workspace: "none", role_id: "coding", title: "Cannot enter the empty-proof window" }), { code: "agent.session_busy" });
  // A different process owns the SQLite lock: closing another Catalog connection here cannot release it.
  const lock = spawn(process.execPath, ["--input-type=module", "-e", `
    import { DatabaseSync } from "node:sqlite";
    const db = new DatabaseSync(process.argv[1]);
    db.exec("BEGIN IMMEDIATE"); process.send({ locked: true });
    process.once("message", () => { db.exec("ROLLBACK"); db.close(); process.disconnect(); });
  `, join(home, "projects", "catalog.db")], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  const exited = once(lock, "exit");
  t.after(async () => { if (lock.exitCode === null && lock.signalCode === null) lock.kill("SIGKILL"); await exited; });
  const [locked] = await Promise.race([once(lock, "message"), exited.then(() => { throw new Error("Catalog lock process exited before acquisition"); })]);
  assert.deepEqual(locked, { locked: true });
  try {
    release();
    const deadline = Date.now() + 10_000;
    while (!existsSync(directory) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(existsSync(directory), true, "the real Catalog commit is waiting after staging promotion");
    assert.equal(catalog.listProjects().some(project => project.project_id === DEMO_PROJECT_ID), false, "the independently held write lock prevents Catalog registration");
    assert.equal(memory.alive?.(), true);
    await host.close();
    assert.equal(memory.alive?.(), false, "the original Memory owner is invalid before releasing the Catalog lock");
  } finally { lock.send("release"); await exited; }
  await assert.rejects(creating, /空态证明已结束/);
  assert.equal(proofChecks.at(-1), false, "the actual synchronous commit rechecks the closed original owner");
  assert.equal(catalog.listProjects().some(project => project.project_id === DEMO_PROJECT_ID), false);
  assert.equal(existsSync(directory), false); assert.equal(existsSync(staging), false);
  dispose();
  const resumed = new MolisWorkLocalHost({ homeDirectory: home }); t.after(() => resumed.close());
  await ensureSystemAgentService(resumed, home, withMolisWorkProjectCatalog).ready;
  assert.equal((await catalog.ensureDemoProject(input)).status, "created");
});

test("a Host finishes the deletions other processes left pending, as it starts and while it runs", { timeout: 60_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  const projects = await Promise.all(["先留下的项目", "后留下的项目"].map(async name => (await catalog.createProject({ display_name: name, actor_id: "test-user" })).project_id));
  const late = recorder("test-late");
  let ready = false;
  const owner: ProjectDeletedOwner = { ...late.owner, clear(projectId) { late.calls.push(projectId); if (!ready) throw new Error("还没有清好"); } };
  const dispose = projectDeletedHooksFor(home).register(owner);
  t.after(dispose);
  const receipt = (projectId: string) => catalog.listProjectDeletions().find(item => item.project_id === projectId);
  const settled = async (projectId: string) => {
    const deadline = Date.now() + 20_000;
    while (receipt(projectId)?.cleanup_state !== "complete" && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    return receipt(projectId)?.cleanup_state;
  };
  // Another process deleted it before this Host started.
  assert.equal((await catalog.deleteProject(deletion(projects[0]!))).deletion.cleanup_state, "pending");

  ready = true;
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: "project-deletion-processes-0123456789", deletionSweepMs: 100 });
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  assert.equal(await settled(projects[0]!), "complete", "starting the Host finished the receipt without anyone asking for it");

  // Another process deletes while this Host runs: its next tick finishes that too.
  ready = false;
  assert.equal((await catalog.deleteProject(deletion(projects[1]!))).deletion.cleanup_state, "pending");
  ready = true;
  assert.equal(await settled(projects[1]!), "complete", "a deletion made while the Host runs is finished without a restart");
  assert.deepEqual([...new Set(late.calls)].sort(), [...projects].sort());
});

test("the public CLI refuses an unprepared runtime deletion and retains the original demo with no receipt", { timeout: 180_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-deletion-cli-"));
  const home = join(directory, "home");
  t.after(() => rm(directory, { recursive: true, force: true }));
  await withMolisWorkProjectCatalog({ homeDirectory: home }, () => undefined);
  await ranBefore(home);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const demo = (action: string, ...flags: string[]) => spawnSync(process.execPath, [join(root, "dist", "cli", "main.js"), "demo", action, "--home", home, "--confirm", ...flags], { cwd: root, env: process.env, encoding: "utf8" });

  const created = demo("create", "--json");
  assert.equal(created.status, 0, created.stderr);
  const removed = demo("remove");
  assert.notEqual(removed.status, 0, "the CLI cannot accept a plan owned by a runtime it does not run");
  assert.match(removed.stderr + removed.stdout, /运行中的 Molis Work/);
  const again = demo("create", "--json");
  assert.equal(again.status, 0, again.stderr);
  assert.equal(JSON.parse(again.stdout).status, "existing", "the original demo was never removed");

  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    assert.deepEqual(catalog.listProjectDeletions(), []);
    assert.equal(catalog.listProjects().some(project => project.project_id === DEMO_PROJECT_ID), true);
    assert.equal(existsSync(catalog.getProject(DEMO_PROJECT_ID).database_path), true);
  } finally { catalog.close(); }
});

test("the public CLI rebuilds the demo in a Home that has an Agent runtime, and says what it left to a running Molis Work", { timeout: 180_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-deletion-cli-reset-"));
  const home = join(directory, "home");
  t.after(() => rm(directory, { recursive: true, force: true }));
  await withMolisWorkProjectCatalog({ homeDirectory: home }, () => undefined);
  await ranBefore(home);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const demo = (action: string, ...flags: string[]) => spawnSync(process.execPath, [join(root, "dist", "cli", "main.js"), "demo", action, "--home", home, "--confirm", ...flags], { cwd: root, env: process.env, encoding: "utf8" });
  const sparks = () => { const store = openLingguangStore(home); try { return store.list(DEMO_PROJECT_ID).map(spark => spark.title); } finally { store.close(); } };

  assert.equal(demo("create").status, 0);
  const store = openLingguangStore(home); store.create({ project_id: DEMO_PROJECT_ID, title: "重建前的想法", body: "私密" }); store.close();
  assert.deepEqual(sparks(), ["重建前的想法"]);

  const reset = demo("reset");

  assert.equal(reset.status, 0, `the documented upgrade step works where the app has run: ${reset.stderr}`);
  assert.match(reset.stdout, /已重置/);
  assert.match(reset.stdout, /memory、search/, "it names the data it did not clear");
  assert.match(reset.stdout, /重建 demo/, "and says where to clear it");
  assert.deepEqual(sparks(), [], "what the Home libraries kept for the old demo is cleared");
  const json = demo("reset", "--json");
  assert.equal(json.status, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout).owners_left, ["memory", "search"]);

  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    assert.equal(catalog.listProjects().some(project => project.project_id === DEMO_PROJECT_ID), true, "the demo is there");
    assert.deepEqual(catalog.listProjectDeletions(), [], "a rebuild is not a deletion: no receipt");
  } finally { catalog.close(); }
});
