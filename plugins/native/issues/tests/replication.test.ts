import assert from "node:assert/strict";
// Tests live with the Issue owner so the Host does not gain another plugin-specific assembly path.
import test, { type TestContext } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureStorageSpace, personalStorageSpace, type AggregateReplicaContext } from "@molis-ai/molis-work-storage";
import type { SyncEvent } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import { openPluginDatabase } from "@molis-ai/molis-work-app-local-host";
import { ISSUES_DATABASE, IssueStore, issuesManifest, openIssuesSyncStore } from "@molis-ai/molis-work-plugin-issues";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";

const caller = {
  actor_id: "alice", project_id: null, audience: "user" as const,
  permissions: ["issues:read", "issues:write"], beforeEffect: async () => {},
};

test("Issue owns its sync factory in the built-in plugin declaration", () => {
  const entry = BUILTIN_PLUGIN_CATALOG.find(row => row.manifest.plugin_id === issuesManifest.plugin_id);
  assert.equal(entry?.sync?.open, openIssuesSyncStore);
  assert.equal(entry?.sync?.scope, "home");
});

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "issues-sync-"));
  const homes = [join(root, "a"), join(root, "b")];
  const space = personalStorageSpace("http://127.0.0.1:8787", "work", "alice");
  homes.forEach(home => ensureStorageSpace(home, space));
  const connections = homes.map(home => openPluginDatabase(home, ISSUES_DATABASE, () => {}));
  const syncStores = homes.map(home => openIssuesSyncStore(home, "alice"));
  const stores = connections.map(connection => new IssueStore(connection.client, "alice"));
  const context: AggregateReplicaContext = {
    spaceId: space.spaceId, authorize() {}, canUploadProject: () => false,
    project: () => { throw new Error("Issue must not need a project"); }, hasArtifact: () => false,
  };
  const replicas = syncStores.map(store => store.replica(context));
  let revision = 0;
  const take = () => {
    const mutation = replicas[0]!.next();
    assert.ok(mutation);
    const event: SyncEvent = { ...mutation, revision: ++revision };
    replicas[0]!.receive(event);
    return event;
  };
  t.after(() => {
    connections.forEach(connection => connection.close());
    syncStores.forEach(store => store.close());
    rmSync(root, { recursive: true, force: true });
  });
  return { homes, stores, replicas, take };
}

test("Issue personal records transfer with identity, image data and editor CAS", async t => {
  const f = fixture(t), [a, b] = f.stores;
  const image = { name: "一像素.png", data_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7x8AAAAASUVORK5CYII=" };
  const original = await a!.create({ title: "显示问题", type: "bug", description: "窗口闪烁", images: [image] }, caller);
  const event = f.take();
  f.replicas[1]!.receive(event);
  const received = b!.read(original.id);
  assert.deepEqual(received.images, [image]);
  assert.equal(received.title, "显示问题");
  assert.ok(received.version > original.version);
  await assert.rejects(b!.update({ id: original.id, expected_version: original.version, title: "旧草稿" }, caller), /已被其他窗口修改/);
  assert.equal(f.replicas[1]!.next(), null);
});

test("Issue deletion and malformed payload are isolated to the authenticated owner", async t => {
  const f = fixture(t), [a, b] = f.stores;
  const original = await a!.create({ title: "第一条", type: "experience", description: "原文" }, caller);
  const event = f.take();
  f.replicas[1]!.receive(event);
  const bad = structuredClone(event.value) as { record: Record<string, unknown> };
  bad.record.submitter_id = "another-user";
  f.replicas[1]!.receive({ ...event, operationId: "forged", revision: 2, value: bad });
  assert.equal(b!.read(original.id).submitter_id, "alice");
  assert.equal(f.replicas[1]!.counts().conflicts, 1);
  await a!.delete({ id: original.id, expected_version: original.version }, caller);
  const deleted = f.take();
  assert.equal(deleted.value, null);
  f.replicas[1]!.receive({ ...deleted, revision: 3 });
  f.replicas[1]!.resolve(f.replicas[1]!.conflicts()[0]!.key, "remote");
  assert.throws(() => b!.read(original.id), /不存在/);
});

test("oversized inline Issue image stays local instead of being truncated", async t => {
  const f = fixture(t), a = f.stores[0]!;
  const png = Buffer.alloc(420 * 1024);
  Buffer.from("89504e470d0a1a0a0000000d494844520000000100000001", "hex").copy(png);
  const data_url = "data:image/png;base64," + png.toString("base64");
  const issue = await a.create({ title: "大截图", type: "bug", description: "保留原图",
    images: [{ name: "截图.png", data_url }] }, caller);
  assert.throws(() => f.replicas[0]!.next(), /512 KiB/);
  assert.equal(a.read(issue.id).images[0]?.data_url, data_url);
  assert.equal(f.replicas[0]!.counts().pending, 1);
});
