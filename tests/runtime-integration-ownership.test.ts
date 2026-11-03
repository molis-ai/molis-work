import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { RuntimeIntegrationService, readRuntimeConfigBackup, type RuntimeIntegrationServiceOptions } from "@molis-ai/molis-work-app-local-host";

async function fixture(t: TestContext, before = 'model = "original"\n') {
  const directory = await mkdtemp(join(tmpdir(), "molis-runtime-owner-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const home = join(directory, "home"), userHome = join(directory, "user");
  const config = join(userHome, ".codex", "config.toml"), skill = join(userHome, ".codex", "skills", "goal-advance");
  const skillSource = join(home, "releases", "test", "skills", "goal-advance");
  const launcher = join(home, "bin", "molis-work-mcp");
  await Promise.all([mkdir(join(home, "config"), { recursive: true }), mkdir(join(home, "bin"), { recursive: true }),
    mkdir(skillSource, { recursive: true }), mkdir(join(userHome, ".codex", "skills"), { recursive: true })]);
  await Promise.all([writeFile(launcher, "#!/bin/sh\nexit 0\n", { mode: 0o755 }), writeFile(config, before),
    writeFile(join(home, "config", "installation.json"), JSON.stringify({ schema_version: 2,
      installer: "molis-work-home-install-v1", release_path: "releases/test" }))]);
  const service = (validateConnection: RuntimeIntegrationServiceOptions["validateConnection"] = () => true) =>
    new RuntimeIntegrationService({ homeDirectory: home, userHomeDirectory: userHome,
      runtimeExecutables: { codex: launcher }, validateConnection });
  return { directory, home, config, skill, skillSource, launcher, before, service };
}

test("W2-18-RUNTIME-ROLLBACK-01 preserves later config edits and a user Skill link after failed validation", async t => {
  const f = await fixture(t);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const runtime = f.service(async () => { entered.resolve(); await release.promise; return false; });
  const plan = await runtime.prepare("codex", "connect");
  const pending = runtime.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" });
  t.after(async () => { release.resolve(); await pending; });
  await entered.promise;
  const laterConfig = (await readFile(f.config, "utf8")).replace('model = "original"', 'model = "user-edit"');
  await writeFile(f.config, laterConfig);
  const userSkill = join(f.directory, "user-skill");
  await mkdir(userSkill); await rm(f.skill); await symlink(userSkill, f.skill, "dir");
  release.resolve();
  const result = await pending;
  assert.equal(result.status, "conflict");
  assert.match(result.message, /保留|未完整回滚/);
  assert.equal(await readFile(f.config, "utf8"), laterConfig);
  assert.equal(await readlink(f.skill), userSkill);
  assert.equal((await readRuntimeConfigBackup(f.home, "codex", plan.plan_id)).contents, f.before);
  await assert.rejects(readFile(join(f.home, "runtime-integrations", "codex.json")), { code: "ENOENT" });
});

test("W2-18-RUNTIME-ROLLBACK-02 rolls back only its own unchanged writes and serializes separate service instances", async t => {
  const f = await fixture(t);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const first = f.service(async () => { entered.resolve(); await release.promise; return false; });
  const second = f.service();
  const firstPlan = await first.prepare("codex", "connect"), secondPlan = await second.prepare("codex", "connect");
  const firstPending = first.confirm({ runtime_id: "codex", plan_id: firstPlan.plan_id, decision: "confirmed" });
  t.after(async () => { release.resolve(); await firstPending; });
  await entered.promise;
  let secondSettled = false;
  const secondPending = second.confirm({ runtime_id: "codex", plan_id: secondPlan.plan_id, decision: "confirmed" });
  void secondPending.then(() => { secondSettled = true; }, () => { secondSettled = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(secondSettled, false);
  release.resolve();
  assert.equal((await firstPending).status, "rolled_back");
  assert.equal((await secondPending).status, "connected");
  assert.equal(await readlink(f.skill), f.skillSource);
  assert.equal((await second.detect("codex")).connection_state, "connected");
  assert.equal((await readRuntimeConfigBackup(f.home, "codex", firstPlan.plan_id)).contents, f.before);
});

test("W2-18-RUNTIME-ROLLBACK-03 preserves an identical user replacement file by identity", async t => {
  const f = await fixture(t);
  const runtime = f.service(async () => {
    const sameBytes = await readFile(f.config);
    await rm(f.config); await writeFile(f.config, sameBytes);
    return false;
  });
  const plan = await runtime.prepare("codex", "connect");
  const result = await runtime.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" });
  assert.equal(result.status, "conflict");
  assert.match(await readFile(f.config, "utf8"), /\[mcp_servers.molis-work\]/);
  await assert.rejects(readlink(f.skill), { code: "ENOENT" });
});

for (const header of ['[mcp_servers."molis-work"]', "[ 'mcp_servers' . 'molis-work' ]",
  '["mcp_servers" . "molis\\u002dwork"]', '[mcp_servers."molis\\U0000002Dwork"]']) {
  test(`W2-18-RUNTIME-TOML-01 replaces the existing owned semantic table ${header}`, async t => {
    const prefix = 'model = "keep"\n# user prefix\n';
    const suffix = '[mcp_servers.other]\ncommand = "keep-other"\n';
    const f = await fixture(t, `${prefix}${header}\ncommand = "/old/molis-work-mcp"\n${suffix}`);
    const runtime = f.service(), plan = await runtime.prepare("codex", "connect");
    assert.equal(plan.status, "ready");
    assert.equal((await runtime.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" })).status, "connected");
    const after = await readFile(f.config, "utf8");
    const expected = `${prefix}[mcp_servers.molis-work]\ncommand = ${JSON.stringify(f.launcher)}\n\n`
      + `[mcp_servers.molis-work.env]\nMOLIS_WORK_HOME = ${JSON.stringify(f.home)}\n`
      + `MOLIS_WORK_MCP_AUDIENCE = "runtime"\nMOLIS_WORK_RUNTIME_ID = "codex"\n${suffix}`;
    assert.equal(after, expected);
    assert.equal((await runtime.detect("codex")).connection_state, "connected");
  });
}

test("W2-18-RUNTIME-TOML-02 preserves multiline values, arrays and literal-dot tables containing header examples", async t => {
  const before = 'example = """\n[mcp_servers.molis-work]\ncommand = "not-a-table"\n"""\n'
    + 'examples = [\n"[mcp_servers.molis-work]",\n]\n'
    + '["mcp_servers.molis-work"]\ncommand = "literal-dot-user-table"\n';
  const f = await fixture(t, before), runtime = f.service();
  const plan = await runtime.prepare("codex", "connect");
  assert.equal(plan.status, "ready");
  assert.equal((await runtime.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" })).status, "connected");
  const removePlan = await runtime.prepare("codex", "remove");
  assert.equal((await runtime.confirm({ runtime_id: "codex", plan_id: removePlan.plan_id, decision: "confirmed" })).status, "removed");
  assert.equal(await readFile(f.config, "utf8"), before);
});

for (const before of ['[mcp_servers."molis-work"]\ncommand = "user-command"\n',
  '[mcp_servers.molis-work]\ncommand = "/old/molis-work-mcp"\n[mcp_servers."molis-work"]\ncommand = "other"\n',
  'mcp_servers = { "molis-work" = { command = "user-command" } }\n',
  'mcp_servers."molis-work".command = "user-command"\n']) {
  test("W2-18-RUNTIME-TOML-03 refuses unknown, duplicate or inline definitions before any write", async t => {
    const f = await fixture(t, before), runtime = f.service();
    const plan = await runtime.prepare("codex", "connect");
    assert.equal(plan.status, "conflict");
    assert.equal((await runtime.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" })).status, "conflict");
    assert.equal(await readFile(f.config, "utf8"), before);
    await assert.rejects(readlink(f.skill), { code: "ENOENT" });
  });
}
