import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createDiffPlugin } from "@molis-ai/molis-work-plugin-diff";
import { createCodingPlugin } from "@molis-ai/molis-work-plugin-coding";
import { PluginRuntime, SqlitePluginRuntimeRepository, pluginManifestDigest } from "@molis-ai/molis-work-plugin-runtime";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

for (const quarantined of [false, true]) test(`authorized retry restores an older Coding install (quarantined=${quarantined}) without upgrading`, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "compatible-recovery-http-"));
  const token = "compatible-recovery-fixture-control-token";
  const server = createMolisWorkWebServer({ homeDirectory: root, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const request = (url: string, method = "GET", body?: unknown, authorized = true) => fetch(origin + url, {
    method, headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(),
      ...(authorized ? { "x-molis-work-control-token": token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let db: Database.Database | undefined;
  try {
    const created = await request("/api/settings/projects", "POST", { display_name: "Recovery", user_confirmed: true });
    assert.equal(created.status, 201);
    const projectId = (await created.json()).project.project_id;
    assert.equal((await request(`/api/settings/projects/${projectId}/plugins`, "POST", { plugin_id: "coding" })).status, 200);
    db = new Database(path.join(root, "projects", projectId, "molis-work.db"));
    const repository = new SqlitePluginRuntimeRepository(db);
    const oldRuntime = new PluginRuntime(repository, undefined, { maxRecoveryAttempts: 1 });
    const currentDiff = createDiffPlugin();
    const diff = { ...currentDiff, manifest: { ...currentDiff.manifest, version: "1.3.1" } };
    const diffInstall = oldRuntime.install({ definition: diff, deployment: "local", grants: ["artifact:read"] }).install;
    // A persisted install from before the port spelling was corrected. The old
    // spelling is no longer admitted for new installs by the current parser.
    const legacyDiff = JSON.parse(JSON.stringify(diff.manifest).replaceAll("git-changeset", "git_changeset"));
    delete legacyDiff.upgrade_compatibility;
    repository.save({ ...diffInstall, manifest_digest: pluginManifestDigest(legacyDiff) });
    const current = createCodingPlugin();
    const old = { ...current, async start(): Promise<never> { throw new Error("fixture startup failure"); }, manifest: { ...current.manifest, version: "1.30.0", upgrade_compatibility: undefined } };
    const installed = oldRuntime.install({ definition: old, deployment: "local", grants: old.manifest.permissions.map(p => p.permission) }).install;
    await assert.rejects(oldRuntime.start(installed.install_id), /Plugin entrypoint 启动失败/);
    if (quarantined) await assert.rejects(oldRuntime.recover(installed.install_id), /已隔离/);
    const base = `/projects/${projectId}`;
    const ordinaryRetry = `${base}/api/plugins/io.molis.work.coding/restart`;
    const retry = quarantined ? `${base}/api/plugins/io.molis.work.coding/release-quarantine` : ordinaryRetry;
    assert.match(await (await request(base)).text(), /Plugin 当前状态 (crashed|quarantined) 不能直接启动/);
    assert.equal((await request(retry, "POST", {}, false)).status, 403);
    assert.equal((await request(retry)).status, 405);
    if (quarantined) assert.equal((await request(ordinaryRetry, "POST", {})).status, 409);
    assert.equal(repository.get(installed.install_id)!.state, quarantined ? "quarantined" : "crashed");
    const recovered = await request(retry, "POST", {});
    assert.equal(recovered.status, 200, await recovered.text());
    const record = repository.get(installed.install_id)!;
    assert.equal(record.state, "running");
    assert.equal(record.recovery_count, quarantined ? 0 : 1);
    assert.equal(record.version, "1.30.0");
    assert.equal(record.manifest_digest, installed.manifest_digest);
    assert.deepEqual(record.grants, installed.grants);
    assert.equal((await request(`${base}/api/plugins/io.molis.work.coding/release-quarantine`, "POST", {})).status, 409);
    assert.equal(repository.get(installed.install_id)!.state, "running");
    const diffResponse = await request(`${base}/api/plugins/io.molis.work.diff/state`);
    assert.equal(diffResponse.status, 200, await diffResponse.text());
    assert.equal(repository.get(diffInstall.install_id)!.version, "1.3.1");
    assert.equal(repository.get(diffInstall.install_id)!.manifest_digest, pluginManifestDigest(legacyDiff));
    const html = await (await request(base)).text();
    assert.doesNotMatch(html, /请检查插件状态后重新打开/);
    assert.match(html, /data-coding/);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db?.close();
    await rm(root, { recursive: true, force: true });
  }
});
