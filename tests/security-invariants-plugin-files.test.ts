import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { filesProbe, filesProject, grantFiles } from "./fixtures/plugin-files.js";
import { PENDING, within } from "./fixtures/stopped-calls.js";

test("S-15 RAC-45 RAC-46 Home files preserve existing bytes and reopen; read never creates a directory and create never overwrites", async t => {
  const probe = filesProbe(), entry = { definition: probe.definition, files: probe.files };
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [entry] } });
  await grantFiles(host, probe);
  const directory = join(home, probe.files.store_name, "assets"), client = probe.client();
  assert.deepEqual(client.list(), []); assert.equal(client.read("absent.png"), null); assert.equal(existsSync(directory), false);
  mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, "existing.png"), Buffer.from([0, 255, 128, 40]));
  assert.deepEqual(client.read("existing.png"), Buffer.from([0, 255, 128, 40]));
  const caller = probe.caller(), action = host.homeActionClient();
  assert.equal(await action.invoke(caller, probe.create, { name: "new.bin", text: "原图" }), true);
  assert.equal(statSync(join(directory, "new.bin")).mode & 0o777, 0o600);
  await assert.rejects(action.invoke(caller, probe.create, { name: "new.bin", text: "overwrite" }), { code: "host.plugin_file_exists" });
  assert.equal(await action.invoke(caller, probe.readAction, { name: "new.bin" }), "原图");
  writeFileSync(join(directory, ".DS_Store"), "Finder metadata");
  assert.deepEqual(client.list(), ["existing.png", "new.bin"]);
  await host.close();
  // BL-411: the closed Home's client is refused and, outside every call, throws nothing: no bytes, not even null.
  assert.equal(client.read("existing.png"), undefined);
  const reopened = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [entry] } });
  try {
    await reopened.homePlugins!.ready();
    assert.deepEqual(probe.client().read("existing.png"), Buffer.from([0, 255, 128, 40]));
    assert.equal(Buffer.from(probe.client().read("new.bin")!).toString(), "原图");
    await reopened.homeActionClient().invoke(caller, probe.remove, { name: "new.bin" });
    await reopened.homeActionClient().invoke(caller, probe.remove, { name: "new.bin" });
    assert.equal(probe.client().read("new.bin"), null);
  } finally { await reopened.close(); }
});

test("S-15 RAC-47 private files refuse traversal, links, directories and oversized bytes while keeping outside data intact", async t => {
  const probe = filesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [{ definition: probe.definition, files: probe.files }] } });
  await grantFiles(host, probe);
  const client = probe.client(), directory = join(home, probe.files.store_name, "assets"), effect = { beforeEffect: async () => {} };
  const outside = join(home, "outside.txt"); writeFileSync(outside, "outside original");
  for (const name of ["../outside.txt", "/tmp/outside.txt", "folder/file", "folder\\file", ".hidden", "..", "", "x".repeat(201)]) {
    assert.throws(() => client.read(name), { code: "host.plugin_file_invalid" });
    await assert.rejects(client.create(effect, name, Buffer.from("write")), { code: "host.plugin_file_invalid" });
    await assert.rejects(client.remove(effect, name), { code: "host.plugin_file_invalid" });
  }
  assert.equal(existsSync(directory), false);
  await client.create(effect, "limit.bin", Buffer.alloc(64, 7));
  assert.deepEqual(client.read("limit.bin"), Buffer.alloc(64, 7));
  await assert.rejects(client.create(effect, "large.bin", Buffer.alloc(65)), { code: "host.plugin_file_large" });
  assert.equal(existsSync(join(directory, "large.bin")), false);
  writeFileSync(join(directory, "existing-large.bin"), Buffer.alloc(65));
  assert.throws(() => client.read("existing-large.bin"), { code: "host.plugin_file_large" });
  symlinkSync(outside, join(directory, "linked.bin")); mkdirSync(join(directory, "folder"));
  for (const name of ["linked.bin", "folder"]) {
    assert.throws(() => client.read(name), { code: "host.plugin_file_unsafe" });
    await assert.rejects(client.remove(effect, name), { code: "host.plugin_file_unsafe" });
    await assert.rejects(client.create(effect, name, Buffer.from("overwrite")), { code: "host.plugin_file_exists" });
  }
  assert.equal(readFileSync(outside, "utf8"), "outside original");
  const external = join(home, "external-assets"); mkdirSync(external); writeFileSync(join(external, "keep.bin"), "keep");
  rmSync(directory, { recursive: true }); symlinkSync(external, directory);
  assert.throws(() => client.list(), { code: "host.plugin_file_unsafe" });
  assert.throws(() => client.read("keep.bin"), { code: "host.plugin_file_unsafe" });
  await assert.rejects(client.create(effect, "write.bin", Buffer.from("write")), { code: "host.plugin_file_unsafe" });
  await assert.rejects(client.remove(effect, "keep.bin"), { code: "host.plugin_file_unsafe" });
  assert.equal(readFileSync(join(external, "keep.bin"), "utf8"), "keep"); assert.equal(existsSync(join(external, "write.bin")), false);
  rmSync(directory); rmSync(join(home, probe.files.store_name), { recursive: true });
  symlinkSync(external, join(home, probe.files.store_name));
  assert.throws(() => client.list(), { code: "host.plugin_file_unsafe" });
  await assert.rejects(client.create(effect, "write.bin", Buffer.from("write")), { code: "host.plugin_file_unsafe" });
});

