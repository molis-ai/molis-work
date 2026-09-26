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
import { projectSettingsCapabilities, projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { handleCodingPluginHttp } from "../apps/local-host/src/coding-surface.js";

test("however many pages poll the Coding directory at once, one read runs and at most one waits; a request mid-read gets the next read", { timeout: 30_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-state-coalesce-")), dbPath = join(root, "board.db");
  seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const sessions = new CodingSessionStore(store.db);
  for (const id of ["a", "b", "c"]) {
    sessions.create({ board_id: DEMO_BOARD_ID, session_id: id, title: `会话 ${id}`, runtime_id: "prologue", at: new Date().toISOString() });
    sessions.setRuntimeSession(DEMO_BOARD_ID, id, `sdk-${id}`, new Date().toISOString());
  }
  let reads = 0, inFlight = 0, most = 0;
  const host = () => ({ store, boardId: DEMO_BOARD_ID, actions: pluginActions(store, DEMO_BOARD_ID), actorId: "web-user", goalTitle: () => undefined,
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    execution: { ready: async () => {}, models: async () => [{ provider_id: "p", model_id: "m", label: "fixture" }] },
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, _args: Input): Promise<Output> {
      if (definition.capability_id === agent.listRuntimes.capability_id) {
        reads++; inFlight++; most = Math.max(most, inFlight);
        // Each directory read is slow, as it is with many sessions behind one project queue.
        await new Promise(resolve => setTimeout(resolve, 150));
        inFlight--;
        return [{ runtime_id: "prologue", capabilities: { mcp: "unsupported" } }] as Output;
      }
      if (definition.capability_id === agent.readSession.capability_id) return { runs: [], latest_run: null } as Output;
      if (definition.capability_id === agent.listSkills.capability_id) return [] as Output;
      if (definition.capability_id === projectSettingsCapabilities.browsingWorkspace.capability_id) return null as Output;
      if (definition.capability_id === projectsCapabilities.readWorkspace.capability_id) return null as Output;
      if (definition.capability_id === projectSettingsCapabilities.workspaces.capability_id) return [] as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return [{ role_id: "builder", available: true }] as Output;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => { void handleCodingPluginHttp(request, response, new URL(request.url!, "http://localhost"), host()).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const state = async () => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/state`);
    return { status: result.status, body: await result.json() };
  };
  try {
    const first = await state();
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.sessions.length, 3);
    reads = 0;
    // Ten pages ask at once: the first read runs, every later request shares the single read queued behind it.
    const answers = await Promise.all(Array.from({ length: 10 }, () => state()));
    assert.ok(answers.every(answer => answer.status === 200 && answer.body.sessions.length === 3), JSON.stringify(answers.map(answer => answer.status)));
    assert.equal(reads, 2, "one read plus one queued read serve all ten requests");
    assert.equal(most, 1, "never two directory reads at the same time");
    // A request after the others have been answered starts a fresh read.
    await state();
    assert.equal(reads, 3);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
