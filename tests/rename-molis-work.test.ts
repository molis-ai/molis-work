import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { DEMO_BOARD_ID, openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
import { canonicalMcpToolName, isRuntimeMcpTool } from "@molis-ai/molis-work-app-mcp";
import { parsePluginManifest, PluginManifestError } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  PROJECT_DATABASE_FILENAME,
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

test("MOLIS_WORK environment is the only product env prefix", () => {
  const previousNext = process.env.MOLIS_WORK_HOME;
  const previousLegacy = process.env.GOALBOARD_HOME;
  try {
    delete process.env.MOLIS_WORK_HOME;
    process.env.GOALBOARD_HOME = "/tmp/legacy-goalboard-home";
    assert.equal(readProductEnv("HOME"), undefined);
    process.env.MOLIS_WORK_HOME = "/tmp/molis-work-home";
    assert.equal(readProductEnv("HOME"), "/tmp/molis-work-home");
    assert.equal(resolveMolisWorkHome(), "/tmp/molis-work-home");
  } finally {
    restoreEnv("MOLIS_WORK_HOME", previousNext);
    restoreEnv("GOALBOARD_HOME", previousLegacy);
  }
});

test("project database path does not rename leftover goalboard.db", async () => {
  await withTemporaryDirectory(async (directory) => {
    const leftover = join(directory, "goalboard.db");
    writeFileSync(leftover, "fixture");
    assert.equal(resolveProjectDatabaseFile(directory), join(directory, PROJECT_DATABASE_FILENAME));
    assert.equal(existsSync(leftover), true);
    assert.equal(existsSync(join(directory, PROJECT_DATABASE_FILENAME)), false);
  });
});

test("Session Registry rejects GoalBoard owner", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home");
    const registry = await openWorkSessionRegistry({ homeDirectory: home });
    registry.close();
    const db = new Database(join(home, "sessions", "sessions.db"));
    try {
      db.prepare("UPDATE session_meta SET value = ? WHERE key = 'owner'").run("goalboard-session-registry-v1");
    } finally {
      db.close();
    }
    await assert.rejects(
      () => openWorkSessionRegistry({ homeDirectory: home }),
      (error: unknown) => error instanceof Error && error.message.includes("不会复用未知 Session Registry 数据库"),
    );
  });
});

test("catalog rejects GoalBoard owner", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home");
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    catalog.close();
    const db = new Database(join(home, "projects", "catalog.db"));
    try {
      db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'owner'").run("goalboard-project-catalog-v1");
    } finally {
      db.close();
    }
    await assert.rejects(
      () => openMolisWorkProjectCatalog({ homeDirectory: home }),
      (error: unknown) => error instanceof Error && error.message.includes("不会复用未知项目目录数据库"),
    );
  });
});

test("demo board id is the current product id", () => {
  assert.equal(DEMO_BOARD_ID, "molis-work-v1-demo");
});

test("legacy MCP tool names are not mapped onto current tools", () => {
  assert.equal(canonicalMcpToolName("goalboard_v1_goal_list"), "goalboard_v1_goal_list");
  assert.equal(canonicalMcpToolName("molis_work_v1_goal_list"), "molis_work_v1_goal_list");
  assert.equal(isRuntimeMcpTool("goalboard_v1_goal_list"), false);
  assert.equal(isRuntimeMcpTool("molis_work_v1_goal_list"), true);
});

test("macOS App install copies Molis Work and does not look for GoalBoard.app", {
  skip: process.platform !== "darwin",
}, async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home");
    const appDir = join(directory, "apps");
    const source = join(directory, "Molis Work.app");
    writeMacosApp(source, "com.molis.work");
    writeMacosApp(join(appDir, "GoalBoard.app"), "com.adeptify.goalboard");
    const result = spawnSync("bash", [join(repoRoot, "apps/desktop/tooling/install-macos-app.sh"), source], {
      env: {
        ...process.env,
        HOME: home,
        MOLIS_WORK_APP_DIR: appDir,
        MOLIS_WORK_SKIP_OPEN: "1",
      },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(existsSync(join(appDir, "Molis Work.app", "Contents", "Info.plist")), true);
    assert.equal(existsSync(join(appDir, "GoalBoard.app")), true);
    assert.equal(existsSync(join(home, ".Trash")), false);
  });
});

test("legacy plugin IDs are rejected", () => {
  const manifest = {
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
  };
  assert.throws(
    () => parsePluginManifest(manifest),
    (error: unknown) => error instanceof PluginManifestError && error.code === "plugin_manifest_invalid",
  );
  assert.equal(parsePluginManifest({ ...manifest, plugin_id: "io.molis.work.example.notes" }).plugin_id, "io.molis.work.example.notes");
});

test("GitHub Releases links point at molis-ai/molis-work", async () => {
  for (const file of ["README.md", "README.zh.md", "README.zh-CN.md", "docs/installation.md", "docs/installation.en.md"]) {
    const text = await readFile(join(repoRoot, file), "utf8");
    assert.equal(text.includes("github.com/adeptify/Molis Work"), false, file);
    assert.match(text, /github\.com\/molis-ai\/molis-work\/releases/);
  }
});

test("workbench storage does not read legacy goalboard keys", async () => {
  const navigation = await readFile(join(repoRoot, "apps/workbench/src/scripts/client/immersive-navigation.ts"), "utf8");
  const momentum = await readFile(join(repoRoot, "plugins/native/goals/src/momentum-client.ts"), "utf8");
  assert.doesNotMatch(navigation, /goalboard-goal-work-modes:/);
  assert.doesNotMatch(momentum, /goalboard-goal-workspace-split:/);
});

test("desktop host does not keep GoalBoard env, launchers, Home aliases, or old App retirement", async () => {
  const rust = await readFile(join(repoRoot, "apps/desktop/adapters/tauri/src/web_service.rs"), "utf8");
  const main = await readFile(join(repoRoot, "apps/desktop/adapters/tauri/src/main.rs"), "utf8");
  const install = await readFile(join(repoRoot, "apps/desktop/tooling/install-macos-app.sh"), "utf8");
  const home = await readFile(join(repoRoot, "packages/storage/src/adapters/local-security-paths.ts"), "utf8");
  const secrets = await readFile(join(repoRoot, "packages/storage/src/adapters/file-secret-store.ts"), "utf8");
  assert.doesNotMatch(rust, /GOALBOARD_/);
  assert.doesNotMatch(rust, /goalboard/);
  assert.doesNotMatch(main, /legacy_app|GoalBoard\.app|com\.adeptify\.goalboard/);
  assert.doesNotMatch(install, /GoalBoard\.app|retire-legacy|com\.adeptify\.goalboard/);
  assert.equal(existsSync(join(repoRoot, "apps/desktop/tooling/retire-legacy-macos-app.sh")), false);
  assert.equal(existsSync(join(repoRoot, "apps/desktop/adapters/tauri/src/legacy_app.rs")), false);
  assert.doesNotMatch(home, /goalboard/);
  assert.doesNotMatch(secrets, /com\.adeptify\.goalboard/);
});
