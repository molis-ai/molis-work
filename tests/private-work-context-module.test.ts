import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import {
  MolisWorkSessionRegistry,
  RuntimeContextBindingRepository,
  createRuntimeContextBindingTables,
  createRuntimeContextSetupRequestTable,
  createRuntimeContextSuggestionRejectionTable,
} from "@molis-ai/molis-work-module-private-work-context";

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

test("Runtime context binding facts are stored by the Private Work Context repository", () => {
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    db.exec("CREATE TABLE projects (project_id TEXT PRIMARY KEY)");
    db.prepare("INSERT INTO projects (project_id) VALUES (?)").run("project-context-owner");
    createRuntimeContextBindingTables(db);
    createRuntimeContextSetupRequestTable(db);
    createRuntimeContextSuggestionRejectionTable(db);
    const repository = new RuntimeContextBindingRepository(db, {
      ledger: createContextLedger(db, { authorize: () => true }),
      assertProject: (id) => { assert.equal(id, "project-context-owner"); },
    });
    const binding = {
      binding_id: "binding-context-owner",
      runtime_id: "codex",
      stable_work_context_id: "thread-context-owner",
      project_id: "project-context-owner",
      bound_by: "user",
      created_at: "2026-09-02T00:00:00.000Z",
      updated_at: "2026-09-02T00:00:00.000Z",
    };
    repository.insert(binding);
    repository.appendEvent({
      binding,
      type: "context.bound",
      previous_project_id: null,
      actor_id: "user",
      created_at: binding.created_at,
    });
    repository.insertSetupRequest({
      runtime_id: binding.runtime_id,
      persistence_id: binding.stable_work_context_id,
      idempotency_key: "setup-context-owner",
      request_fingerprint: "fingerprint",
      project_id: binding.project_id,
      created_at: binding.created_at,
    });
    assert.equal(repository.find(binding.runtime_id, binding.stable_work_context_id)?.binding_id, binding.binding_id);
    assert.equal(repository.listEvents()[0]?.type, "context.bound");
    assert.equal(repository.findSetupRequest(
      binding.runtime_id,
      binding.stable_work_context_id,
      "setup-context-owner",
    )?.project_id, binding.project_id);
    assert.equal(repository.removeProjectFacts(binding.project_id, "user", binding.updated_at), 1);
    assert.equal(repository.list().length, 0);
  } finally {
    db.close();
  }
});
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
