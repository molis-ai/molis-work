import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";
import { MolisWorkSessionError } from "@molis-ai/molis-work-module-private-work-context";

test("Session project actions are confirmed, atomic, isolated and keep Goal history", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-actions-"));
  const registry = await openWorkSessionRegistry({
    homeDirectory: path.join(directory, ".molis-work"),
    now: () => new Date("2026-08-31T08:00:00.000Z"),
  });
  try {
    const target = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-actions-target",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
      current_goal_id: "goal-a",
      workspace_id: "workspace-shared",
      workspace_path: "/tmp/shared",
      title: "Target",
    });
    const neighbor = registry.createSession({
      runtime_id: "claude-code",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
      current_goal_id: "goal-neighbor",
      workspace_id: "workspace-shared",
      workspace_path: "/tmp/shared",
      title: "Neighbor",
    });

    assert.throws(
      () => registry.updateAssociations({
        session_id: target.session_id,
        actor_id: "user",
        user_confirmed: false,
        project_id: "project-b",
      }),
      (error: unknown) => error instanceof MolisWorkSessionError
        && error.code === "session.confirmation_required",
    );

    const switched = registry.updateAssociations({
      session_id: target.session_id,
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-b",
      current_goal_id: "goal-b",
      workspace_id: null,
      workspace_path: "/tmp/other",
    });
    assert.equal(switched.project_id, "project-b");
    assert.equal(switched.current_goal_id, "goal-b");
    assert.equal(switched.workspace_id, null);
    assert.equal(switched.workspace_path, "/tmp/other");
    assert.deepEqual(
      registry.goalHistory(target.session_id).map((item) => [item.goal_id, item.relation]),
      [["goal-b", "current"], ["goal-a", "history"]],
    );

    const removed = registry.updateAssociations({
      session_id: target.session_id,
      actor_id: "user",
      user_confirmed: true,
      project_id: null,
      current_goal_id: null,
      workspace_id: null,
      workspace_path: null,
    });
    assert.equal(removed.project_id, null);
    assert.equal(removed.current_goal_id, null);
    assert.equal(removed.workspace_path, null);
    assert.deepEqual(
      registry.goalHistory(target.session_id).map((item) => [item.goal_id, item.relation]).sort(),
      [["goal-a", "history"], ["goal-b", "history"]],
    );

    const archived = registry.setStatus({
      session_id: target.session_id,
      actor_id: "user",
      user_confirmed: true,
      status: "closed",
    });
    assert.equal(archived.status, "closed");
    const restored = registry.setStatus({
      session_id: target.session_id,
      actor_id: "user",
      user_confirmed: true,
      status: "active",
    });
    assert.equal(restored.status, "active");

    assert.deepEqual(registry.get(neighbor.session_id), neighbor);
    assert.equal(registry.list({ workspace_id: "workspace-shared" }).length, 1);
  } finally {
    registry.close();
    await rm(directory, { recursive: true, force: true });
  }
});
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
