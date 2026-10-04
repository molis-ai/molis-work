import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";

// A Session's Project, Goal and workspace are Ledger edges; changing them writes several edges, all or none.
test("Session association changes roll back all edges if one Ledger write fails", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-associations-"));
  const homeDirectory = path.join(directory, "home");
  try {
    const created = await openWorkSessionRegistry({ homeDirectory });
    const sessionId = created.createSession({ runtime_id: "codex", actor_id: "user", user_confirmed: true }).session_id;
    created.close();
    let fail = false;
    const registry = await MolisWorkSessionRegistry.open({ homeDirectory, createLedger: (db) => {
      const ledger = createContextLedger(db, { authorize: () => true });
      return { query: ledger.query, commands: { ...ledger.commands, put: (access, input) => {
        if (fail && input.type === "work.project") throw new Error("project edge failure");
        return ledger.commands.put(access, input);
      } } };
    } });
    try {
      registry.updateAssociations({ session_id: sessionId, actor_id: "user", user_confirmed: true,
        project_id: "project-now", current_goal_id: "same-goal", workspace_id: "workspace-now", workspace_path: "/tmp/workspace-now" });
      const before = registry.get(sessionId);
      const history = registry.goalHistory(sessionId);
      assert.equal(before.project_id, "project-now");
      fail = true;
      assert.throws(() => registry.updateAssociations({ session_id: sessionId, actor_id: "user", user_confirmed: true,
        project_id: "project-next", current_goal_id: "next-goal", workspace_id: "next-workspace", workspace_path: "/tmp/next-workspace" }), /project edge failure/);
      assert.deepEqual(registry.get(sessionId), before);
      assert.deepEqual(registry.goalHistory(sessionId), history);
    } finally { registry.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

// Only the current Session Registry schema is read: an older registry is refused, never rewritten in place.
test("an older Session Registry is refused rather than upgraded in place", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-version-"));
  const homeDirectory = path.join(directory, "home");
  try {
    const created = await openWorkSessionRegistry({ homeDirectory });
    const databasePath = created.databasePath;
    created.close();
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(databasePath);
    db.prepare("UPDATE session_meta SET value = '5' WHERE key = 'schema_version'").run();
    db.close();
    await assert.rejects(openWorkSessionRegistry({ homeDirectory }), /schema=5/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
