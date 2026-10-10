import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import {
  LocalProjectDatabase, createLocalFeedApplication, createLocalFeedSourceService, createMolisWorkLocalHost, molisWorkHostProjectReference, snapshotBoardCapability,
} from "@molis-ai/molis-work-app-local-host";
import { feedItemActions } from "@molis-ai/molis-work-plugin-feed";
import { MolisWorkV1Error } from "@molis-ai/molis-work-plugin-goals";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import { createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";
import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";

const PROMOTE = "molis_work_v1_action_feed.items.promote__v1";
const CLIENT = "runtime:codex";

/** A project with one Feed item, every Goals action granted to the client, and the promotion granted besides. */
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-promote-mcp-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const host = createMolisWorkLocalHost();
  const project = await catalog.createProject({ display_name: "升格", actor_id: "user" });
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const seed = new LocalProjectDatabase(project.database_path);
  const source = createLocalFeedSourceService(seed.db, project.project_id).register({ kind: "web_query", query: "Review external input" }).source;
  const item = createLocalFeedApplication(seed.db).ingestItem({ source, externalId: "mcp-promotion", title: "MCP promotion", summary: "s", body: "b",
    priority: "high", occurredAt: "2026-09-08T00:00:00.000Z", attention: false }).item;
  seed.close();
  await grantGoalsMcp(host, homeDirectory, project);
  const views = await host.inspectActions({ actor_id: CLIENT, project_id: project.project_id, audience: "mcp", permissions: [] }, reference);
  await writeMcpActionGrant(homeDirectory, createMcpActionGrant(CLIENT, project.project_id,
    views.find(view => view.capability_id === feedItemActions.promote.capability_id)!, true));
  const server = (nativeRuntimeSessionId?: string) => new MolisWorkServer("runtime", { databasePath: project.database_path, projectId: project.project_id, webBaseUrl: "http://127.0.0.1:4173" },
    { homeDirectory, ...(nativeRuntimeSessionId ? { nativeRuntimeSessionId } : {}),
      runtimeContext: { runtime_id: "codex", stable_work_context_id: null, host_declares_stable: false } }, host);
  const written = async () => ({
    goals: (await host.client(reference).invoke(snapshotBoardCapability, { project_id: project.project_id })).goals.length,
    ...(await host.withProject(reference, runtime => {
      const row = createLocalFeedApplication(runtime.store.db).getItem(project.project_id, item.item_id);
      return { receipts: runtime.coordinator.goalInputs.list(project.project_id).length, item: { linked_goal_id: row.linked_goal_id, revision: row.revision, disposition: row.disposition } };
    })),
  });
  return { item, reference, host, server, written,
    done: async () => { await host.close(); catalog.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test("a Runtime without a stable Session cannot write Goals' session-authored records through the promotion", async () => {
  const f = await fixture();
  const before = await f.written();
  const mcp = f.server();
  try {
    await assert.rejects(mcp.callTool(PROMOTE, { item_id: f.item.item_id, expected_revision: f.item.revision }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "mcp.runtime_identity_missing" && /稳定 Session/.test(error.message));
    assert.deepEqual(await f.written(), before, "no Goal, no input receipt, and the item is untouched");
  } finally { await mcp.close(); await f.done(); }
});

test("with a stable Session the promotion runs and the Goal and its input are the Session's", async () => {
  const f = await fixture();
  const mcp = f.server("native-session");
  try {
    const promoted = JSON.parse(await mcp.callTool(PROMOTE, { item_id: f.item.item_id, expected_revision: f.item.revision })) as { goal_id: string; created: boolean };
    assert.equal(promoted.created, true);
    const state = JSON.parse(await mcp.callTool("molis_work_v1_action_goals.state.read__v1", { goal_id: promoted.goal_id })) as { intent: { source_kind: string } };
    assert.equal(state.intent.source_kind, "runtime");
    const receipts = await f.host.withProject(f.reference, runtime => runtime.coordinator.goalInputs.list(runtime.project_id).filter(receipt => receipt.goal_id === promoted.goal_id));
    assert.deepEqual(receipts.map(receipt => receipt.created_by), [`${CLIENT}:native-session`]);
    assert.equal((await f.written()).item.linked_goal_id, promoted.goal_id);
  } finally { await mcp.close(); await f.done(); }
});
