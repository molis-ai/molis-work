import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openWorkSessionRegistry, recordDesktopPanelSessions } from "@molis-ai/molis-work-app-local-host";

async function fixture(): Promise<{ directory: string; home: string; workspace: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-panel-sessions-"));
  const home = path.join(directory, ".molis-work");
  const workspace = path.join(directory, "repo");
  await mkdir(workspace, { recursive: true });
  return { directory, home, workspace };
}

test("panels and bindings write their Sessions when written; a panel's own binding shares the panel's Session", async () => {
  const data = await fixture();
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: data.home });
  try {
    const project = await catalog.createProject({ display_name: "会话项目", actor_id: "user" });
    const open = (goalId: string) => catalog.openDesktopPanel({ project_id: project.project_id, goal_id: goalId, runtime_kind: "codex",
      launch_command: "codex", cwd: data.workspace, actor_id: "user", user_confirmed: true });
    const first = open("goal-a");
    const firstSession = (await recordDesktopPanelSessions(data.home, [first])).get(first.panel_id)!;
    const aliased = catalog.aliasDesktopPanelSession({ panel_id: first.panel_id, runtime_id: "codex", host_session_id: "thread-a", actor_id: "panel" });
    await recordDesktopPanelSessions(data.home, [aliased]);
    const second = open("goal-b");
    await recordDesktopPanelSessions(data.home, [second]);
    const registry = await openWorkSessionRegistry({ homeDirectory: data.home });
    try {
      assert.equal(registry.list().length, 2, "each panel has one Session, written with the panel");
      const recorded = registry.findByNativeRuntimeSession("codex", "thread-a")!;
      assert.equal(recorded.session_id, firstSession, "taking a native identity keeps the panel's Session");
      assert.equal(recorded.surface_id, first.panel_id);
      assert.equal(recorded.provenance, "molis_work_created");
      assert.equal(recorded.current_goal_id, "goal-a");
      assert.equal(registry.list({ workspace_id: recorded.workspace_id ?? "" }).length, 2);

      // The panel's own binding is its work context: it shares the panel's Session.
      const shared = registry.recordBindingSession({ runtime_id: "codex", stable_work_context_id: first.work_context_id,
        project_id: project.project_id, bound_by: "runtime:codex" }, first.panel_id);
      assert.equal(shared.session_id, firstSession);
      // A Runtime bound from outside any panel gets its own Session by its stable id.
      const external = registry.recordBindingSession({ runtime_id: "claude-code", stable_work_context_id: "claude-external",
        project_id: project.project_id, bound_by: "user" });
      assert.equal(external.provenance, "explicitly_linked");
      assert.equal(external.native_runtime_session_id, "claude-external");
      assert.equal(external.project_id, project.project_id);
      assert.equal(registry.recordBindingSession({ runtime_id: "claude-code", stable_work_context_id: "claude-external",
        project_id: project.project_id, bound_by: "user" }).session_id, external.session_id, "binding again keeps the Session");
      assert.equal(registry.list().length, 3);
    } finally { registry.close(); }

    await recordDesktopPanelSessions(data.home, [first, second]);
    await recordDesktopPanelSessions(data.home, [catalog.markDesktopPanelExited(second.panel_id)]);
    const after = await openWorkSessionRegistry({ homeDirectory: data.home });
    try {
      assert.equal(after.list().length, 3, "writing a panel again records nothing new");
      assert.equal(after.findBySurface(second.panel_id)?.status, "closed", "an exited panel's Session is closed");
    } finally { after.close(); }
  } finally {
    catalog.close();
    await rm(data.directory, { recursive: true, force: true });
  }
});

test("a binding whose Runtime Session already belongs to another project is refused and writes nothing", async () => {
  const data = await fixture();
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: data.home });
  const registry = await openWorkSessionRegistry({ homeDirectory: data.home });
  try {
    const [one, two] = [await catalog.createProject({ display_name: "一", actor_id: "user" }), await catalog.createProject({ display_name: "二", actor_id: "user" })];
    const bound = registry.recordBindingSession({ runtime_id: "claude-code", stable_work_context_id: "claude-a", project_id: one.project_id, bound_by: "user" });
    assert.throws(() => registry.recordBindingSession({ runtime_id: "claude-code", stable_work_context_id: "claude-a", project_id: two.project_id, bound_by: "user" }),
      (error: unknown) => (error as { code?: string }).code === "session.identity_conflict");
    assert.deepEqual(registry.list().map((session) => [session.session_id, session.project_id]), [[bound.session_id, one.project_id]]);
  } finally {
    registry.close();
    catalog.close();
    await rm(data.directory, { recursive: true, force: true });
  }
});
