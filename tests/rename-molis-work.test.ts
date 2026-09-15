import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { CATALOG_OWNER, LEGACY_CATALOG_OWNER } from "@molis-ai/molis-work-app-local-host";
import { canonicalMcpToolName, isRuntimeMcpTool } from "@molis-ai/molis-work-app-mcp";
import { parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  LEGACY_HOME_DIRNAME,
  LEGACY_PROJECT_DATABASE_FILENAME,
  PROJECT_DATABASE_FILENAME,
  migrateLegacyHomeDirectory,
  readProductEnv,
  resolveMolisWorkHome,
  resolveProjectDatabaseFile,
} from "@molis-ai/molis-work-storage";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function writeMacosApp(app: string, bundleId: string): void {
  mkdirSync(join(app, "Contents"), { recursive: true });
  writeFileSync(
    join(app, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>${bundleId}</string>
</dict>
</plist>
`,
  );
}

async function withTemporaryDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-rename-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous == null) delete process.env[name];
  else process.env[name] = previous;
}

test("legacy Home directory is renamed onto the current product Home", async () => {
  await withTemporaryDirectory(async (directory) => {
    const next = join(directory, ".molis-work");
    const legacy = join(directory, LEGACY_HOME_DIRNAME);
    mkdirSync(legacy);
    writeFileSync(join(legacy, "kept.txt"), "projects");
    assert.equal(migrateLegacyHomeDirectory(next, legacy), next);
    assert.equal(await readFile(join(next, "kept.txt"), "utf8"), "projects");
    assert.equal(lstatSync(legacy).isSymbolicLink(), true);
    assert.equal(realpathSync(legacy), realpathSync(next));
  });
});

test("MOLIS_WORK environment wins, then GOALBOARD fallback", () => {
  const previousNext = process.env.MOLIS_WORK_HOME;
  const previousLegacy = process.env.GOALBOARD_HOME;
  try {
    delete process.env.MOLIS_WORK_HOME;
    process.env.GOALBOARD_HOME = "/tmp/legacy-goalboard-home";
    assert.equal(readProductEnv("HOME"), "/tmp/legacy-goalboard-home");
    process.env.MOLIS_WORK_HOME = "/tmp/molis-work-home";
    assert.equal(readProductEnv("HOME"), "/tmp/molis-work-home");
    assert.equal(resolveMolisWorkHome(), "/tmp/molis-work-home");
  } finally {
    restoreEnv("MOLIS_WORK_HOME", previousNext);
    restoreEnv("GOALBOARD_HOME", previousLegacy);
  }
});

test("project database files named goalboard.db are renamed to molis-work.db", async () => {
  await withTemporaryDirectory(async (directory) => {
    const legacy = join(directory, LEGACY_PROJECT_DATABASE_FILENAME);
    writeFileSync(legacy, "fixture");
    assert.equal(resolveProjectDatabaseFile(directory), join(directory, PROJECT_DATABASE_FILENAME));
    assert.equal(await readFile(join(directory, PROJECT_DATABASE_FILENAME), "utf8"), "fixture");
  });
});

test("catalog rewrites GoalBoard owner and project database filenames", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home");
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    let projectId = "";
    try {
      const project = await catalog.createProject({ display_name: "迁移项目", actor_id: "user" });
      projectId = project.project_id;
      assert.equal(project.database_path.endsWith(PROJECT_DATABASE_FILENAME), true);
    } finally {
      catalog.close();
    }

    const catalogPath = join(home, "projects", "catalog.db");
    const projectDirectory = join(home, "projects", projectId);
    const nextDatabase = join(projectDirectory, PROJECT_DATABASE_FILENAME);
    const legacyDatabase = join(projectDirectory, LEGACY_PROJECT_DATABASE_FILENAME);
    renameSync(nextDatabase, legacyDatabase);
    const db = new Database(catalogPath);
    try {
      db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'owner'").run(LEGACY_CATALOG_OWNER);
      db.prepare("UPDATE projects SET database_path = ? WHERE project_id = ?").run(legacyDatabase, projectId);
    } finally {
      db.close();
    }

    const reopened = await openMolisWorkProjectCatalog({ homeDirectory: home });
    let databasePath = "";
    try {
      databasePath = reopened.getProject(projectId).database_path;
    } finally {
      reopened.close();
    }
    const ownerDb = new Database(catalogPath);
    try {
      const owner = ownerDb.prepare("SELECT value FROM catalog_meta WHERE key = 'owner'").get() as { value: string };
      assert.equal(owner.value, CATALOG_OWNER);
    } finally {
      ownerDb.close();
    }
    assert.equal(databasePath, nextDatabase);
    assert.equal(existsSync(nextDatabase), true);
    assert.equal(existsSync(legacyDatabase), false);
  });
});

test("legacy MCP tool names map onto the current tools", () => {
  assert.equal(canonicalMcpToolName("goalboard_v1_goal_list"), "molis_work_v1_goal_list");
  assert.equal(canonicalMcpToolName("molis_work_v1_goal_list"), "molis_work_v1_goal_list");
  assert.equal(isRuntimeMcpTool("goalboard_v1_goal_list"), true);
  assert.equal(isRuntimeMcpTool("molis_work_v1_goal_list"), true);
});

test("owned GoalBoard.app is retired and foreign bundles stay", {
  skip: process.platform !== "darwin",
}, async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home");
    const appDir = join(directory, "apps");
    const systemDir = join(directory, "system");
    const trash = join(directory, "trash");
    writeMacosApp(join(appDir, "GoalBoard.app"), "com.adeptify.goalboard");
    writeMacosApp(join(home, "Applications", "GoalBoard.app"), "com.adeptify.goalboard");
    writeMacosApp(join(systemDir, "GoalBoard.app"), "com.example.not-ours");
    const result = spawnSync("bash", [join(repoRoot, "apps/desktop/tooling/retire-legacy-macos-app.sh"), appDir], {
      env: {
        ...process.env,
        HOME: home,
        MOLIS_WORK_SYSTEM_APP_DIR: systemDir,
        MOLIS_WORK_TRASH_DIR: trash,
      },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(appDir, "GoalBoard.app")), false);
    assert.equal(existsSync(join(home, "Applications", "GoalBoard.app")), false);
    assert.equal(existsSync(join(systemDir, "GoalBoard.app")), true);
    assert.equal(readdirSync(trash).filter((name) => name.startsWith("GoalBoard.app.")).length, 2);
  });
});

test("macOS App install copies Molis Work and retires owned GoalBoard.app", {
  skip: process.platform !== "darwin",
}, async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home");
    const appDir = join(directory, "apps");
    const systemDir = join(directory, "system");
    const source = join(directory, "Molis Work.app");
    writeMacosApp(source, "com.molis.work");
    writeMacosApp(join(appDir, "GoalBoard.app"), "com.adeptify.goalboard");
    const result = spawnSync("bash", [join(repoRoot, "apps/desktop/tooling/install-macos-app.sh"), source], {
      env: {
        ...process.env,
        HOME: home,
        MOLIS_WORK_APP_DIR: appDir,
        MOLIS_WORK_SYSTEM_APP_DIR: systemDir,
        MOLIS_WORK_SKIP_OPEN: "1",
      },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(existsSync(join(appDir, "Molis Work.app", "Contents", "Info.plist")), true);
    assert.equal(existsSync(join(appDir, "GoalBoard.app")), false);
    assert.equal(
      readdirSync(join(home, ".Trash")).some((name) => name.startsWith("GoalBoard.app.")),
      true,
    );
  });
});

test("legacy plugin IDs are accepted and normalized", () => {
  const parsed = parsePluginManifest({
    schema_version: 1,
    host_api_version: 1,
    plugin_id: "io.goalboard.example.notes",
    version: "1.0.0",
    name: "Notes",
    kind: "integration",
    publisher: { publisher_id: "local-developer", signature: "local-development-identity" },
    entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: "artifact:write", required: true, reason: "share notes" }],
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] },
  });
  assert.equal(parsed.plugin_id, "io.molis.work.example.notes");
});

test("official demo titles drop GoalBoard on catalog open, user names stay", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home");
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      const demo = await catalog.ensureDemoProject({ actor_id: "user", user_confirmed: true });
      catalog.renameProject(demo.project.project_id, "GoalBoard 示例项目", "user");
      await catalog.createProject({ display_name: "GoalBoard 示例项目", actor_id: "user" });
    } finally {
      catalog.close();
    }
    const reopened = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      const demo = reopened.listProjects().find((project) => project.data_class === "regenerable_demo");
      const user = reopened.listProjects().find((project) => project.data_class !== "regenerable_demo");
      assert.equal(demo?.display_name, "Molis Work 示例项目");
      assert.equal(user?.display_name, "GoalBoard 示例项目");
    } finally {
      reopened.close();
    }
  });
});

test("GitHub Releases links point at molis-ai/molis-work", async () => {
  for (const file of ["README.md", "README.zh.md", "README.zh-CN.md", "docs/installation.md", "docs/installation.en.md"]) {
    const text = await readFile(join(repoRoot, file), "utf8");
    assert.equal(text.includes("github.com/adeptify/Molis Work"), false, file);
    assert.match(text, /github\.com\/molis-ai\/molis-work\/releases/);
  }
});

test("workbench storage reads legacy goalboard keys", async () => {
  const navigation = await readFile(join(repoRoot, "apps/workbench/src/scripts/client/immersive-navigation.ts"), "utf8");
  const bootstrap = await readFile(join(repoRoot, "apps/workbench/src/scripts/client/bootstrap.ts"), "utf8");
  const momentum = await readFile(join(repoRoot, "plugins/native/goals/src/momentum-client.ts"), "utf8");
  assert.match(navigation, /goalboard-goal-work-modes:/);
  assert.match(bootstrap, /goalboard-work-tabs:/);
  assert.match(momentum, /goalboard-goal-workspace-split:/);
});
