import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  RuntimeIntegrationService,
  type RuntimeIntegrationServiceOptions,
  type SupportedRuntimeId,
} from "@molis-ai/molis-work-app-local-host";
import { runtimeContextHostFromEnvironment } from "../apps/desktop/launchers/mcp/server.js";

interface Fixture {
  directory: string;
  home: string;
  userHome: string;
  release: string;
  skillSource: string;
  launcher: string;
  executables: Record<SupportedRuntimeId, string>;
}

async function withFixture<T>(run: (fixture: Fixture) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-runtime-integration-"));
  try {
    const home = join(directory, "molis-work-home");
    const userHome = join(directory, "user-home");
    const release = join(home, "releases", "molis-work-test");
    const skillSource = join(release, "skills", "goal-advance");
    const launcher = join(home, "bin", "molis-work-mcp");
    const codex = join(directory, "bin", "codex");
    const claude = join(directory, "bin", "claude");
    const opencode = join(directory, "bin", "opencode");
    const pi = join(directory, "bin", "pi");
    const grok = join(directory, "bin", "grok");
    await Promise.all([
      mkdir(join(home, "config"), { recursive: true }),
      mkdir(skillSource, { recursive: true }),
      mkdir(join(home, "bin"), { recursive: true }),
      mkdir(join(directory, "bin"), { recursive: true }),
      mkdir(userHome, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(home, "config", "installation.json"), `${JSON.stringify({
        schema_version: 2,
        installer: "molis-work-home-install-v1",
        version: "test",
        release_path: "releases/molis-work-test",
      }, null, 2)}\n`),
      writeFile(join(skillSource, "SKILL.md"), "---\nname: goal-advance\n---\n"),
      writeFile(launcher, "#!/bin/sh\nexit 0\n", { mode: 0o755 }),
      writeFile(codex, "#!/bin/sh\nexit 0\n", { mode: 0o755 }),
      writeFile(claude, "#!/bin/sh\nexit 0\n", { mode: 0o755 }),
      writeFile(opencode, "#!/bin/sh\nexit 0\n", { mode: 0o755 }),
      writeFile(pi, "#!/bin/sh\nexit 0\n", { mode: 0o755 }),
      writeFile(grok, "#!/bin/sh\nexit 0\n", { mode: 0o755 }),
    ]);
    return await run({
      directory,
      home,
      userHome,
      release,
      skillSource,
      launcher,
      executables: { codex, "claude-code": claude, opencode, "pi-agent": pi, "grok-build": grok },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function service(
  fixture: Fixture,
  options: Pick<RuntimeIntegrationServiceOptions, "validateConnection"> = {},
): RuntimeIntegrationService {
  return new RuntimeIntegrationService({
    homeDirectory: fixture.home,
    userHomeDirectory: fixture.userHome,
    runtimeExecutables: fixture.executables,
    validateConnection: options.validateConnection ?? (() => true),
  });
}

async function pathMissing(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}

test("default integration validation uses the real MCP launcher and rolls back an exited launcher", async () => {
  await withFixture(async (fixture) => {
    const serverPath = fileURLToPath(new URL("../dist/mcp/server.js", import.meta.url));
    await writeFile(fixture.launcher, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(serverPath)}\n`, { mode: 0o755 });
    const integration = new RuntimeIntegrationService({ homeDirectory: fixture.home,
      userHomeDirectory: fixture.userHome, runtimeExecutables: fixture.executables });
    const plan = await integration.prepare("codex", "connect");
    const result = await integration.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" });
    assert.equal(result.status, "connected", result.message);
    const codexConfig = await readFile(join(fixture.userHome, ".codex", "config.toml"), "utf8");
    assert.match(codexConfig, /\[mcp_servers.molis-work\]/);
    assert.equal(await readlink(join(fixture.userHome, ".codex", "skills", "goal-advance")), fixture.skillSource);

    await writeFile(fixture.launcher, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const failedPlan = await integration.prepare("claude-code", "connect");
    const failed = await integration.confirm({ runtime_id: "claude-code", plan_id: failedPlan.plan_id, decision: "confirmed" });
    assert.equal(failed.status, "rolled_back");
    assert.equal(await pathMissing(join(fixture.userHome, ".claude.json")), true);
    assert.equal(await pathMissing(join(fixture.userHome, ".claude", "skills", "goal-advance")), true);
    assert.equal(await readFile(join(fixture.userHome, ".codex", "config.toml"), "utf8"), codexConfig,
      "a failed integration for another Runtime cannot revert the successful one");
  });
});

test("detect and prepare are read-only and public plans never expose the user's full config", async () => {
  await withFixture(async (fixture) => {
    const codexConfig = join(fixture.userHome, ".codex", "config.toml");
    const claudeConfig = join(fixture.userHome, ".claude.json");
    await mkdir(join(fixture.userHome, ".codex"), { recursive: true });
    await writeFile(codexConfig, 'model = "gpt-test"\nprivate_note = "DO-NOT-LEAK-CODEX"\n');
    await writeFile(claudeConfig, '{\n  "privateNote": "DO-NOT-LEAK-CLAUDE",\n  "mcpServers": {}\n}\n');
    const beforeCodex = await readFile(codexConfig, "utf8");
    const beforeClaude = await readFile(claudeConfig, "utf8");
    const integration = service(fixture);

    const detections = await integration.detectAll();
    assert.deepEqual(detections.map((item) => [item.runtime_id, item.connection_state]), [
      ["codex", "not_connected"],
      ["claude-code", "not_connected"],
      ["opencode", "not_connected"],
      ["pi-agent", "not_connected"],
      ["grok-build", "not_connected"],
    ]);
    const codexPlan = await integration.prepare("codex", "connect");
    const claudePlan = await integration.prepare("claude-code", "connect");
    assert.equal(codexPlan.status, "ready");
    assert.equal(claudePlan.status, "ready");
    assert.match(codexPlan.changes[0].after, /MOLIS_WORK_RUNTIME_ID/);
    assert.match(claudePlan.changes[0].after, /molis-work-mcp/);
    assert.match(codexPlan.restart_instructions.join("\n"), /每个 Session 都要由你确认关联哪个项目/);
    assert.doesNotMatch(codexPlan.restart_instructions.join("\n"), /设为这个目录的默认项目/);
    const publicPlans = JSON.stringify([codexPlan, claudePlan]);
    assert.doesNotMatch(publicPlans, /DO-NOT-LEAK/);
    assert.doesNotMatch(publicPlans, /private_note|privateNote/);
    assert.equal(await readFile(codexConfig, "utf8"), beforeCodex);
    assert.equal(await readFile(claudeConfig, "utf8"), beforeClaude);
    assert.equal(await pathMissing(join(fixture.home, "runtime-integrations")), true);
  });
});

test("Codex App user data is sufficient detection when no codex CLI is on PATH", async () => {
  await withFixture(async (fixture) => {
    await mkdir(join(fixture.userHome, ".codex"), { recursive: true });
    const integration = new RuntimeIntegrationService({
      homeDirectory: fixture.home,
      userHomeDirectory: fixture.userHome,
      runtimeExecutables: { codex: null, "claude-code": null, opencode: null, "pi-agent": null, "grok-build": null },
      validateConnection: () => true,
    });

    const codex = await integration.detect("codex");
    assert.equal(codex.executable_path, null);
    assert.equal(codex.connection_state, "not_connected");
    assert.equal((await integration.prepare("codex", "connect")).status, "ready");
    assert.equal((await integration.detect("claude-code")).connection_state, "not_detected");
  });
});

test("remove is already complete when program artifacts are gone and unrelated Runtime config remains", async () => {
  await withFixture(async (fixture) => {
    await mkdir(join(fixture.userHome, ".codex"), { recursive: true });
    await writeFile(join(fixture.userHome, ".codex", "config.toml"), 'model = "keep-me"\n');
    await writeFile(join(fixture.userHome, ".claude.json"), '{"mcpServers":{"other":{"command":"keep-me"}}}\n');
    await rm(fixture.home, { recursive: true, force: true });

    const integration = service(fixture);
    assert.equal((await integration.prepare("codex", "remove")).status, "no_change");
    assert.equal((await integration.prepare("claude-code", "remove")).status, "no_change");
    assert.match(await readFile(join(fixture.userHome, ".codex", "config.toml"), "utf8"), /keep-me/);
    assert.match(await readFile(join(fixture.userHome, ".claude.json"), "utf8"), /keep-me/);
  });
});

test("Codex first and repeated connection preserve unrelated TOML and create a backup and receipt", async () => {
  await withFixture(async (fixture) => {
    const config = join(fixture.userHome, ".codex", "config.toml");
    await mkdir(join(fixture.userHome, ".codex"), { recursive: true });
    const before = [
      'model = "gpt-test"',
      'private_note = "KEEP-ME"',
      "",
      "[mcp_servers.other]",
      'command = "other-mcp"',
      "",
    ].join("\n");
    await writeFile(config, before);
    const integration = service(fixture);
    const plan = await integration.prepare("codex", "connect");
    const result = await integration.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" });

    assert.equal(result.status, "connected");
    assert.ok(result.backup_path);
    assert.equal(await readFile(result.backup_path!, "utf8"), before);
    const after = await readFile(config, "utf8");
    assert.match(after, /private_note = "KEEP-ME"/);
    assert.match(after, /\[mcp_servers\.other\][\s\S]*command = "other-mcp"/);
    assert.match(after, /\[mcp_servers\.molis-work\]/);
    assert.match(after, new RegExp(fixture.launcher.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(after, /env_vars\s*=|CODEX_THREAD_ID|MOLIS_WORK_WORK_CONTEXT_ID/);
    assert.equal(await readlink(join(fixture.userHome, ".codex", "skills", "goal-advance")), fixture.skillSource);
    const receipt = await readFile(join(fixture.home, "runtime-integrations", "codex.json"), "utf8");
    assert.match(receipt, /molis-work-runtime-integration-v1/);
    assert.doesNotMatch(receipt, /KEEP-ME/);

    const replay = await integration.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" });
    assert.equal(replay.status, "already_connected");
    assert.equal(await readFile(config, "utf8"), after);
    const freshPlan = await integration.prepare("codex", "connect");
    assert.equal(freshPlan.status, "no_change");
    assert.equal((await integration.detect("codex")).connection_state, "connected");
  });
});

test("Codex connection replaces the old static project DB integration instead of preserving a second path", async () => {
  await withFixture(async (fixture) => {
    const config = join(fixture.userHome, ".codex", "config.toml");
    await mkdir(join(fixture.userHome, ".codex"), { recursive: true });
    await writeFile(config, [
      'model = "gpt-test"',
      "",
      "[mcp_servers.molis-work]",
      'command = "node"',
      'args = ["/old/source/dist/mcp/server.js"]',
      "",
      "[mcp_servers.molis-work.env]",
      'MOLIS_WORK_DATABASE = "/old/project.db"',
      'MOLIS_WORK_BOARD_ID = "old-board"',
      "",
    ].join("\n"));
    const integration = service(fixture);
    assert.equal((await integration.detect("codex")).connection_state, "needs_repair");
    const plan = await integration.prepare("codex", "connect");
    assert.equal(plan.status, "ready");
    const result = await integration.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" });
    assert.equal(result.status, "connected");
    const after = await readFile(config, "utf8");
    assert.doesNotMatch(after, /MOLIS_WORK_DATABASE|MOLIS_WORK_BOARD_ID|\/old\/source|\/old\/project/);
    assert.match(after, /MOLIS_WORK_RUNTIME_ID = "codex"/);
    assert.match(after, /model = "gpt-test"/);
  });
});

test("declined, mismatched, stale, and conflicting plans never overwrite Runtime configuration or Skill", async () => {
  await withFixture(async (fixture) => {
    const config = join(fixture.userHome, ".codex", "config.toml");
    const skill = join(fixture.userHome, ".codex", "skills", "goal-advance");
    await mkdir(join(fixture.userHome, ".codex", "skills"), { recursive: true });
    await writeFile(config, 'model = "gpt-test"\n');
    const integration = service(fixture);
    const plan = await integration.prepare("codex", "connect");
    const before = await readFile(config, "utf8");

    const declined = await integration.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "declined" });
    assert.equal(declined.status, "declined");
    assert.equal(await readFile(config, "utf8"), before);
    assert.equal(await pathMissing(skill), true);

    const mismatched = await integration.confirm({ runtime_id: "claude-code", plan_id: plan.plan_id, decision: "confirmed" });
    assert.equal(mismatched.status, "confirmation_mismatch");
    assert.equal(await readFile(config, "utf8"), before);

    await writeFile(config, 'model = "changed-after-preview"\n');
    const stale = await integration.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" });
    assert.equal(stale.status, "stale");
    assert.equal(await readFile(config, "utf8"), 'model = "changed-after-preview"\n');

    await writeFile(config, '[mcp_servers.molis-work]\ncommand = "not-molis-work"\n');
    await writeFile(skill, "user-owned skill\n");
    const conflictPlan = await integration.prepare("codex", "connect");
    assert.equal(conflictPlan.status, "conflict");
    const conflictBefore = await readFile(config, "utf8");
    const conflict = await integration.confirm({ runtime_id: "codex", plan_id: conflictPlan.plan_id, decision: "confirmed" });
    assert.equal(conflict.status, "conflict");
    assert.equal(await readFile(config, "utf8"), conflictBefore);
    assert.equal(await readFile(skill, "utf8"), "user-owned skill\n");
  });
});

test("failed validation restores Codex config bytes and Skill state", async () => {
  await withFixture(async (fixture) => {
    const config = join(fixture.userHome, ".codex", "config.toml");
    await mkdir(join(fixture.userHome, ".codex"), { recursive: true });
    const before = 'model = "gpt-test"\n';
    await writeFile(config, before);
    const integration = service(fixture, { validateConnection: () => false });
    const plan = await integration.prepare("codex", "connect");
    const result = await integration.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" });

    assert.equal(result.status, "rolled_back");
    assert.equal(await readFile(config, "utf8"), before);
    assert.equal(await pathMissing(join(fixture.userHome, ".codex", "skills", "goal-advance")), true);
    assert.equal(await pathMissing(join(fixture.home, "runtime-integrations", "codex.json")), true);
    const attempts = await stat(join(fixture.home, "runtime-integration-attempts"));
    assert.ok(attempts.isDirectory());
  });
});

test("default validation tolerates slow MCP startup before initialize and tools-list", async () => {
  await withFixture(async (fixture) => {
    const builtServer = join(process.cwd(), "dist", "mcp", "server.js");
    await writeFile(fixture.launcher, `#!/bin/sh\nsleep 3.2\nexec node ${JSON.stringify(builtServer)}\n`, { mode: 0o755 });
    const integration = new RuntimeIntegrationService({
      homeDirectory: fixture.home,
      userHomeDirectory: fixture.userHome,
      runtimeExecutables: fixture.executables,
    });
    const plan = await integration.prepare("codex", "connect");
    const result = await integration.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" });
    assert.equal(result.status, "connected");
  });
});

test("Claude Code connection and removal preserve unrelated JSON and other MCP servers", async () => {
  await withFixture(async (fixture) => {
    const config = join(fixture.userHome, ".claude.json");
    await writeFile(config, `${JSON.stringify({
      privateNote: "KEEP-CLAUDE",
      mcpServers: { other: { type: "stdio", command: "other-mcp", args: [] } },
      projects: { example: { allowed: true } },
    }, null, 2)}\n`);
    const integration = service(fixture);
    const connectPlan = await integration.prepare("claude-code", "connect");
    const connected = await integration.confirm({
      runtime_id: "claude-code",
      plan_id: connectPlan.plan_id,
      decision: "confirmed",
    });
    assert.equal(connected.status, "connected");
    const afterConnect = JSON.parse(await readFile(config, "utf8")) as Record<string, any>;
    assert.equal(afterConnect.privateNote, "KEEP-CLAUDE");
    assert.deepEqual(afterConnect.projects, { example: { allowed: true } });
    assert.equal(afterConnect.mcpServers.other.command, "other-mcp");
    assert.equal(afterConnect.mcpServers["molis-work"].command, fixture.launcher);
    assert.equal(afterConnect.mcpServers["molis-work"].env.MOLIS_WORK_RUNTIME_ID, "claude-code");

    const removePlan = await integration.prepare("claude-code", "remove");
    assert.equal(removePlan.status, "ready");
    const removed = await integration.confirm({
      runtime_id: "claude-code",
      plan_id: removePlan.plan_id,
      decision: "confirmed",
    });
    assert.equal(removed.status, "removed");
    const afterRemove = JSON.parse(await readFile(config, "utf8")) as Record<string, any>;
    assert.equal(afterRemove.privateNote, "KEEP-CLAUDE");
    assert.equal(afterRemove.mcpServers.other.command, "other-mcp");
    assert.equal(afterRemove.mcpServers["molis-work"], undefined);
    assert.equal(await pathMissing(join(fixture.userHome, ".claude", "skills", "goal-advance")), true);
    assert.equal(await pathMissing(join(fixture.home, "runtime-integrations", "claude-code.json")), true);
    const replay = await integration.confirm({
      runtime_id: "claude-code",
      plan_id: removePlan.plan_id,
      decision: "confirmed",
    });
    assert.equal(replay.status, "already_removed");
  });
});

test("removal refuses to delete Molis Work entries or Skill links changed after connection", async () => {
  await withFixture(async (fixture) => {
    const config = join(fixture.userHome, ".claude.json");
    await writeFile(config, '{"mcpServers":{}}\n');
    const integration = service(fixture);
    const connectPlan = await integration.prepare("claude-code", "connect");
    assert.equal((await integration.confirm({
      runtime_id: "claude-code",
      plan_id: connectPlan.plan_id,
      decision: "confirmed",
    })).status, "connected");

    const changed = JSON.parse(await readFile(config, "utf8")) as Record<string, any>;
    changed.mcpServers["molis-work"].args = ["--user-change"];
    await writeFile(config, `${JSON.stringify(changed)}\n`);
    const skill = join(fixture.userHome, ".claude", "skills", "goal-advance");
    await rm(skill);
    const userSkill = join(fixture.directory, "user-skill");
    await mkdir(userSkill);
    await symlink(userSkill, skill, "dir");
    const before = await readFile(config, "utf8");

    const removePlan = await integration.prepare("claude-code", "remove");
    assert.equal(removePlan.status, "conflict");
    const result = await integration.confirm({
      runtime_id: "claude-code",
      plan_id: removePlan.plan_id,
      decision: "confirmed",
    });
    assert.equal(result.status, "conflict");
    assert.equal(await readFile(config, "utf8"), before);
    assert.equal(await readlink(skill), userSkill);
  });
});

test("OpenCode, Pi Agent, and Grok Build write official MCP and Skill locations", async () => {
  await withFixture(async (fixture) => {
    const integration = service(fixture);
    const opencodeConfig = join(fixture.userHome, ".config", "opencode", "opencode.json");
    const piConfig = join(fixture.userHome, ".pi", "agent", "mcp.json");
    const grokConfig = join(fixture.userHome, ".grok", "config.toml");
    await mkdir(join(fixture.userHome, ".config", "opencode"), { recursive: true });
    await mkdir(join(fixture.userHome, ".pi", "agent"), { recursive: true });
    await mkdir(join(fixture.userHome, ".grok"), { recursive: true });
    await writeFile(opencodeConfig, `${JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      model: "keep-opencode",
      mcp: { other: { type: "local", command: ["keep-me"] } },
    }, null, 2)}\n`);
    await writeFile(piConfig, `${JSON.stringify({
      settings: { toolPrefix: "mcp" },
      mcpServers: { other: { command: "keep-pi" } },
    }, null, 2)}\n`);
    await writeFile(grokConfig, 'model = "keep-grok"\n\n[mcp_servers.other]\ncommand = "keep-grok"\n');

    for (const runtimeId of ["opencode", "pi-agent", "grok-build"] as const) {
      const plan = await integration.prepare(runtimeId, "connect");
      assert.equal(plan.status, "ready", runtimeId);
      const result = await integration.confirm({ runtime_id: runtimeId, plan_id: plan.plan_id, decision: "confirmed" });
      assert.equal(result.status, "connected", runtimeId);
      assert.equal((await integration.detect(runtimeId)).connection_state, "connected", runtimeId);
    }

    const opencode = JSON.parse(await readFile(opencodeConfig, "utf8")) as {
      model: string;
      mcp: Record<string, { type?: string; command?: string[]; environment?: Record<string, string> }>;
    };
    assert.equal(opencode.model, "keep-opencode");
    assert.deepEqual(opencode.mcp.other.command, ["keep-me"]);
    assert.equal(opencode.mcp["molis-work"].type, "local");
    assert.deepEqual(opencode.mcp["molis-work"].command, [fixture.launcher]);
    assert.equal(opencode.mcp["molis-work"].environment?.MOLIS_WORK_RUNTIME_ID, "opencode");
    assert.equal(await readlink(join(fixture.userHome, ".config", "opencode", "skills", "goal-advance")), fixture.skillSource);

    const pi = JSON.parse(await readFile(piConfig, "utf8")) as {
      settings: { toolPrefix: string };
      mcpServers: Record<string, { command?: string; env?: Record<string, string>; lifecycle?: string }>;
    };
    assert.equal(pi.settings.toolPrefix, "mcp");
    assert.equal(pi.mcpServers.other.command, "keep-pi");
    assert.equal(pi.mcpServers["molis-work"].command, fixture.launcher);
    assert.equal(pi.mcpServers["molis-work"].env?.MOLIS_WORK_RUNTIME_ID, "pi-agent");
    assert.equal(pi.mcpServers["molis-work"].lifecycle, "eager");
    assert.equal(await readlink(join(fixture.userHome, ".pi", "agent", "skills", "goal-advance")), fixture.skillSource);

    const grok = await readFile(grokConfig, "utf8");
    assert.match(grok, /model = "keep-grok"/);
    assert.match(grok, /\[mcp_servers\.other\][\s\S]*command = "keep-grok"/);
    assert.match(grok, /\[mcp_servers\.molis-work\]/);
    assert.match(grok, /MOLIS_WORK_RUNTIME_ID = "grok-build"/);
    assert.equal(await readlink(join(fixture.userHome, ".grok", "skills", "goal-advance")), fixture.skillSource);
  });
});

test("Runtime host keeps Session identity independent from the canonical workspace", () => {
  const codex = runtimeContextHostFromEnvironment({
    MOLIS_WORK_RUNTIME_ID: "codex",
    CODEX_THREAD_ID: "codex-thread-123",
    PWD: "/workspace/alpha",
  }, "/fallback");
  assert.equal(codex?.runtimeContext.stable_work_context_id, "codex-thread-123");
  assert.equal(codex?.runtimeContext.host_declares_stable, true);
  assert.deepEqual(codex?.runtimeContext.workspace, {
    canonical_path: "/workspace/alpha",
    realpath_verified: false,
  });
  assert.deepEqual(codex?.projectSuggestionClues, [{ kind: "workspace", value: "/workspace/alpha" }]);

  const claude = runtimeContextHostFromEnvironment({
    MOLIS_WORK_RUNTIME_ID: "claude-code",
    CLAUDE_CODE_SESSION_ID: "claude-session-456",
    CLAUDE_CODE_SESSION_NAME: "Alpha launch",
  }, "/workspace/beta");
  assert.equal(claude?.runtimeContext.stable_work_context_id, "claude-session-456");
  assert.deepEqual(claude?.projectSuggestionClues, [
    { kind: "workspace", value: "/workspace/beta" },
    { kind: "session_title", value: "Alpha launch" },
  ]);

  const explicit = runtimeContextHostFromEnvironment({
    MOLIS_WORK_RUNTIME_ID: "codex",
    MOLIS_WORK_WORK_CONTEXT_ID: "explicit-id",
    MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
    CODEX_THREAD_ID: "ignored-thread",
  }, "/workspace/gamma");
  assert.equal(explicit?.runtimeContext.stable_work_context_id, "explicit-id");

  // Hosts that do not inject a Session ID still provide a separate workspace;
  // Molis Work must not turn that directory into a fake machine-wide Session.
  const unknown = runtimeContextHostFromEnvironment({ MOLIS_WORK_RUNTIME_ID: "some-runtime" }, "/workspace/delta");
  assert.equal(unknown?.runtimeContext.stable_work_context_id, null);
  assert.equal(unknown?.runtimeContext.host_declares_stable, false);
  assert.equal(unknown?.runtimeContext.workspace?.canonical_path, "/workspace/delta");
  assert.deepEqual(unknown?.projectSuggestionClues, [{ kind: "workspace", value: "/workspace/delta" }]);

  const legacyEnv = runtimeContextHostFromEnvironment({
    GOALBOARD_RUNTIME_ID: "codex",
    GOALBOARD_HOME: "/tmp/legacy-home",
    GOALBOARD_WEB_URL: "http://127.0.0.1:4173",
    CODEX_THREAD_ID: "legacy-thread",
  }, "/workspace/legacy");
  assert.equal(legacyEnv?.homeDirectory, "/tmp/legacy-home");
  assert.equal(legacyEnv?.webBaseUrl, "http://127.0.0.1:4173");
  assert.equal(legacyEnv?.runtimeContext.runtime_id, "codex");
  assert.equal(legacyEnv?.runtimeContext.stable_work_context_id, "legacy-thread");

  const nextEnvWins = runtimeContextHostFromEnvironment({
    MOLIS_WORK_RUNTIME_ID: "claude-code",
    GOALBOARD_RUNTIME_ID: "codex",
  }, "/workspace/next");
  assert.equal(nextEnvWins?.runtimeContext.runtime_id, "claude-code");

  const codexFallback = runtimeContextHostFromEnvironment({
    MOLIS_WORK_RUNTIME_ID: "codex",
    PWD: "/workspace/epsilon",
  }, "/fallback");
  assert.equal(codexFallback?.runtimeContext.stable_work_context_id, null);
  assert.equal(codexFallback?.runtimeContext.host_declares_stable, false);
  assert.equal(codexFallback?.runtimeContext.workspace?.canonical_path, "/workspace/epsilon");
  assert.deepEqual(codexFallback?.projectSuggestionClues, [{ kind: "workspace", value: "/workspace/epsilon" }]);

  // No runtime ID and no usable workspace still means no identity at all.
  assert.equal(runtimeContextHostFromEnvironment({}, "/workspace/epsilon"), null);
  const noWorkspace = runtimeContextHostFromEnvironment({ MOLIS_WORK_RUNTIME_ID: "codex" }, "");
  assert.equal(noWorkspace?.runtimeContext.stable_work_context_id, null);
  assert.equal(noWorkspace?.runtimeContext.host_declares_stable, false);
  assert.equal(noWorkspace?.runtimeContext.workspace, null);
});
