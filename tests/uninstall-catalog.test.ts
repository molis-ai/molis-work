import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { MolisWorkWebServiceManager, RuntimeIntegrationService } from "@molis-ai/molis-work-app-local-host";
import { createDesktopUninstallService as createLocalUninstallService } from "@molis-ai/molis-work-app-desktop";

for (const owned of [true, false]) {
  test(`uninstall preview ${owned ? "classifies user data without changing the catalog" : "refuses a catalog owned by another application"}`, async () => {
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
            project_id TEXT PRIMARY KEY, display_name TEXT, database_path TEXT,
            source TEXT, data_class TEXT, created_at TEXT, updated_at TEXT
          );
        `);
        db.prepare("INSERT INTO catalog_meta VALUES ('owner', ?)").run(owned ? "molis-work-project-catalog-v1" : "other-app");
        const insert = db.prepare("INSERT INTO projects VALUES (?, ?, ?, 'created', 'user', ?, ?)");
        insert.run("user-project", "用户项目", join(home, "projects", "user.db"), "2026-01-01", "2026-01-01");
        insert.run("second-project", "第二个项目", join(home, "projects", "second.db"), "2026-01-02", "2026-01-02");
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
        assert.equal((after.prepare("SELECT count(*) AS count FROM projects").get() as { count: number }).count, 2);
      } finally { after.close(); }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

/** The uninstall preview of a Home whose `projects/catalog.db` was built by `build`, and whether the file's bytes were left alone. */
async function previewCatalog(build: (db: Database.Database) => void) {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-uninstall-catalog-"));
  try {
    const home = join(directory, ".molis-work");
    await mkdir(join(home, "projects"), { recursive: true });
    const databasePath = join(home, "projects", "catalog.db");
    const db = new Database(databasePath);
    try { build(db); } finally { db.close(); }
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
    return { plan, untouched: Buffer.compare(await readFile(databasePath), before) === 0 };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test("uninstall preview refuses a catalog.db that has no catalog_meta table: it is not a Molis Work catalog, and is not read for projects", async () => {
  // The catalog's metadata table belongs to the storage package; a database without it names no owner, so it is refused with
  // the "not Molis Work's" message, not the "cannot be read safely" one, and its (here: existing) project rows are never listed.
  const { plan, untouched } = await previewCatalog(db => {
    db.exec(`
      CREATE TABLE projects (
        project_id TEXT PRIMARY KEY, display_name TEXT, database_path TEXT,
        source TEXT, data_class TEXT, created_at TEXT, updated_at TEXT
      );
      INSERT INTO projects VALUES ('stray', 'Stray', '/elsewhere/stray.db', 'created', 'user', '2026-01-01', '2026-01-01');
    `);
  });
  assert.equal(plan.status, "conflict");
  assert.equal(plan.user_project_count, 0);
  assert.equal(plan.demo_project_count, 0);
  assert.match(plan.conflicts.join("\n"), /项目 catalog 不属于 Molis Work/);
  assert.doesNotMatch(plan.conflicts.join("\n"), /无法安全读取项目 catalog/);
  assert.equal(untouched, true);
});

test("uninstall preview refuses an empty catalog.db the same way", async () => {
  const { plan, untouched } = await previewCatalog(db => { db.exec("CREATE TABLE unrelated (x INTEGER);"); });
  assert.equal(plan.status, "conflict");
  assert.equal(plan.user_project_count, 0);
  assert.match(plan.conflicts.join("\n"), /项目 catalog 不属于 Molis Work/);
  assert.equal(untouched, true);
});

test("uninstall preview refuses a catalog that names Molis Work as its owner but whose project list cannot be read", async () => {
  const { plan, untouched } = await previewCatalog(db => {
    db.exec("CREATE TABLE catalog_meta (key TEXT PRIMARY KEY, value TEXT);");
    db.prepare("INSERT INTO catalog_meta VALUES ('owner', 'molis-work-project-catalog-v1')").run();
  });
  assert.equal(plan.status, "conflict");
  assert.equal(plan.user_project_count, 0);
  assert.match(plan.conflicts.join("\n"), /无法安全读取项目 catalog/);
  assert.equal(untouched, true);
});
