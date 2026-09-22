import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { PluginRuntime, PluginRuntimeError, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { createGithubIntegrationPlugin } from "@molis-ai/molis-work-integration-github";
import type { PluginPrivateStorage, PluginDefinition, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";

test("Plugin private storage persists opaque values, isolates signatures and rejects revoked or missing grants", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-private-"));
  const file = join(directory, "private.db");
  let db = new Database(file);
  let owner = new SqlitePluginPrivateStorage(db);
  const base = createGithubIntegrationPlugin({ provider: {
    type: "fixture", async health() { return { ok: true, status: "connected", message: "ready" }; },
    async sync() { return { ok: true, mode: "fixture", items: [], cursor: null }; },
  } });
  async function install(signature: string, grant = true) {
    const runtime = new PluginRuntime();
    let storage!: PluginPrivateStorage;
    const manifest = { ...base.manifest, publisher: { ...base.manifest.publisher, signature },
      permissions: [...base.manifest.permissions,
        { permission: "storage:private", required: false, reason: "Keep personal notes locally" }] };
    const definition: PluginDefinition = { manifest, async start(context) {
      storage = owner.forPlugin(context, manifest);
      return base.start(context);
    } };
    const result = runtime.install({ definition, deployment: "local",
      grants: ["network:github.com", "secret:github", ...(grant ? ["storage:private"] : [])] });
    await runtime.start(result.install.install_id);
    return { runtime, storage, installId: result.install.install_id };
  }
  try {
    const original = await install("publisher-one");
    const other = await install("publisher-two");
    const denied = await install("publisher-one", false);
    const value = JSON.stringify({ note: "一条私人记录", custom: ["'", "<p>", null, 17] });
    original.storage.set("../../outside", value);
    assert.equal(original.storage.get("../../outside"), value);
    assert.equal(existsSync(join(directory, "outside")), false, "keys are data, not file paths");
    assert.equal(other.storage.get("../../outside"), null);
    other.storage.set("../../outside", "different publisher");
    assert.throws(() => denied.storage.get("../../outside"), (error: unknown) => error instanceof PluginRuntimeError
      && error.code === "plugin_grant_denied");
    assert.throws(() => denied.storage.set("../../outside", "overwrite"), PluginRuntimeError);
    assert.equal(original.storage.get("../../outside"), value);
    await original.runtime.uninstall(original.installId);
    assert.throws(() => original.storage.set("../../outside", "stale"), PluginRuntimeError);
    db.close();
    db = new Database(file);
    owner = new SqlitePluginPrivateStorage(db);
    const recovered = await install("publisher-one");
    assert.equal(recovered.installId, original.installId);
    assert.equal(recovered.storage.get("../../outside"), value);
    assert.equal(recovered.storage.delete("absent"), false);
    assert.equal(recovered.storage.delete("../../outside"), true);
    assert.equal(recovered.storage.get("../../outside"), null);
    const stillOther = await install("publisher-two");
    assert.equal(stillOther.storage.get("../../outside"), "different publisher");
    await stillOther.runtime.uninstall(stillOther.installId, { retain_private_data: false });
    owner.deleteInstallationData(stillOther.installId);
    const cleared = await install("publisher-two");
    assert.equal(cleared.storage.get("../../outside"), null);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("Host explicitly replaces an inactive plugin version without losing private drafts", async () => {
  const { MemoryPluginRuntimeRepository } = await import("@molis-ai/molis-work-plugin-runtime");
  const repository = new MemoryPluginRuntimeRepository();
  const db = new Database(":memory:");
  const owner = new SqlitePluginPrivateStorage(db);
  const base = createGithubIntegrationPlugin({ provider: {
    type: "fixture", async health() { return { ok: true, status: "connected", message: "ready" }; },
    async sync() { return { ok: true, mode: "fixture", items: [], cursor: null }; },
  } });
  let storage!: PluginPrivateStorage;
  const make = (version: string): PluginDefinition => {
    const manifest = { ...base.manifest, version, permissions: [...base.manifest.permissions,
      { permission: "storage:private", required: true, reason: "Save drafts" }] };
    return { manifest, async start(context) { storage = owner.forPlugin(context, manifest); return base.start(context); } };
  };
  const old = make("1.0.0"), next = make("1.1.0");
  const grants = ["network:github.com", "secret:github", "storage:private"];
  try {
    const runtime = new PluginRuntime(repository);
    const first = runtime.install({ definition: old, deployment: "local", grants });
    await runtime.start(first.install.install_id);
    storage.set("draft:one", "未发送的需求");
    assert.throws(() => runtime.install({ definition: next, deployment: "local", grants, replace_version: true }), /先停止/);
    await runtime.stop(first.install.install_id);
    const restarted = new PluginRuntime(repository);
    assert.throws(() => restarted.install({ definition: next, deployment: "local", grants }), /递增版本/);
    const changed = restarted.install({ definition: next, deployment: "local", grants, replace_version: true });
    assert.equal(changed.install.install_id, first.install.install_id);
    assert.equal(changed.install.version, "1.1.0");
    await restarted.start(changed.install.install_id);
    assert.equal(storage.get("draft:one"), "未发送的需求");
    const freshRuntime = new PluginRuntime(repository);
    const sameVersionChanged = { ...next, manifest: { ...next.manifest, name: "Different same-version manifest" } };
    assert.throws(() => freshRuntime.install({ definition: sameVersionChanged, deployment: "local", grants, replace_version: true }), /递增版本/);
    await restarted.stop(changed.install.install_id);
  } finally { db.close(); }
});


test("persisted running state rehydrates a plugin contribution after process restart", async () => {
  const { MemoryPluginRuntimeRepository } = await import("@molis-ai/molis-work-plugin-runtime");
  const repository = new MemoryPluginRuntimeRepository();
  const { createCodingPlugin } = await import("@molis-ai/molis-work-plugin-coding");
  const definition = createCodingPlugin();
  const first = new PluginRuntime(repository);
  const installed = first.install({definition,deployment:"local",grants:["artifact:read","artifact:write","storage:private"]});
  await first.start(installed.install.install_id);
  // A new Runtime models a new process; the database still records running.
  const reopened = new PluginRuntime(repository);
  const replayedInstall = reopened.install({definition,deployment:"local",grants:["artifact:read","artifact:write","storage:private"]});
  assert.equal(replayedInstall.replayed,true);
  assert.equal(reopened.contribution(installed.install.install_id),null);
  const started = await reopened.start(installed.install.install_id);
  assert.equal(started.replayed,false);
  assert.equal(reopened.contribution(installed.install.install_id)?.kind,"app");
  assert.equal((await reopened.start(installed.install.install_id)).replayed,true);
  await reopened.stop(installed.install.install_id);
});

test("atomic private storage rejects stale writers across connections without overwriting the winner", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-cas-"));
  const file = join(directory, "private.db");
  const firstDb = new Database(file), secondDb = new Database(file);
  let permitted = true;
  const manifest = {plugin_id:"io.molis.work.storage-test",version:"1.0.0",
    permissions:[{permission:"storage:private",required:true,reason:"test"}]} as PluginManifest;
  const context = {plugin_id:manifest.plugin_id,version:manifest.version,install_id:"one",
    requireGrant(){if(!permitted)throw new Error("revoked");}} as unknown as PluginStartContext;
  try {
    const owner = new SqlitePluginPrivateStorage(firstDb);
    const first = owner.forPlugin(context, manifest);
    const second = new SqlitePluginPrivateStorage(secondDb).forPlugin(context, manifest);
    const other = owner.forPlugin({...context,install_id:"another"}, manifest);
    assert.equal(typeof first.compareAndSet, "function", "host must provide atomic comparison, not get then set");
    assert.equal(first.compareAndSet!("state", null, "revision-one"), true);
    assert.equal(second.compareAndSet!("state", null, "overwrite"), false);
    const stale = second.get("state");
    assert.equal(first.compareAndSet!("state", "revision-one", "revision-two"), true);
    assert.equal(second.compareAndSet!("state", stale, "lost-update"), false);
    assert.equal(second.get("state"), "revision-two");
    assert.equal(other.compareAndSet!("state", null, "another-install"), true);
    assert.equal(first.get("state"), "revision-two");
    assert.throws(() => first.compareAndSet!("", null, "invalid"));
    assert.throws(() => first.compareAndSet!("state", undefined as unknown as string, "invalid"));
    assert.throws(() => first.compareAndSet!("state", "revision-two", null as unknown as string));
    permitted = false;
    assert.throws(() => first.compareAndSet!("state", "revision-two", "revoked-write"), /revoked/);
    permitted = true;
    assert.equal(second.get("state"), "revision-two");
    assert.equal(first.compareAndSet!("empty-string", null, ""), true);
    assert.equal(second.compareAndSet!("empty-string", "", "updated"), true);
  } finally { firstDb.close(); secondDb.close(); rmSync(directory, {recursive:true,force:true}); }
});
