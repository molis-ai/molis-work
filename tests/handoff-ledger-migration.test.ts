import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";

const access = { actor_id: "test-reader", scope: { kind: "personal", id: "private-work-context" } as const };

async function fixture(legacy = true) {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-handoff-ledger-"));
  const homeDirectory = join(directory, "home");
  const registry = await openWorkSessionRegistry({ homeDirectory });
  const source = registry.createSession({ runtime_id: "source", actor_id: "original-user", user_confirmed: true,
    project_id: "project-original", current_goal_id: "goal-original" });
  const draftInput = { source_session_id: source.session_id, source_project_id: "project-original",
    source_goal_id: "goal-original", source_goal_version: 7, target_runtime_id: "destination",
    target_project_id: "project-original", target_workspace_id: "workspace-original", target_workspace_path: directory,
    content: "Private Handoff body must not enter Ledger", actor_id: "original-user" };
  const records = [];
  for (const state of ["draft", "failed", "sent", "cancelled"] as const) {
    const draft = registry.createHandoffDraft(draftInput);
    if (state === "cancelled") registry.cancelHandoff(draft.package_id);
    if (state === "failed" || state === "sent") registry.markHandoffSending(draft.package_id);
    if (state === "failed") registry.markHandoffFailed({ package_id: draft.package_id, error_code: "test.failure",
      error_message: "Keep the original failure", retryable: true });
    if (state === "sent") {
      const destination = registry.createSession({ runtime_id: "destination", actor_id: "original-user", user_confirmed: true,
        project_id: "project-original", current_goal_id: "goal-original" });
      registry.attachHandoffDestination({ package_id: draft.package_id, destination_session_id: destination.session_id, delivery_mode: "native" });
      registry.markHandoffSent({ package_id: draft.package_id, destination_session_id: destination.session_id, delivery_mode: "native" });
    }
    records.push(registry.getHandoff(draft.package_id));
  }
  registry.updateAssociations({ session_id: source.session_id, project_id: "project-later", current_goal_id: "goal-later",
    actor_id: "moving-user", user_confirmed: true });
  const databasePath = registry.databasePath;
  registry.close();
  if (legacy) {
    const db = new Database(databasePath);
    try {
      db.prepare("DELETE FROM context_edges WHERE relation_type LIKE 'handoff.%'").run();
      db.prepare(`UPDATE session_handoffs SET source_project_id = 'project-original', source_goal_id = 'goal-original',
        target_project_id = 'project-original', target_workspace_id = 'workspace-original'`).run();
      db.prepare("UPDATE session_meta SET value = '4' WHERE key = 'schema_version'").run();
    } finally { db.close(); }
  }
  return { directory, homeDirectory, databasePath, source, records, draftInput };
}

test("v4 Handoff migration preserves every state and encrypted content without guessing from the source Session", async () => {
  const data = await fixture();
  try {
    for (let open = 0; open < 2; open++) {
      const registry = await openWorkSessionRegistry({ homeDirectory: data.homeDirectory });
      try {
        assert.equal(registry.get(data.source.session_id).project_id, "project-later");
        for (const original of data.records) assert.deepEqual(registry.getHandoff(original.package_id), original);
      } finally { registry.close(); }
    }
    const db = new Database(data.databasePath);
    try {
      assert.equal((db.prepare("SELECT value FROM session_meta WHERE key = 'schema_version'").get() as { value: string }).value, "5");
      for (const row of db.prepare("SELECT source_project_id, source_goal_id, target_project_id, target_workspace_id FROM session_handoffs").all()) {
        assert.deepEqual(row, { source_project_id: "", source_goal_id: "", target_project_id: "", target_workspace_id: null });
      }
      const ledger = createContextLedger(db, { authorize: () => true });
      for (const original of data.records) {
        const history = ledger.query.history(access, `handoff.goal:${original.package_id}`);
        assert.equal(history.length, 1);
        assert.deepEqual(history[0]?.target, { module: "goals", id: "goal-original", version: null,
          scope: access.scope, project_id: "project-original" });
        assert.equal(history[0]?.actor_id, "original-user");
        assert.equal(history[0]?.recorded_at, original.created_at);
      }
      assert.doesNotMatch(JSON.stringify(db.prepare("SELECT * FROM context_edges").all()), /Private Handoff body/);
    } finally { db.close(); }
  } finally { await rm(data.directory, { recursive: true, force: true }); }
});