test("S-18 RAC-46 RAC-48 accepted bytes do not change while authority waits and an asynchronous final guard is refused", async t => {
  const probe = filesProbe(), { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [{ definition: probe.definition, files: probe.files }] } });
  await grantFiles(host, probe);
  const entered = deferred(), release = deferred(), bytes = Buffer.from("original");
  const pending = probe.client().create({ beforeEffect: async () => { entered.resolve(); await release.promise; } }, "snapshot.bin", bytes);
  await entered.promise; bytes.fill(0); release.resolve(); await pending;
  assert.equal(Buffer.from(probe.client().read("snapshot.bin")!).toString(), "original");
  await assert.rejects(probe.client().create({ beforeEffect: async () => {}, assert_authority_current: async () => {} }, "async.bin", Buffer.from("refused")), /最终授权检查必须同步完成/u);
  assert.equal(probe.client().read("async.bin"), null);
});

test("S-15 RAC-45 the checked Host declaration cannot be retargeted after activation", async t => {
  const probe = filesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [{ definition: probe.definition, files: probe.files }] } });
  await grantFiles(host, probe);
  const outside = join(home, "outside", "assets"); mkdirSync(outside, { recursive: true }); writeFileSync(join(outside, "keep.bin"), "another owner");
  Object.assign(probe.files, { store_name: "outside", max_file_bytes: 1000, write_permission: probe.read });
  assert.equal(probe.client().read("keep.bin"), null);
  await probe.client().create({ beforeEffect: async () => {} }, "ours.bin", Buffer.from("ours"));
  assert.equal(readFileSync(join(home, "fileprobe", "assets", "ours.bin"), "utf8"), "ours");
  assert.equal(existsSync(join(outside, "ours.bin")), false);
  assert.equal(readFileSync(join(outside, "keep.bin"), "utf8"), "another owner");
});

for (const invalidation of ["cancel", "caller-revoke", "stop", "revoke", "restart", "close"] as const) {
  test(`S-18 RAC-48 ${invalidation} while file creation waits leaves no file or directory`, { timeout: 30_000 }, async t => {
    const probe = filesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [{ definition: probe.definition, files: probe.files }] } });
    const { platform, install } = await grantFiles(host, probe), old = probe.client(), entered = deferred(), release = deferred(), abort = new AbortController();
    let allowed = true;
    probe.behavior.beforeWrite = async caller => { entered.resolve(); await release.promise; await caller.beforeEffect(); };
    const pending = host.homeActionClient().invoke({ ...probe.caller(), signal: abort.signal,
      assert_authority_current: () => { if (!allowed) throw new ActionError("actions.forbidden", "caller was revoked"); } }, probe.create, { name: "late.bin", text: "late bytes" });
    const refused = assert.rejects(pending);
    try {
      await entered.promise;
      if (invalidation === "cancel") abort.abort();
      else if (invalidation === "caller-revoke") allowed = false;
      else if (invalidation === "close") await host.homePlugins!.close();
      else {
        await platform.runtime.stop(install.install_id);
        if (invalidation === "revoke") platform.runtime.grant(install.install_id, ["storage:private", probe.read]);
        if (invalidation === "restart") await platform.supervisor.restart(probe.id);
        // BL-411: outside every call the stopped activation's client is refused and throws nothing: the call never answers.
        assert.equal(await within(old.create({ beforeEffect: async () => {} }, "escaped.bin", Buffer.from("stale"))), PENDING);
      }
    } finally { release.resolve(); }
    await refused;
    assert.equal(existsSync(join(home, probe.files.store_name)), false, "refused work did not even create the owner's directory");
    if (invalidation !== "close") {
      probe.behavior.beforeWrite = caller => caller.beforeEffect();
      if (invalidation === "stop" || invalidation === "revoke") {
        platform.runtime.grant(install.install_id, probe.permissions); await platform.supervisor.restart(probe.id);
      }
      await host.homeActionClient().invoke(probe.caller(), probe.create, { name: "fresh.bin", text: "fresh" });
      assert.equal(readFileSync(join(home, probe.files.store_name, "assets", "fresh.bin"), "utf8"), "fresh");
      assert.equal(existsSync(join(home, probe.files.store_name, "assets", "late.bin")), false);
    }
  });
}

