import assert from "node:assert/strict";
import { promises as filesystem } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { RuntimeIntegrationService, readRuntimeConfigBackup, type RuntimeIntegrationServiceOptions } from "@molis-ai/molis-work-app-local-host";

async function fixture(t: TestContext, before = 'model = "original"\n') {
  const directory = await mkdtemp(join(tmpdir(), "molis-runtime-owner-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const home = join(directory, "home"), userHome = join(directory, "user");
  const config = join(userHome, ".codex", "config.toml"), skill = join(userHome, ".codex", "skills", "goal-advance");
  const skillSource = join(home, "releases", "molis-work-test", "skills", "goal-advance");
  const launcher = join(home, "bin", "molis-work-mcp");
  await Promise.all([mkdir(join(home, "config"), { recursive: true }), mkdir(join(home, "bin"), { recursive: true }),
    mkdir(skillSource, { recursive: true }), mkdir(join(userHome, ".codex", "skills"), { recursive: true })]);
  await Promise.all([writeFile(launcher, "#!/bin/sh\nexit 0\n", { mode: 0o755 }), writeFile(config, before),
    writeFile(join(home, "config", "installation.json"), JSON.stringify({ schema_version: 1,
      installer: "molis-work-home-install-v1", version: "test", release_path: "releases/molis-work-test",
      content_digest: "a".repeat(64), updated_at: "2026-01-01T00:00:00.000Z" })),
    writeFile(join(home, "releases", "molis-work-test", "release.json"), JSON.stringify({ schema_version: 1,
      installer: "molis-work-home-install-v1", version: "test", dependencies: "embedded", content_digest: "a".repeat(64),
      created_at: "2026-01-01T00:00:00.000Z" }))]);
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


test("ASR installation confirmation waiting in the real target queue cannot write after withdrawal", async t => {
  const f = await fixture(t), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const first = f.service(async () => { entered.resolve(); await release.promise; return true; }), second = f.service();
  const firstPlan = await first.prepare("codex", "connect"), secondPlan = await second.prepare("codex", "connect");
  const firstPending = first.confirm({ runtime_id: "codex", plan_id: firstPlan.plan_id, decision: "confirmed" });
  t.after(async () => { release.resolve(); await firstPending.catch(() => undefined); });
  await entered.promise;
  assert.equal(secondPlan.plan_id, firstPlan.plan_id, "identical previews name the same existing backup");
  const backup = join(f.home, "runtime-config-backups", "codex", firstPlan.plan_id + ".bak");
  const backupBefore = await readFile(backup), identityBefore = await filesystem.stat(backup);
  let withdrawn = false;
  const cancelled = new Error("old installation confirmation withdrawn");
  const pending = second.confirm({ runtime_id: "codex", plan_id: secondPlan.plan_id, decision: "confirmed" }, () => { if (withdrawn) throw cancelled; });
  const rejected = assert.rejects(pending, error => error === cancelled);
  withdrawn = true; release.resolve();
  assert.equal((await firstPending).status, "connected");
  await rejected;
  assert.equal((await second.detect("codex")).connection_state, "connected", "the legitimate first owner stays intact");
  assert.deepEqual(await readFile(backup), backupBefore, "withdrawal preserves the legitimate first owner's backup");
  const identityAfter = await filesystem.stat(backup);
  assert.deepEqual([identityAfter.dev, identityAfter.ino, identityAfter.mtimeMs], [identityBefore.dev, identityBefore.ino, identityBefore.mtimeMs], "the withdrawn waiter never rewrites that backup");
  assert.equal((await readdir(f.home)).includes("runtime-integration-attempts"), false, "a never-started cancelled confirmation records no new attempt");
});

test("ASR installation withdrawal after validation restores only its own config and Skill and writes no receipt or attempt", async t => {
  const f = await fixture(t), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const runtime = f.service(async () => { entered.resolve(); await release.promise; return true; });
  const plan = await runtime.prepare("codex", "connect");
  let withdrawn = false;
  const cancelled = new Error("original installation cancellation");
  const pending = runtime.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" }, () => { if (withdrawn) throw cancelled; });
  const rejected = assert.rejects(pending, error => error === cancelled);
  t.after(async () => { release.resolve(); await pending.catch(() => undefined); });
  await entered.promise;
  assert.notEqual(await readFile(f.config, "utf8"), f.before, "validation is after the real config effect");
  assert.equal(await readlink(f.skill), f.skillSource);
  const backup = await readFile(join(f.home, "runtime-config-backups", "codex", plan.plan_id + ".bak"));
  withdrawn = true; release.resolve(); await rejected;
  assert.equal(await readFile(f.config, "utf8"), f.before);
  await assert.rejects(readlink(f.skill), { code: "ENOENT" });
  await assert.rejects(readFile(join(f.home, "runtime-integrations", "codex.json")), { code: "ENOENT" });
  assert.equal((await readdir(f.home)).includes("runtime-integration-attempts"), false);
  assert.deepEqual(await readFile(join(f.home, "runtime-config-backups", "codex", plan.plan_id + ".bak")), backup, "the authorized earlier backup is not rewritten after withdrawal");
  const current = f.service(), retry = await current.prepare("codex", "connect");
  assert.equal((await current.confirm({ runtime_id: "codex", plan_id: retry.plan_id, decision: "confirmed" })).status, "connected");
});


for (const action of ["connect", "remove"] as const) for (const replacement of [false, true]) {
  test(`ASR withdrawal after final Runtime ${action} receipt effect ${replacement ? "preserves an identical replacement inode" : "restores the original receipt and mode"}`, async t => {
    const f = await fixture(t), runtime = f.service();
    const initial = await runtime.prepare("codex", "connect");
    assert.equal((await runtime.confirm({ runtime_id: "codex", plan_id: initial.plan_id, decision: "confirmed" })).status, "connected");
    const receipt = join(f.home, "runtime-integrations", "codex.json");
    await filesystem.chmod(receipt, 0o600);
    if (action === "connect") { await writeFile(f.config, f.before); await rm(f.skill); }
    const beforeConfig = await readFile(f.config, "utf8"), beforeReceipt = await readFile(receipt);
    const plan = await runtime.prepare("codex", action); assert.equal(plan.status, "ready");
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    let held = false, withdrawn = false;
    const cancelled = new Error("the original account ended during the final receipt effect");
    const realRename = filesystem.rename.bind(filesystem), realRemove = filesystem.rm.bind(filesystem);
    t.mock.method(filesystem, "rename", async (source, target) => {
      await realRename(source, target);
      if (action === "connect" && String(target) === receipt && !held) {
        held = true; entered.resolve(); await release.promise;
      }
    });
    t.mock.method(filesystem, "rm", async (target, options) => {
      await realRemove(target, options);
      if (action === "remove" && String(target) === receipt && !held) {
        held = true; entered.resolve(); await release.promise;
      }
    });
    const pending = runtime.confirm({ runtime_id: "codex", plan_id: plan.plan_id, decision: "confirmed" }, () => { if (withdrawn) throw cancelled; });
    const rejected = assert.rejects(pending, error => error === cancelled);
    t.after(async () => { release.resolve(); await pending.catch(() => undefined); });
    await entered.promise;
    const effectReceipt = action === "connect" ? await readFile(receipt) : beforeReceipt;
    let replacementIdentity: Awaited<ReturnType<typeof filesystem.lstat>> | undefined;
    if (replacement) {
      const temporary = receipt + ".user-replacement";
      await writeFile(temporary, effectReceipt, { mode: 0o640 });
      await realRename(temporary, receipt);
      replacementIdentity = await filesystem.lstat(receipt);
    }
    withdrawn = true; release.resolve(); await rejected;
    assert.equal(await readFile(f.config, "utf8"), beforeConfig, "only this confirmation's config effect is restored");
    if (action === "connect") await assert.rejects(readlink(f.skill), { code: "ENOENT" });
    else assert.equal(await readlink(f.skill), f.skillSource);
    assert.deepEqual(await readFile(receipt), replacement ? effectReceipt : beforeReceipt);
    const finalReceipt = await filesystem.lstat(receipt);
    if (replacementIdentity) {
      assert.equal(finalReceipt.ino, replacementIdentity.ino, "CAS rollback cannot replace a later writer's identical receipt");
      assert.equal(finalReceipt.dev, replacementIdentity.dev); assert.equal(finalReceipt.mode, replacementIdentity.mode);
    } else assert.equal(finalReceipt.mode & 0o777, 0o600, "rollback preserves the prior receipt's permissions");
    assert.equal((await readdir(f.home)).includes("runtime-integration-attempts"), false, "a withdrawn confirmation records no new attempt");
  });
}
