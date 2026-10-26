import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID as actor } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, ensureSystemAgentService, memoryRuntimePolicy, type HomeInitializationFailure } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog, recoverDesktopMemoryHome } from "@molis-ai/molis-work-app-desktop";
import { createMemoryLedgerHomeRecovery } from "@molis-ai/molis-work-storage";
import { openPrologueMemoryAdoptionInspection } from "@molis-ai/molis-work-service-agent-host";

// T0 and T1 are actual complete stopped snapshots of this same original absolute Home.
test("MEM-40-FRAME-06: public recovery replays the real Catalog deletion with nonempty project and selected personal Memory", async t => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "molis-home-project-recovery-"))), home = join(directory, "home");
  let catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const gone = await catalog.createProject({ actor_id: actor, display_name: "Original project" });
  const kept = await catalog.createProject({ actor_id: actor, display_name: "Unselected project" });
  let host = new MolisWorkLocalHost({ homeDirectory: home });
  let failure: HomeInitializationFailure | undefined;
  t.after(async () => { await failure?.close(); await host.close(); catalog.close(); rmSync(directory, { recursive: true, force: true }); });
  const open = async () => { const system = ensureSystemAgentService(host, home, withMolisWorkProjectCatalog); await system.ready; return system.agentHost.adapter("prologue"); };
  let adapter = await open();
  const owner = { actor_id: actor, project_id: gone.project_id, plugin_id: "io.molis.work.coding", install_id: "coding" };
  const session = await adapter.createSession({ ...owner, workspace: "none", role_id: "coding", title: "Original canonical project Session" });
  const caller = { actor_id: actor, project_id: gone.project_id, consumer: "ui" as const, person: true, purpose: "management" as const, current_scene: "common" as const,
    operation_id: "seed-original", session_id: session.session_id };
  const meta = { kind: "fact", source: "manual", classification: { scenes: ["common"], lifecycle: "long-term" },
    session_ref: { kind: "session" as const, id: session.session_id, revision: 1 } };
  const projectMemory = await adapter.memory!.withCaller(caller).write({ scope: "project", owner: gone.project_id,
    text: "Original project secret", origin: "person", operation_id: "project-memory", meta });
  const personal = await adapter.memory!.withCaller(caller).write({ scope: "user", owner: actor,
    text: "Original personal Session secret", origin: "person", operation_id: "personal-memory", meta });
  const keptMemory = await adapter.memory!.withCaller({ ...caller, project_id: kept.project_id, session_id: undefined }).write({ scope: "project", owner: kept.project_id,
    text: "Other project secret stays", origin: "person", operation_id: "kept-memory", meta: { ...meta, session_ref: undefined } });
  await host.close(); catalog.close();
  const original = join(directory, "T0"), source = join(directory, "T1"); cpSync(home, original, { recursive: true });
  catalog = await openMolisWorkProjectCatalog({ homeDirectory: home }); host = new MolisWorkLocalHost({ homeDirectory: home }); adapter = await open();
  const removed = await catalog.deleteProject({ project_id: gone.project_id, actor_id: actor, delete_confirmed: true, idempotency_key: "original-project-deletion" });
  assert.equal(removed.deletion.cleanup_state, "complete"); assert.equal(existsSync(gone.database_path), false);
  await host.close(); catalog.close(); cpSync(home, source, { recursive: true });
  rmSync(home, { recursive: true }); cpSync(original, home, { recursive: true });
  t.mock.method(globalThis, "fetch", async () => { assert.fail("cold project recovery cannot dispatch models or network"); });
  const input = { homeDirectory: home, sourceDirectory: source, operation_id: "recover-project", assertCurrent() {} };
  try { assert.equal((await recoverDesktopMemoryHome(input)).outcome, "completed"); }
  catch (error) { failure = error as HomeInitializationFailure; throw error; }
  assert.equal(existsSync(gone.database_path), false); assert.equal(existsSync(kept.database_path), true);
  const parent = createMemoryLedgerHomeRecovery({ homeDirectory: home, operation_id: input.operation_id, assertCurrent() {} });
  try { const body = parent.read().parent!.body; assert.equal(body.phase, "committed"); assert.equal(body.project_groups.length, 1); assert.equal(body.sessions.length, 0); }
  finally { await parent.close(); }
  const inspection = await openPrologueMemoryAdoptionInspection({ storageRoot: join(home, "agent-runtime"), appVersion: "1.0.0",
    scopes: [{ scope: "user", owner: actor }, { scope: "project", owner: gone.project_id }, { scope: "project", owner: kept.project_id }], policy: memoryRuntimePolicy(() => undefined).policy });
  try {
    for (const [memory, identity] of [[projectMemory, { scope: "project" as const, owner: gone.project_id }], [personal, { scope: "user" as const, owner: actor }]] as const)
      assert.equal((await inspection.inspectMemory({ ref: { kind: "memory", id: memory.memory_id, revision: 1 }, identity })).state, "cleared");
    assert.equal((await inspection.inspectMemory({ ref: { kind: "memory", id: keptMemory.memory_id, revision: 1 }, identity: { scope: "project", owner: kept.project_id } })).state, "present");
    const observed = await inspection.inspectSession({ ref: { kind: "session", id: session.session_id, revision: 1 } });
    assert.equal(observed.state, "purged"); if (observed.state === "purged") assert.equal(observed.termination.phase, "complete");
  } finally { await inspection.close(); }
  assert.equal((await recoverDesktopMemoryHome(input)).replayed, true);
  catalog = await openMolisWorkProjectCatalog({ homeDirectory: home }); assert.deepEqual(catalog.listProjects().map(item => item.project_id), [kept.project_id]);
});
