import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_PROJECT_ID, seedDemoBoard, releaseCodingSurface } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { ensureProjectPlugins } from "../apps/local-host/dist/project-plugins.js";
import { handleCodingPluginHttp } from "../apps/local-host/dist/coding-surface.js";

for (const mode of ["normal", "stop", "cancel-receipt", "revoke-receipt"] as const) test(`Coding background follower ${mode}`, { timeout: 30_000 }, async () => {
  const stop = mode === "stop", interruptedReceipt = mode === "cancel-receipt" || mode === "revoke-receipt";
  const controller = new AbortController(); let valid = true;
  const assertCurrent = () => { controller.signal.throwIfAborted(); if (!valid) throw new ActionError("actions.forbidden", "original call revoked"); };
  const root = mkdtempSync(join(tmpdir(), "coding-follow-")), dbPath = join(root, "board.db");
  seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const sessions = new CodingSessionStore(store.db);
  sessions.create({ project_id: DEMO_PROJECT_ID, session_id: "s", title: "会话", runtime_id: "prologue", at: new Date().toISOString() });
  sessions.setRuntimeSession(DEMO_PROJECT_ID, "s", "sdk", new Date().toISOString());
  const phases = ["running", "awaiting-review", "completed"];
  const seenStates: string[] = [];
  let waits = 0;
  let waitSignal: AbortSignal | undefined, releaseWait: (() => void) | undefined;
  const view = (phase: string) => ({ ref: { session_id: "sdk", run_id: "r1" }, phase, frozen: { role_id: "builder", text_materials: [] }, turns: [], activity: [], awaiting_input: [] });
  const host = () => ({ store, projectId: DEMO_PROJECT_ID, actions: pluginActions(store, DEMO_PROJECT_ID), actorId: "web-user", goalTitle: () => undefined,
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    execution: { ready: async () => {}, models: async () => [{ provider_id: "p", model_id: "m", label: "fixture" }] },
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input, options?: { signal?: AbortSignal }): Promise<Output> {
      if (definition.capability_id === projectSettingsCapabilities.workspaces.capability_id) return [{ workspace_id: "work", canonical_path: root, realpath_verified: true }] as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return [{ role_id: "builder", available: true }] as Output;
      if (definition.capability_id === agent.readSession.capability_id) return { runs: [] } as Output;
      if (definition.capability_id === agent.startRun.capability_id) {
        if (mode === "cancel-receipt") controller.abort(new ActionError("actions.cancelled", "original call cancelled after Run acceptance"));
        return { ref: { session_id: "sdk", run_id: "r1" }, frozen: {} } as Output;
      }
      if (definition.capability_id === agent.readMessages.capability_id) {
        if (mode === "revoke-receipt") valid = false;
        return [] as Output;
      }
      if (definition.capability_id === agent.waitRun.capability_id) {
        const [, run, since] = args as unknown as [unknown, { run_id: string }, string | null];
        assert.equal(run.run_id, "r1");
        assert.equal(since, waits ? `v${waits}` : null, "each wait continues from the version the last one returned");
        waitSignal = options?.signal;
        if (stop) await new Promise<void>(resolve => { releaseWait = resolve; });
        // Each wait answers with the next phase, as the Host does when the run's view changes.
        await new Promise(resolve => setTimeout(resolve, 20));
        seenStates.push(sessions.get(DEMO_PROJECT_ID, "s").state);
        const phase = phases[Math.min(waits, phases.length - 1)]!; waits++;
        return { version: `v${waits}`, view: view(phase) } as Output;
      }
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => { void handleCodingPluginHttp(request, response, new URL(request.url!, "http://localhost"), host()).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const platform = (await ensureProjectPlugins(host())).platform!;
    const beforeFiles = platform.viewRevision("io.molis.work.files"), beforeGit = platform.viewRevision("io.molis.work.git");
    const body = { task: "改一个文件", intent: "execute", workspace_id: "work", provider_id: "p", model_id: "m" };
    if (interruptedReceipt) {
      // R-CODING-RECEIPT-02: reject the original receipt at each post-start fence, while its accepted Run stays followed.
      const privateStorage = new SqlitePluginPrivateStorage(store.db), install = platform.supervisor.state("io.molis.work.coding")!.install_id!;
      const before = privateStorage.snapshotInstallationData(install);
      const result = await platform.router().dispatch({ method: "POST", pathname: "/api/plugins/io.molis.work.coding/sessions/s/runs", actor_id: "web-user", body,
        execution: { signal: controller.signal, beforeEffect: async () => { assertCurrent(); }, assert_authority_current: assertCurrent } });
      assert.ok(result && result.status >= 400, "the original caller is refused");
      assert.deepEqual(privateStorage.snapshotInstallationData(install), before, "no caller draft or last-start receipt was saved");
      assert.equal(sessions.get(DEMO_PROJECT_ID, "s").state, "idle", "the refused caller did not save a running state");
    } else {
      const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/s/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      assert.equal(result.status, 200, await result.text());
    }
    if (stop) {
      for (let i=0; i<100 && !releaseWait; i++) await new Promise(resolve=>setTimeout(resolve,10));
      assert.ok(releaseWait);assert.ok(waitSignal);
      const state = sessions.get(DEMO_PROJECT_ID, "s").state, install = platform.supervisor.state("io.molis.work.coding")!.install_id!;
      platform.supervisor.revoke("io.molis.work.coding");await platform.runtime.stop(install);
      assert.equal(waitSignal.aborted, true, "pending wait is cancelled by plugin stop");
      releaseWait();await new Promise(resolve=>setTimeout(resolve,80));
      assert.equal(sessions.get(DEMO_PROJECT_ID, "s").state,state,"late answer cannot write stopped session state");
      assert.equal(platform.events.log(DEMO_PROJECT_ID).filter(event=>event.event_type_id==="io.molis.work.coding.run-updated").length,0);
      assert.equal(platform.viewRevision("io.molis.work.files"),beforeFiles);
      return;
    }
    const deadline = Date.now() + 10_000;
    while (sessions.get(DEMO_PROJECT_ID, "s").state !== "done") {
      if (Date.now() > deadline) throw new Error(`still ${sessions.get(DEMO_PROJECT_ID, "s").state} after ${waits} waits`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.deepEqual(seenStates, [interruptedReceipt ? "idle" : "running", "running", "waiting-approval"], "the recorded state followed the run through review to done");
    const settled = waits;
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(waits, settled, "a settled round is no longer followed");
    await platform.events.drain();
    assert.notEqual(platform.viewRevision("io.molis.work.files"), beforeFiles);
    assert.notEqual(platform.viewRevision("io.molis.work.git"), beforeGit);
    const events = platform.events.log(DEMO_PROJECT_ID).filter(event => event.event_type_id === "io.molis.work.coding.run-updated");
    assert.equal(events.length, 1);
    assert.deepEqual(events[0]!.payload, { workspace_id: "work", session_id: "sdk", run_id: "r1", phase: "completed" });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseCodingSurface(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
