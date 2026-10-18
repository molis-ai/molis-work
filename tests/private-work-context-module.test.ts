import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import * as privateContext from "@molis-ai/molis-work-module-private-work-context";

test("Private Work Context public entrypoint preserves private Session facts across restart", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-private-work-context-"));
  const home = path.join(directory, ".molis-work");
  let registry = await openWorkSessionRegistry({ homeDirectory: home });
  try {
    const session = registry.createSession({
      runtime_id: "codex",
      actor_id: "user",
      user_confirmed: true,
      surface_id: "surface-private-owner",
      project_id: "project-private-owner",
      current_goal_id: "goal-private-owner",
      workspace_path: directory,
      title: "Private owner",
      metadata: { adapter_hint: "kept-local" },
    });
    const event = registry.appendEvent({
      session_id: session.session_id,
      source: "molis_work",
      kind: "status",
      source_id: "private-owner-event",
      content: "local-only-content",
      metadata: { phase: "ready", access_token: "must-not-persist" },
    });
    assert.equal(event.metadata.phase, "ready");
    assert.equal(event.metadata.access_token, undefined);
    const draft = registry.createHandoffDraft({
      source_session_id: session.session_id,
      source_project_id: "project-private-owner",
      source_goal_id: "goal-private-owner",
      target_runtime_id: "codex",
      target_project_id: "project-private-owner",
      content: "handoff-context",
      actor_id: "user",
    });
    assert.equal(registry.cancelHandoff(draft.package_id).state, "cancelled");
    registry.setStatus({
      session_id: session.session_id,
      actor_id: "user",
      user_confirmed: true,
      status: "closed",
    });
    registry.close();

    registry = await openWorkSessionRegistry({ homeDirectory: home });
    assert.equal(registry.get(session.session_id).status, "closed");
    assert.equal(registry.get(session.session_id).metadata.adapter_hint, "kept-local");
    assert.equal(registry.events(session.session_id)[0]?.content, "local-only-content");
    assert.equal(registry.getHandoff(draft.package_id).state, "cancelled");
    assert.equal(registry.goalHistory(session.session_id)[0]?.goal_id, "goal-private-owner");
  } finally {
    registry.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("W5-08-CTX-01/02 Runtime binding services keep confirmation, setup replay and project cleanup", async () => {
  assert.equal("RuntimeContextBindingRepository" in privateContext, false);
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-runtime-context-owner-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: directory });
  const context = { runtime_id: "codex", stable_work_context_id: "thread-context-owner", host_declares_stable: true };
  try {
    const input = { context, display_name: "Context owner", actor_id: "user", user_confirmed: true, idempotency_key: "setup-context-owner" };
    await assert.rejects(catalog.createProjectAndBindRuntimeContext({ ...input, user_confirmed: false }),
      (error: unknown) => error instanceof ActionError && error.code === "work.context.user_confirmation_required");
    assert.deepEqual(catalog.listProjects(), []);
    assert.deepEqual(catalog.listRuntimeContextBindings(), []);
    assert.deepEqual(catalog.listRuntimeContextBindingEvents(), []);

    const created = await catalog.createProjectAndBindRuntimeContext(input);
    assert.equal(created.status, "bound");
    assert.ok(created.project);
    const bindings = catalog.listRuntimeContextBindings(), events = catalog.listRuntimeContextBindingEvents(context);
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].project_id, created.project.project_id);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "context.bound");
    const replay = await catalog.createProjectAndBindRuntimeContext(input);
    assert.equal(replay.project?.project_id, created.project.project_id);
    assert.deepEqual(catalog.listRuntimeContextBindings(), bindings);
    assert.deepEqual(catalog.listRuntimeContextBindingEvents(context), events);
    assert.equal(catalog.listProjects().length, 1);

    const deletion = await catalog.deleteProject({ project_id: created.project.project_id,
      actor_id: "user", delete_confirmed: true, idempotency_key: "delete-context-owner" });
    assert.equal(deletion.deletion.deleted_binding_count, 1);
    assert.deepEqual(catalog.listRuntimeContextBindings(), []);
    assert.equal(catalog.resolveRuntimeContext(context).status, "unbound");
  } finally {
    catalog.close();
    await rm(directory, { recursive: true, force: true });
  }
});
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
