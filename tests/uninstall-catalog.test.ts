import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { MolisWorkWebServiceManager, RuntimeIntegrationService } from "@molis-ai/molis-work-app-local-host";
import { createDesktopUninstallService as createLocalUninstallService } from "@molis-ai/molis-work-app-desktop";

for (const owned of [true, false]) {
  test(`uninstall preview ${owned ? "classifies legacy user data without migrating it" : "refuses a catalog owned by another application"}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "molis-work-uninstall-catalog-"));
    try {
      const home = join(directory, ".molis-work");
      await mkdir(join(home, "projects"), { recursive: true });
      const databasePath = join(home, "projects", "catalog.db");
      const db = new Database(databasePath);
      try {
        db.exec(`
          CREATE TABLE catalog_meta (key TEXT PRIMARY KEY, value TEXT);
          CREATE TABLE projects (
            project_id TEXT PRIMARY KEY, display_name TEXT, board_id TEXT, database_path TEXT,
            source TEXT, migrated_from_path TEXT, created_at TEXT, updated_at TEXT
          );
        `);
        db.prepare("INSERT INTO catalog_meta VALUES ('owner', ?)").run(owned ? "molis-work-project-catalog-v1" : "other-app");
        const insert = db.prepare("INSERT INTO projects VALUES (?, ?, ?, ?, ?, NULL, ?, ?)");
        insert.run("user-project", "用户项目", "board-user", join(home, "projects", "user.db"), "created", "2026-01-01", "2026-01-01");
        insert.run("migrated-project", "迁入项目", "board-migrated", join(home, "projects", "migrated.db"), "migrated", "2026-01-02", "2026-01-02");
      } finally { db.close(); }
      const before = await readFile(databasePath);
      const service = createLocalUninstallService({
        homeDirectory: home,
        runtimeIntegrationService: new RuntimeIntegrationService({
          homeDirectory: home, userHomeDirectory: directory,
          runtimeExecutables: { codex: null, "claude-code": null, opencode: null, "pi-agent": null, "grok-build": null },
        }),
        webServiceManager: new MolisWorkWebServiceManager({ homeDirectory: home, userHomeDirectory: directory, platform: "linux" }),
      });
      const plan = await service.prepare();
      assert.equal(plan.status, owned ? "no_change" : "conflict");
      assert.equal(plan.user_project_count, owned ? 2 : 0);
      assert.equal(plan.demo_project_count, 0);
      if (!owned) assert.match(plan.conflicts.join("\n"), /catalog 不属于 Molis Work/);
      assert.deepEqual(await readFile(databasePath), before);
      const after = new Database(databasePath, { readonly: true });
      try {
        assert.equal((after.pragma("table_info(projects)") as Array<{ name: string }>).some(column => column.name === "data_class"), false);
        assert.equal((after.prepare("SELECT count(*) AS count FROM projects").get() as { count: number }).count, 2);
      } finally { after.close(); }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}
