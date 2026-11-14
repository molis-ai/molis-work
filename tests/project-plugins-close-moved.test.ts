import assert from "node:assert/strict";
import { mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  DEMO_PROJECT_ID, LocalProjectDatabase, ensureProjectPlugins, openProjectVersionStores, releaseProjectPlugins, seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

// 1032: a project deleted (MCP, the demo rebuild) has its library file removed before its open runtime closes. The plugin's own
// stop record then writes to a moved file and SQLite answers SQLITE_READONLY_DBMOVED (1032); that must be a stopped runtime, not a
// cleanup failure. This is the direct version of the path exercised through the deletion service and the MCP delete test.
test("1032 a project library moved under an open runtime closes without a stop failure", async () => {
  const home = mkdtempSync(join(tmpdir(), "project-plugins-moved-"));
  const database = join(home, "project.db");
  seedDemoBoard(database);
  const store = new LocalProjectDatabase(database);
  try {
    const ports = { store, ...openProjectVersionStores(store), projectId: DEMO_PROJECT_ID, actorId: "web-user",
      actions: pluginActions(store, DEMO_PROJECT_ID), escapeHtml: String, translate: (value: string) => value, installedByHand: new Set() };
    const { platform } = await ensureProjectPlugins(ports);
    assert.ok(platform);
    renameSync(database, `${database}.moved`);
    await releaseProjectPlugins(store, DEMO_PROJECT_ID);
  } finally {
    store.close();
    rmSync(home, { recursive: true, force: true });
  }
});
