import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalProjectDatabase, DEMO_BOARD_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { codingBackgroundTasks } from "../apps/local-host/src/coding-background-tasks.js";

test("the background list shows Coding sessions under way or waiting in every project, and marks ones from before a restart", () => {
  const root = mkdtempSync(join(tmpdir(), "coding-background-"));
  try {
    const project = (name: string, sessions: Array<[string, string, string]>) => {
      const path = join(root, `${name}.db`); seedDemoBoard(path);
      const store = new LocalProjectDatabase(path), coding = new CodingSessionStore(store.db);
      for (const [id, state, at] of sessions) {
        coding.create({ board_id: DEMO_BOARD_ID, session_id: id, title: `${name} ${id}`, runtime_id: "prologue", at });
        coding.setState(DEMO_BOARD_ID, id, state as never, at);
      }
      store.close();
      return path;
    };
    const started = "2026-09-26T10:00:00.000Z";
    const alpha = project("alpha", [["a1", "running", "2026-09-26T11:00:00.000Z"], ["a2", "done", "2026-09-26T11:30:00.000Z"], ["a3", "waiting-approval", "2026-09-26T11:10:00.000Z"]]);
    const beta = project("beta", [["b1", "running", "2026-09-26T09:00:00.000Z"], ["b2", "reconcile-required", "2026-09-26T08:00:00.000Z"], ["b3", "idle", "2026-09-26T12:00:00.000Z"]]);
    // A project that never used Coding has no such table; a missing or unreadable file lists nothing.
    const plain = join(root, "plain.db"); seedDemoBoard(plain);
    const broken = join(root, "broken.db"); writeFileSync(broken, "not a database");
    const tasks = codingBackgroundTasks([
      { project_id: "p-alpha", display_name: "Alpha", database_path: alpha },
      { project_id: "p-beta", display_name: "Beta", database_path: beta },
      { project_id: "p-plain", display_name: "Plain", database_path: plain },
      { project_id: "p-broken", display_name: "Broken", database_path: broken },
      { project_id: "p-missing", display_name: "Missing", database_path: join(root, "missing.db") },
      { project_id: "p-none", display_name: "None" },
    ], started);
    assert.deepEqual(tasks.map(task => [task.project_name, task.session_id, task.state, task.before_restart]), [
      ["Alpha", "a3", "waiting-approval", false],
      ["Alpha", "a1", "running", false],
      // Recorded as running before this service started: no round survives a restart, so it is waiting to be checked.
      ["Beta", "b1", "running", true],
      ["Beta", "b2", "reconcile-required", false],
    ]);
    assert.equal(tasks[0]!.title, "alpha a3");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
