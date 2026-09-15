import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findSessionForHostSignals } from "@molis-ai/molis-work-module-private-work-context";
import type { RuntimeSessionHostSignals } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";
import { MolisWorkSessionError } from "@molis-ai/molis-work-module-private-work-context";

async function withRegistry(
  run: (registry: MolisWorkSessionRegistry, home: string) => Promise<void> | void,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-registry-"));
  const home = path.join(directory, ".molis-work");
  const registry = await openWorkSessionRegistry({ homeDirectory: home });
  try {
    await run(registry, home);
  } finally {
    registry.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test("Session Registry keeps Molis Work, Runtime, surface and workspace identities separate", async () => {
  await withRegistry((registry) => {
    assert.throws(
      () => registry.createSession({ runtime_id: "codex", actor_id: "user", user_confirmed: false }),
      (error: unknown) =>
        error instanceof MolisWorkSessionError && error.code === "session.confirmation_required",
    );

    const first = registry.createSession({
      runtime_id: "codex",
      actor_id: "user",
      user_confirmed: true,
      surface_id: "panel-a",
      project_id: "project-a",
      current_goal_id: "goal-a",
      workspace_id: "workspace-shared",
      workspace_path: "/tmp/shared",
    });
    const second = registry.createSession({
      runtime_id: "codex",
      actor_id: "user",
      user_confirmed: true,
      surface_id: "panel-b",
      project_id: "project-b",
      current_goal_id: "goal-b",
      workspace_id: "workspace-shared",
      workspace_path: "/tmp/shared",
    });

    assert.notEqual(first.session_id, second.session_id);
    assert.notEqual(first.correlation_token, second.correlation_token);
    assert.equal(registry.list({ workspace_id: "workspace-shared" }).length, 2);
    assert.deepEqual(registry.list({ project_id: "project-a" }).map((item) => item.session_id), [first.session_id]);
    assert.deepEqual(registry.list({ project_id: "project-b" }).map((item) => item.session_id), [second.session_id]);

    const codex = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "same-native-text",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
    });
    const claude = registry.explicitlyLinkSession({
      runtime_id: "claude-code",
      native_runtime_session_id: "same-native-text",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
    });
    assert.notEqual(codex.session_id, claude.session_id);
  });
});

test("late native identity requires matching correlation or surface and preserves Goal history", async () => {
  await withRegistry((registry) => {
    const created = registry.createSession({
      runtime_id: "codex",
      actor_id: "user",
      user_confirmed: true,
      surface_id: "panel-late",
      project_id: "project-a",
      current_goal_id: "goal-first",
    });
    assert.ok(created.correlation_token);

    assert.throws(
      () => registry.linkNativeRuntimeSession({
        session_id: created.session_id,
        runtime_id: "codex",
        native_runtime_session_id: "thread-late",
        actor_id: "runtime",
        correlation_token: "wrong-token",
      }),
      (error: unknown) =>
        error instanceof MolisWorkSessionError && error.code === "session.correlation_invalid",
    );

    const linked = registry.linkNativeRuntimeSession({
      session_id: created.session_id,
      runtime_id: "codex",
      native_runtime_session_id: "thread-late",
      actor_id: "runtime",
      surface_id: "panel-late",
    });
    assert.equal(linked.native_runtime_session_id, "thread-late");
    assert.equal(linked.correlation_token, null);

    const moved = registry.updateAssociations({
      session_id: linked.session_id,
      actor_id: "user",
      user_confirmed: true,
      current_goal_id: "goal-second",
    });
    assert.equal(moved.current_goal_id, "goal-second");
    assert.deepEqual(
      registry.goalHistory(linked.session_id).map((item) => [item.goal_id, item.relation]),
      [["goal-second", "current"], ["goal-first", "history"]],
    );
  });
});

test("Runtime discovery syncs metadata without creating project, Goal or workspace relations", async () => {
  await withRegistry((registry) => {
    const discovered = registry.discoverSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-discovered",
      title: "Discovered thread",
      metadata: { archived: false },
    });
    assert.equal(discovered.provenance, "runtime_discovered");
    assert.equal(discovered.project_id, null);
    assert.equal(discovered.current_goal_id, null);
    assert.equal(discovered.workspace_id, null);

    assert.throws(
      () => registry.explicitlyLinkSession({
        runtime_id: "codex",
        native_runtime_session_id: "thread-discovered",
        actor_id: "user",
        user_confirmed: false,
        project_id: "project-a",
      }),
      (error: unknown) =>
        error instanceof MolisWorkSessionError && error.code === "session.confirmation_required",
    );
    const linked = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-discovered",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
      current_goal_id: "goal-a",
      workspace_id: "workspace-a",
      workspace_path: "/tmp/a",
    });
    assert.equal(linked.session_id, discovered.session_id);
    assert.equal(linked.project_id, "project-a");
  });
});

test("stale Molis Work or surface IDs cannot override a conflicting native Runtime Session", async () => {
  await withRegistry((registry) => {
    const stale = registry.createSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-stale",
      actor_id: "user",
      user_confirmed: true,
      surface_id: "panel-stale",
      project_id: "project-stale",
    });
    const active = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-active",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-active",
    });
    const signals: RuntimeSessionHostSignals = {
      runtime_id: "codex",
      molis_work_session_id: stale.session_id,
      native_runtime_session_id: active.native_runtime_session_id,
      legacy_work_context_id: null,
      surface_id: stale.surface_id,
      goal_id: null,
      runtime_context: {
        runtime_id: "codex",
        stable_work_context_id: active.native_runtime_session_id,
        host_declares_stable: true,
      },
      project_suggestion_clues: [],
    };

    assert.equal(findSessionForHostSignals(registry, signals)?.session_id, active.session_id);
    assert.equal(findSessionForHostSignals(registry, { ...signals, native_runtime_session_id: "thread-unknown" }), null);
  });
});
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