test("S-15 S-18 RAC-45 RAC-48 stop revokes files before awaiting plugin cleanup; reinstall never revives the old handle", async t => {
  const probe = filesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [{ definition: probe.definition, files: probe.files }] } });
  const { platform, install } = await grantFiles(host, probe), old = probe.client(), entered = deferred(), release = deferred();
  probe.behavior.stop = async () => { entered.resolve(); await release.promise; };
  const stopping = platform.runtime.stop(install.install_id);
  try {
    await entered.promise;
    assert.throws(() => old.list(), { code: "actions.forbidden" });
    await assert.rejects(old.create({ beforeEffect: async () => {} }, "stop.bin", Buffer.from("stop hook")), { code: "actions.forbidden" });
  } finally { release.resolve(); }
  await stopping;
  await platform.runtime.uninstall(install.install_id, { retain_private_data: true });
  const next = platform.runtime.install({ definition: probe.definition, deployment: "local", grants: ["storage:private", probe.read] }).install;
  await platform.runtime.start(next.install_id);
  assert.notEqual(next.installation_generation, install.installation_generation);
  // BL-411: outside every call the stopped activation's client is refused and throws nothing: the call never answers.
  assert.equal(await within(old.create({ beforeEffect: async () => {} }, "old.bin", Buffer.from("old"))), PENDING);
  await assert.rejects(probe.client().create({ beforeEffect: async () => {} }, "new.bin", Buffer.from("ungranted")), { code: "actions.forbidden" });
  assert.equal(existsSync(join(home, probe.files.store_name)), false);
});

test("S-18 RAC-48 the final synchronous caller check after authority returns refuses a revoked create and delete", async t => {
  const probe = filesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [{ definition: probe.definition, files: probe.files }] } });
  await grantFiles(host, probe);
  let allowed = true;
  const caller = { ...probe.caller(), assert_authority_current: () => { if (!allowed) throw new ActionError("actions.forbidden", "revoked after the wait"); } };
  await host.homeActionClient().invoke(caller, probe.create, { name: "keep.bin", text: "original" });
  probe.behavior.beforeWrite = async execution => { await execution.beforeEffect(); allowed = false; };
  for (const [definition, input] of [[probe.create, { name: "late.bin", text: "late" }], [probe.remove, { name: "keep.bin" }]] as const) {
    allowed = true;
    await assert.rejects(host.homeActionClient().invoke(caller, definition, input));
  }
  assert.equal(existsSync(join(home, probe.files.store_name, "assets", "late.bin")), false);
  assert.equal(readFileSync(join(home, probe.files.store_name, "assets", "keep.bin"), "utf8"), "original");
});

test("S-15 RAC-45 RAC-49 project Runtime uses the same file service and upgrade preflight has no files", async t => {
  const home = mkdtempSync(join(tmpdir(), "plugin-files-project-"));
  const probe = filesProbe("project-files", "project"), item = filesProject(home, probe);
  t.after(async () => { await item.close(); rmSync(home, { recursive: true, force: true }); });
  assert.deepEqual((await item.platform.start([{ definition: probe.definition, files: probe.files, bundled: true }])).running, [probe.id]);
  await item.client.invoke(probe.caller(item.projectId), probe.create, { name: "project.bin", text: "project bytes" });
  assert.equal(readFileSync(join(home, probe.files.store_name, "assets", "project.bin"), "utf8"), "project bytes");
  const old = probe.client(), next = filesProbe("project-files", "project", "1.1.0");
  await item.platform.upgrade(probe.id, next.definition);
  assert.equal(next.preflight.length, 1); assert.equal(next.preflight[0]!.services?.files, undefined);
  // BL-411: outside every call the replaced activation's client is refused and throws nothing: the call never answers, and no file is written.
  assert.equal(await within(old.create({ beforeEffect: async () => {} }, "old.bin", Buffer.from("old"))), PENDING);
  assert.equal(existsSync(join(home, probe.files.store_name, "assets", "old.bin")), false);
  assert.equal(next.contexts.at(-1)?.services?.files, undefined, "another definition with the same id cannot claim the old trusted entry");
});

test("S-15 RAC-45 a file service needs a trusted entry with its own registered directory, declared grants and a Home", async t => {
  for (const kind of ["owner", "missing", "no-home", "sandbox", "permission", "path", "size"] as const) {
    const home = mkdtempSync(join(tmpdir(), "plugin-files-declaration-")), probe = filesProbe("entry-files", "project");
    const item = filesProject(home, probe, { owner: kind === "owner" ? "another.owner" : undefined, unregistered: kind === "missing", withoutHome: kind === "no-home" });
    try {
      if (kind === "sandbox") probe.definition.execution = "sandbox";
      if (kind === "permission") probe.definition.manifest = { ...probe.definition.manifest, permissions: probe.definition.manifest.permissions.filter(p => p.permission !== probe.write) };
      const files = { ...probe.files, ...(kind === "path" ? { directory: "../outside" } : {}), ...(kind === "size" ? { max_file_bytes: 0 } : {}) };
      await assert.rejects(item.platform.start([{ definition: probe.definition, files }]));
      assert.equal(probe.contexts.length, 0); assert.equal(existsSync(join(home, probe.files.store_name)), false);
    } finally { await item.close(); rmSync(home, { recursive: true, force: true }); }
  }
  const plain = filesProbe("plain-files"), { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [plain.definition] } });
  await host.homePlugins!.ready();
  assert.equal(plain.contexts.at(-1)!.services?.files, undefined);
});
