import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_BOARD_ID, seedDemoBoard, releaseCodingSurface } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { handleCodingPluginHttp } from "../apps/local-host/src/coding-surface.js";

test("a round started from Coding is followed until it settles, so its recorded state is right with no page open", { timeout: 30_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-follow-")), dbPath = join(root, "board.db");
  seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const sessions = new CodingSessionStore(store.db);
  sessions.create({ board_id: DEMO_BOARD_ID, session_id: "s", title: "会话", runtime_id: "prologue", at: new Date().toISOString() });
  sessions.setRuntimeSession(DEMO_BOARD_ID, "s", "sdk", new Date().toISOString());
  const phases = ["running", "awaiting-review", "completed"];
  const seenStates: string[] = [];
  let waits = 0;
  const view = (phase: string) => ({ ref: { session_id: "sdk", run_id: "r1" }, phase, frozen: { role_id: "builder", text_materials: [] }, turns: [], activity: [], awaiting_input: [] });
  const host = () => ({ store, boardId: DEMO_BOARD_ID, actions: pluginActions(store, DEMO_BOARD_ID), actorId: "web-user", goalTitle: () => undefined,
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    execution: { ready: async () => {}, models: async () => [{ provider_id: "p", model_id: "m", label: "fixture" }] },
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      if (definition.capability_id === projectSettingsCapabilities.workspaces.capability_id) return [{ workspace_id: "work", canonical_path: root, realpath_verified: true }] as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return [{ role_id: "builder", available: true }] as Output;
      if (definition.capability_id === agent.readSession.capability_id) return { runs: [] } as Output;
      if (definition.capability_id === agent.startRun.capability_id) return { ref: { session_id: "sdk", run_id: "r1" }, frozen: {} } as Output;
      if (definition.capability_id === agent.waitRun.capability_id) {
        const [, run, since] = args as unknown as [unknown, { run_id: string }, string | null];
        assert.equal(run.run_id, "r1");
        assert.equal(since, waits ? `v${waits}` : null, "each wait continues from the version the last one returned");
        // Each wait answers with the next phase, as the Host does when the run's view changes.
        await new Promise(resolve => setTimeout(resolve, 20));
        seenStates.push(sessions.get(DEMO_BOARD_ID, "s").state);
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
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/s/runs`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ task: "改一个文件", intent: "execute", workspace_id: "work", provider_id: "p", model_id: "m" }) });
    assert.equal(result.status, 200, await result.text());
    const deadline = Date.now() + 10_000;
    while (sessions.get(DEMO_BOARD_ID, "s").state !== "done") {
      if (Date.now() > deadline) throw new Error(`still ${sessions.get(DEMO_BOARD_ID, "s").state} after ${waits} waits`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.deepEqual(seenStates, ["running", "running", "waiting-approval"], "the recorded state followed the run through review to done");
    const settled = waits;
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(waits, settled, "a settled round is no longer followed");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
