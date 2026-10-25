import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_PERSON_ACTOR_ID as actor } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, ensureSystemAgentService, memoryRuntimePolicy } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { acquireStorageOwner, createMemoryLedgerHomeRecovery } from "@molis-ai/molis-work-storage";
import { openPrologueMemoryAdoptionInspection } from "@molis-ai/molis-work-service-agent-host";

test("the built maintenance CLI rejects a live owner, then recovers nonempty stopped copies and replays its original decision across processes", { timeout: 120_000 }, async t => {
  const root = realpathSync(mkdtempSync("/private/tmp/molis-memory-recovery-cli-")), home = join(root, "home"), source = join(root, "T1");
  let catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const gone = await catalog.createProject({ actor_id: actor, display_name: "Original project" });
  const kept = await catalog.createProject({ actor_id: actor, display_name: "Keep this project" });
  let host = new MolisWorkLocalHost({ homeDirectory: home });
  t.after(async () => { await host.close(); catalog.close(); rmSync(root, { recursive: true, force: true }); });
  const start = async () => { const system = ensureSystemAgentService(host, home, withMolisWorkProjectCatalog); await system.ready; return system.agentHost.adapter("prologue"); };
  let adapter = await start();
  const caller = { actor_id: actor, project_id: gone.project_id, consumer: "ui" as const, person: true, purpose: "management" as const,
    current_scene: "common" as const, operation_id: "seed-original" };
  const meta = { kind: "fact", source: "manual", classification: { scenes: ["common"], lifecycle: "long-term" } };
  const selected = await adapter.memory!.withCaller(caller).write({ scope: "project", owner: gone.project_id,
    text: "Original selected project memory", origin: "person", operation_id: "selected", meta });
  const unselected = await adapter.memory!.withCaller({ ...caller, project_id: kept.project_id }).write({ scope: "project", owner: kept.project_id,
    text: "Unselected project memory remains", origin: "person", operation_id: "unselected", meta });
  await host.close(); catalog.close(); const original = join(root, "T0"); cpSync(home, original, { recursive: true });
  catalog = await openMolisWorkProjectCatalog({ homeDirectory: home }); host = new MolisWorkLocalHost({ homeDirectory: home }); adapter = await start();
  const removed = await catalog.deleteProject({ project_id: gone.project_id, actor_id: actor, delete_confirmed: true, idempotency_key: "original-project-deletion" });
  assert.equal(removed.deletion.cleanup_state, "complete"); await host.close(); catalog.close(); cpSync(home, source, { recursive: true });
  rmSync(home, { recursive: true }); cpSync(original, home, { recursive: true });

  const operation = "original-home-recovery", fallback = join(root, "unused-default-home");
  const command = (confirm = true) => new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    execFile(process.execPath, [fileURLToPath(new URL("../dist/cli/main.js", import.meta.url)), "memory", "recover-home",
      "--source-home", source, "--target-home", home, "--operation-id", operation, ...(confirm ? ["--confirm"] : []), "--json"],
    { env: { ...process.env, MOLIS_WORK_HOME: fallback }, timeout: 30_000, maxBuffer: 1_048_576 }, (error, stdout, stderr) => {
      if (error && typeof error.code !== "number") { reject(error); return; }
      resolve({ code: error?.code ?? 0, stdout, stderr });
    });
  });
  const inspect = async () => {
    const reader = await openPrologueMemoryAdoptionInspection({ storageRoot: join(home, "agent-runtime"), appVersion: "1.0.0",
      scopes: [{ scope: "project", owner: gone.project_id }, { scope: "project", owner: kept.project_id }], policy: memoryRuntimePolicy(() => undefined).policy });
    try { return await Promise.all([selected, unselected].map((entry, index) => reader.inspectMemory({ ref: { kind: "memory", id: entry.memory_id, revision: 1 },
      identity: { scope: "project", owner: index === 0 ? gone.project_id : kept.project_id } }))); }
    finally { await reader.close(); }
  };
  const unconfirmed = await command(false); assert.equal(unconfirmed.code, 1); assert.equal(unconfirmed.stdout.trim(), "");
  assert.match(unconfirmed.stderr, /--confirm/); assert.equal((await inspect())[0]!.state, "present");
  const owner = acquireStorageOwner(join(home, "agent-runtime"));
  try { const blocked = await command(); assert.equal(blocked.code, 1); assert.equal(blocked.stdout.trim(), ""); assert.ok(blocked.stderr.trim()); }
  finally { owner.release(); }
  assert.equal((await inspect())[0]!.state, "present"); assert.equal(existsSync(gone.database_path), true);

  const completed = await command(); assert.equal(completed.code, 0, completed.stderr);
  assert.deepEqual(JSON.parse(completed.stdout), { outcome: "completed", operation_id: operation, replayed: false });
  const parent = createMemoryLedgerHomeRecovery({ homeDirectory: home, operation_id: operation, assertCurrent() {} });
  let saved: unknown;
  try { const body = parent.read().parent!.body; saved = body; assert.equal(body.phase, "committed"); assert.equal(body.project_groups.length, 1); }
  finally { await parent.close(); }
  assert.deepEqual((await inspect()).map(value => value.state), ["cleared", "present"]);
  assert.equal(existsSync(gone.database_path), false); assert.equal(existsSync(kept.database_path), true);
  const replayed = await command(); assert.equal(replayed.code, 0, replayed.stderr);
  assert.deepEqual(JSON.parse(replayed.stdout), { outcome: "completed", operation_id: operation, replayed: true });
  const replayParent = createMemoryLedgerHomeRecovery({ homeDirectory: home, operation_id: operation, assertCurrent() {} });
  try { assert.deepEqual(replayParent.read().parent!.body, saved); } finally { await replayParent.close(); }
  catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  assert.deepEqual(catalog.listProjects().map(project => project.project_id), [kept.project_id]);
  host = new MolisWorkLocalHost({ homeDirectory: home }); adapter = await start();
  const retained = await adapter.memory!.withCaller({ ...caller, project_id: kept.project_id }).list("project", kept.project_id);
  assert.deepEqual(retained.map(entry => [entry.memory_id, entry.version, entry.text]), [[unselected.memory_id, unselected.version, unselected.text]]);
  assert.equal(existsSync(fallback), false);
});