test("Handoff migration failure leaves all legacy endpoints and version intact for a successful retry", async () => {
  const data = await fixture();
  try {
    await assert.rejects(MolisWorkSessionRegistry.open({ homeDirectory: data.homeDirectory, createLedger: (db) => {
      const ledger = createContextLedger(db, { authorize: () => true });
      let writes = 0;
      return { query: ledger.query, commands: { ...ledger.commands, put: (who, input) => {
        const result = ledger.commands.put(who, input);
        if (++writes === 5) throw new Error("migration write failed");
        return result;
      } } };
    } }), /migration write failed/);
    const db = new Database(data.databasePath);
    try {
      assert.deepEqual(db.prepare("SELECT value FROM session_meta WHERE key = 'schema_version'").get(), { value: "4" });
      for (const row of db.prepare("SELECT source_goal_id, target_workspace_id FROM session_handoffs").all()) {
        assert.deepEqual(row, { source_goal_id: "goal-original", target_workspace_id: "workspace-original" });
      }
      assert.deepEqual(db.prepare("SELECT * FROM context_edges WHERE relation_type LIKE 'handoff.%'").all(), []);
    } finally { db.close(); }
    const registry = await openWorkSessionRegistry({ homeDirectory: data.homeDirectory });
    try { for (const record of data.records) assert.deepEqual(registry.getHandoff(record.package_id), record); }
    finally { registry.close(); }
  } finally { await rm(data.directory, { recursive: true, force: true }); }
});

test("new Handoff pins the supplied Goal version; target edits, removals and failures stay atomic", async () => {
  const data = await fixture(false);
  let fail = false;
  const registry = await MolisWorkSessionRegistry.open({ homeDirectory: data.homeDirectory, createLedger: (db) => {
    const ledger = createContextLedger(db, { authorize: () => true });
    return { query: ledger.query, commands: { ...ledger.commands, put: (who, input) => {
      const result = ledger.commands.put(who, input);
      if (fail && input.type === "handoff.workspace") throw new Error("target write failed");
      return result;
    } } };
  } });
  try {
    const original = data.records[0]!;
    const edit = { package_id: original.package_id, target_project_id: "project-original", target_runtime_id: "destination",
      target_workspace_id: "workspace-edited", target_workspace_path: data.directory, content: "Edited private draft", actor_id: "editor" };
    fail = true;
    assert.throws(() => registry.updateHandoffDraft(edit), /target write failed/);
    assert.deepEqual(registry.getHandoff(original.package_id), original);
    registry.updateAssociations({ session_id: data.source.session_id, project_id: "project-original", current_goal_id: "goal-original",
      actor_id: "user", user_confirmed: true });
    assert.throws(() => registry.createHandoffDraft(data.draftInput), /target write failed/);
    assert.equal(registry.handoffsForSession(data.source.session_id).length, 4);
    fail = false;
    assert.equal(registry.updateHandoffDraft(edit).content, "Edited private draft");
    registry.updateHandoffDraft(edit);
    const db = new Database(data.databasePath);
    try {
      const ledger = createContextLedger(db, { authorize: () => true });
      const key = `handoff.goal:${original.package_id}`;
      assert.equal(ledger.query.get(access, key)?.target.version, 7);
      assert.equal(ledger.query.history(access, key).length, 1);
      assert.equal(ledger.query.history(access, `handoff.workspace:${original.package_id}`).length, 2);
      assert.equal(ledger.query.list(access, { type: "handoff.goal" }).length, 4, "failed create leaves no orphan relation");
    } finally { db.close(); }
    assert.equal(registry.updateHandoffDraft({ ...edit, target_workspace_id: null }).target_workspace_id, null);
    assert.equal(registry.cancelHandoff(original.package_id).state, "cancelled");
  } finally {
    registry.close();
    await rm(data.directory, { recursive: true, force: true });
  }
});
