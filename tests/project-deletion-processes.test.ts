import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { DEMO_PROJECT_ID, MolisWorkLocalHost, ensureSystemAgentService, projectDeletedHooksFor, type ProjectDeletedOwner } from "@molis-ai/molis-work-app-local-host";
import { openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { openMemoryLedger, openTextSearchIndex } from "@molis-ai/molis-work-storage";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";

/**
 * What deleting a project does when the process that deletes it is not the one that has every service: another process
 * holds the Agent runtime (memory lives in it), a Host only forwards to the one that runs it (the stdio MCP's), or the
 * process is only a catalog (the CLI, the uninstaller) with no memory or search service at all. The owner steps that
 * cannot run there stay pending in the receipt for a Host that can; a demo rebuild leaves them to it instead of waiting.
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
function ranBefore(home: string): void {
  mkdirSync(join(home, "agent-runtime"), { recursive: true });
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

test("a Host that is not the executor (the stdio MCP's) leaves the memory step to the Host that is, and starts no Agent runtime for it", { timeout: 180_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  ranBefore(home);
  // What the MCP launcher builds when it forwards actions to the resident Host: a Host with the Home and no transport that
  // adopted its Agent service (the Web server and the embedded MCP pass the catalog owner for that).
  const forwarding = new MolisWorkLocalHost({ homeDirectory: home });
  t.after(() => forwarding.close());
  const gone = (await catalog.createProject({ display_name: "要删除的项目", actor_id: "test-user" })).project_id;

  const deferred = await catalog.deleteProject(deletion(gone));

  assert.equal(deferred.deletion.cleanup_state, "pending");
  assert.deepEqual(pendingOwners(deferred.deletion), ["memory"], "every other owner cleared; memory waits for the executor");
  assert.match(deferred.deletion.owner_steps.find(step => step.owner_id === "memory")?.error ?? "", /运行中的 Molis Work/);
  const free = await holdAgentRuntime(home).catch((error: Error) => error);
  assert.ok(!(free instanceof Error), `the Agent runtime is still free for the process that runs it (this Host took it: ${free instanceof Error ? free.message.slice(0, 200) : ""})`);
  if (!(free instanceof Error)) await free.release();

  // The MCP process ends; the Web server is the executor (one Host in a process, so the forwarding one is closed first):
  // it finishes what another process left, without anyone asking.
  await forwarding.close();
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: "project-deletion-processes-0123456789", deletionSweepMs: 100 });
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const deadline = Date.now() + 120_000;
  while (catalog.listProjectDeletions().find(item => item.project_id === gone)?.cleanup_state !== "complete" && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  const finished = catalog.listProjectDeletions().find(item => item.project_id === gone);
  assert.equal(finished?.cleanup_state, "complete", finished?.cleanup_error ?? "");
  assert.deepEqual(finished?.owner_steps.filter(step => step.owner_id === "memory").map(step => [step.state, step.error]), [["complete", null]]);
});

test("the stdio MCP launcher's server deletes a project through its tool, leaves memory to the resident Host, and leaves the Agent runtime free", { timeout: 180_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  ranBefore(home);
  const project = await catalog.createProject({ display_name: "要删除的项目", actor_id: "test-user" });
  // As apps/desktop/launchers/mcp/server.ts builds it: the Runtime's Home and the resident Host's address, so every action
  // is forwarded to that Host and this process runs none.
  const server = new MolisWorkServer("runtime", null, { homeDirectory: home, runtimeContext: { runtime_id: "codex", stable_work_context_id: "project-deletion-processes", host_declares_stable: true } },
    undefined, "http://127.0.0.1:4173");
  t.after(() => server.close());
  const call = async (name: string, args: Record<string, unknown>) => (await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) as
    { result: { isError: boolean; content: Array<{ text: string }> } }).result;

  const bound = await call("molis_work_v1_context_bind", { project_id: project.project_id, actor_id: "runtime-codex", user_confirmed: true });
  assert.equal(bound.isError, false, bound.content[0]?.text);
  const deleted = await call("molis_work_v1_project_delete", { project_id: project.project_id, actor_id: "runtime-codex", delete_confirmed: true, idempotency_key: "mcp-forwarding-delete" });
  assert.equal(deleted.isError, false, deleted.content[0]?.text);

  const receipt = (JSON.parse(deleted.content[0]!.text) as { deletion: { cleanup_state: string; owner_steps: Array<{ owner_id: string; state: string }> } }).deletion;
  assert.equal(receipt.cleanup_state, "pending");
  assert.deepEqual(pendingOwners(receipt), ["memory"], "the other owners finished; the resident Host runs the memory step");
  const free = await holdAgentRuntime(home).catch((error: Error) => error);
  assert.ok(!(free instanceof Error), `the tool call did not take the Agent runtime from the resident Host (${free instanceof Error ? free.message.slice(0, 200) : ""})`);
  if (!(free instanceof Error)) await free.release();
});

test("an executor whose Agent runtime another process holds defers the memory step, and the receipt finishes once the runtime is free", { timeout: 180_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  ensureSystemAgentService(host, home, withMolisWorkProjectCatalog);
  const held = await holdAgentRuntime(home);
  t.after(async () => { await held.release(); await host.close(); });
  const gone = (await catalog.createProject({ display_name: "要删除的项目", actor_id: "test-user" })).project_id;

  const deferred = await catalog.deleteProject(deletion(gone));
  assert.equal(deferred.deletion.cleanup_state, "pending");
  assert.deepEqual(pendingOwners(deferred.deletion), ["memory"], "the other owners finished; memory waits for the process that has the runtime");
  const step = deferred.deletion.owner_steps.find(item => item.owner_id === "memory");
  assert.match(step?.error ?? "", /另一个 Molis Work 进程.*接着清理/, "the step says the process that owns the runtime finishes it");
  assert.equal(catalog.listProjects().some(project => project.project_id === gone), false);

  await held.release();
  const finished = await catalog.deleteProject(deletion(gone));
  assert.equal(finished.replayed, true);
  assert.equal(finished.deletion.cleanup_state, "complete");
  assert.deepEqual(finished.deletion.owner_steps.filter(item => item.owner_id === "memory").map(item => [item.state, item.error]), [["complete", null]]);
});

test("a Host whose runtime has already started clears the memory step itself, whatever transport it serves", { timeout: 180_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  t.after(() => host.close());
  // No transport adopted the service (no catalog owner), but something needed the runtime, so this process holds it.
  const service = ensureSystemAgentService(host, home);
  await service.ready;
  const gone = (await catalog.createProject({ display_name: "要删除的项目", actor_id: "test-user" })).project_id;

  const result = await catalog.deleteProject(deletion(gone));

  assert.equal(result.deletion.cleanup_state, "complete", "waiting for another process could never help: this one holds the runtime");
  assert.deepEqual(result.deletion.owner_steps.filter(step => step.owner_id === "memory").map(step => [step.state, step.error]), [["complete", null]]);
});

test("a Host in a Home that never ran an Agent clears the project's notes in the ledger without starting a runtime", { timeout: 60_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  t.after(() => host.close());
  const gone = (await catalog.createProject({ display_name: "要删除的项目", actor_id: "test-user" })).project_id;
  const ledger = openMemoryLedger({ homeDirectory: home });
  t.after(() => ledger.close());
  ledger.setMarker("web-user", `tidy:project:${gone}`, { seen: true }, new Date().toISOString());
  assert.ok(ledger.marker("web-user", `tidy:project:${gone}`));

  const result = await catalog.deleteProject(deletion(gone));

  assert.equal(result.deletion.cleanup_state, "complete");
  assert.equal(ledger.marker("web-user", `tidy:project:${gone}`), null, "the ledger forgot the project");
  assert.equal(existsSync(join(home, "agent-runtime")), false, "no Agent runtime was started to find there was nothing in it");
});

test("with the Agent runtime held by another process a demo is still made the first time, and a rebuild refuses before it clears anything", { timeout: 180_000 }, async t => {
  const { home, catalog } = await scratchHome(t);
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  ensureSystemAgentService(host, home, withMolisWorkProjectCatalog);
  const held = await holdAgentRuntime(home);
  t.after(async () => { await held.release(); await host.close(); });
  const files = recorder("test-files");
  const dispose = projectDeletedHooksFor(home).register(files.owner);
  t.after(dispose);

  const created = await catalog.ensureDemoProject(input);
  assert.equal(created.status, "created", "there is no earlier demo, so there is nothing for the runtime to clear");
  assert.deepEqual(files.calls, []);

  await assert.rejects(() => catalog.resetDemoProject(input), /另一个/);
  assert.deepEqual(files.calls, [], "no owner cleared a part before the rebuild refused: the runtime is only busy, and a retry can clear it");
  assert.equal(existsSync(created.project.database_path), true, "the demo is as it was");

  await held.release();
  const rebuilt = await catalog.resetDemoProject(input);
  assert.deepEqual(files.calls, [DEMO_PROJECT_ID]);
  assert.equal(rebuilt.owners_left, undefined, "an executor that has the runtime leaves nothing to anyone");
});

test("a process without the Agent runtime rebuilds the demo, clears what it can, and reports what it left to Molis Work", async t => {
  const { home, catalog } = await scratchHome(t);
  ranBefore(home);
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

test("a catalog-only process leaves the memory and search steps pending for the next Host, and the demo is not made again until they are done", async t => {
  const { home, catalog } = await scratchHome(t);
  ranBefore(home);
  await catalog.ensureDemoProject(input);

  const removed = await catalog.removeDemoProject({ project_id: DEMO_PROJECT_ID, actor_id: "test-user", delete_confirmed: true, idempotency_key: "demo-remove-1" });
  assert.equal(removed.deletion.cleanup_state, "pending", "the receipt is not complete while memory and search are still there");
  assert.deepEqual(pendingOwners(removed.deletion), ["memory", "search"]);
  assert.ok(removed.deletion.owner_steps.filter(step => step.state === "complete").length >= 1, "the file-level owners cleared their part");
  await assert.rejects(() => catalog.ensureDemoProject(input), /清理/);
  assert.equal(catalog.listProjects().some(project => project.project_id === DEMO_PROJECT_ID), false, "no demo is made over memories that are still there");

  // The next Host has both services: its owners take the steps over.
  const memory = recorder("memory"), search = recorder("search");
  const disposers = [projectDeletedHooksFor(home).register(memory.owner), projectDeletedHooksFor(home).register(search.owner)];
  try {
    assert.equal((await catalog.ensureDemoProject(input)).status, "created");
    assert.deepEqual([memory.calls, search.calls], [[DEMO_PROJECT_ID, DEMO_PROJECT_ID], [DEMO_PROJECT_ID, DEMO_PROJECT_ID]], "each ran the pending step of the receipt, then cleared again for the new demo");
    assert.equal(catalog.listProjectDeletions().find(item => item.deletion_id === removed.deletion.deletion_id)?.cleanup_state, "complete");
  } finally { for (const dispose of disposers) dispose(); }
});

test("a catalog-only process makes the demo again over a deletion whose owner steps a Host finished, but not over one recorded before owner steps", async t => {
  const { home, catalog } = await scratchHome(t);
  ranBefore(home);
  await catalog.ensureDemoProject(input);
  // A Host (memory and search owners of its own) deletes the demo; every step of the receipt is complete.
  const memory = recorder("memory"), search = recorder("search");
  const hostOwners = [projectDeletedHooksFor(home).register(memory.owner), projectDeletedHooksFor(home).register(search.owner)];
  try {
    const removed = await catalog.removeDemoProject({ project_id: DEMO_PROJECT_ID, actor_id: "test-user", delete_confirmed: true, idempotency_key: "demo-remove-1" });
    assert.equal(removed.deletion.cleanup_state, "complete");
  } finally { for (const dispose of hostOwners) dispose(); }

  // Back in a catalog-only process: the receipt says memory and search already ran, so they need not run again.
  assert.equal((await catalog.ensureDemoProject(input)).status, "created");
  await catalog.removeDemoProject({ project_id: DEMO_PROJECT_ID, actor_id: "test-user", delete_confirmed: true, idempotency_key: "demo-remove-2" })
    .then(result => assert.equal(result.deletion.cleanup_state, "pending"));
  // A receipt from before owner steps proves nothing about them: with no Host to clear them, no demo is made.
  const receipts = new DatabaseSync(join(home, "projects", "catalog.db"));
  try { receipts.exec("PRAGMA busy_timeout = 5000; DELETE FROM project_deletion_steps; UPDATE project_deletions SET cleanup_state = 'complete', cleanup_error = NULL"); } finally { receipts.close(); }
  await assert.rejects(() => catalog.ensureDemoProject(input), /Molis Work/);
  assert.equal(catalog.listProjects().some(project => project.project_id === DEMO_PROJECT_ID), false);
});

test("a catalog-only process in a Home that never ran the app has no memory or search to wait for", async t => {
  const { catalog } = await scratchHome(t);
  await catalog.ensureDemoProject(input);
  const removed = await catalog.removeDemoProject({ project_id: DEMO_PROJECT_ID, actor_id: "test-user", delete_confirmed: true, idempotency_key: "demo-remove-1" });
  assert.equal(removed.deletion.cleanup_state, "complete");
  assert.deepEqual(removed.deletion.owner_steps.filter(step => step.owner_id === "memory" || step.owner_id === "search").map(step => step.state), ["complete", "complete"]);
  assert.equal((await catalog.ensureDemoProject(input)).status, "created");
  const rebuilt = await catalog.resetDemoProject(input);
  assert.equal(rebuilt.status, "reset");
  assert.equal(rebuilt.owners_left, undefined, "nothing was left: there is no runtime or index that could hold anything");
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

test("the public CLI removes the demo, says what waits for a running Molis Work, and does not make the demo again until that is done", { timeout: 180_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-deletion-cli-"));
  const home = join(directory, "home");
  t.after(() => rm(directory, { recursive: true, force: true }));
  ranBefore(home);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const demo = (action: string, ...flags: string[]) => spawnSync(process.execPath, [join(root, "dist", "cli", "main.js"), "demo", action, "--home", home, "--confirm", ...flags], { cwd: root, env: process.env, encoding: "utf8" });

  const created = demo("create", "--json");
  assert.equal(created.status, 0, created.stderr);
  const removed = demo("remove");
  assert.equal(removed.status, 0, removed.stderr);
  assert.match(removed.stdout, /memory、search/, "it says which data is left for a running Molis Work");
  const again = demo("create");
  assert.notEqual(again.status, 0, "no demo over memories that are still there");
  assert.match(again.stderr + again.stdout, /清理/);

  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const receipt = catalog.listProjectDeletions()[0]!;
    assert.equal(receipt.cleanup_state, "pending");
    assert.deepEqual(pendingOwners(receipt), ["memory", "search"]);
    assert.equal(catalog.listProjects().some(project => project.project_id === DEMO_PROJECT_ID), false);
  } finally { catalog.close(); }
});

test("the public CLI rebuilds the demo in a Home that has an Agent runtime, and says what it left to a running Molis Work", { timeout: 180_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-deletion-cli-reset-"));
  const home = join(directory, "home");
  t.after(() => rm(directory, { recursive: true, force: true }));
  ranBefore(home);
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
