import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createMcpGoalToolHandlers } from "@molis-ai/molis-work-app-mcp";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

test("remaining Goal wire handlers keep Board conversion and persist current guidance/planning facts", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goal-wire-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  try {
    const coordinator = new GoalProjectApplication(store);
    for (const boardId of ["selected", "nested"]) {
      coordinator.initializeBoard({ board_id: boardId, title: boardId, actor_id: "user", idempotency_key: `init-${boardId}` });
    }
    const runtime = createMcpGoalToolHandlers(coordinator.goals, "runtime");
    const nestedBefore = coordinator.goalQueries.readProjectGuidance("nested");
    const added = await runtime.molis_work_v1_project_guidance_add({
      board_id: "selected",
      actor_id: "user",
      kind: "constraint",
      content: "入口不改写领域语义。",
      source_refs: [],
      reason: "验证命令转换",
      confirmation_summary: "用户确认写入这条约束",
      user_confirmed: true,
      idempotency_key: "guidance",
    });
    assert.equal(added.entry.board_id, "selected");
    assert.equal(added.entry.content, "入口不改写领域语义。");
    assert.equal(added.entry.created_by, "user");
    assert.equal(added.entry.kind, "constraint");
    const persisted = coordinator.goalQueries.readProjectGuidance("selected");
    const saved = persisted.entries.find((entry) => entry.guidance_id === added.entry.guidance_id);
    assert.equal(saved?.content, "入口不改写领域语义。");
    assert.equal(saved?.board_id, "selected");
    assert.equal(saved?.created_by, "user");
    const graph = await runtime.molis_work_v1_planning_graph_check({ board_id: "selected" });
    assert.deepEqual(graph.issues, []);
    assert.ok(Number.isInteger(graph.observed_event_cursor) && graph.observed_event_cursor >= 1);
    assert.deepEqual(coordinator.goalQueries.readProjectGuidance("nested"), nestedBefore);
    assert.equal(nestedBefore.entries.length, 0);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
