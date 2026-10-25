import { pluginDocuments } from "./fixtures/plugin-documents.js";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginUpgradeContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { ISSUES_PLUGIN_ID } from "@molis-ai/molis-work-plugin-issues";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { grantHomeProbe, homeProbe, person, serveHomeRuntime } from "./fixtures/home-runtime.js";

const runtimePath = (home: string) => join(home, "plugin-runtime", "plugin-runtime.db");
function readStore(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return { version: db.prepare("PRAGMA user_version").get()!.user_version, schema: describeSqliteSchema(db),
    installs: db.prepare("SELECT install_id, record_json FROM plugin_runtime_installs ORDER BY install_id").all(),
    releases: db.prepare("SELECT * FROM plugin_runtime_release_artifacts ORDER BY plugin_id").all() }; }
  finally { db.close(); }
}

// W3-06-F-05: independent nonempty v1 facts, also used to label a damaged v3 that lacks KV. No production baseline constructs the fixture.
async function rejectedStore(version: 1 | 3) {
  const home = await mkdtemp(join(tmpdir(), "home-runtime-version-"));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  await mkdir(join(home, "plugin-runtime"));
  const db = new DatabaseSync(runtimePath(home));
  try {
    db.exec(await readFile(new URL("./fixtures/home-store-schemas/plugin-runtime-v1.sql", import.meta.url), "utf8"));
    db.prepare("INSERT INTO plugin_runtime_installs VALUES (?,?)").run("original-install", JSON.stringify({ plugin_id: "example.old", install_id: "original-install",
      installation_generation: "original-generation", grants: ["storage:private", "old:read"], state: "installed", version: "1.0.0" }));
    db.prepare("INSERT INTO plugin_runtime_release_artifacts VALUES (?,?,?,?,?)").run("example.old", "original-publisher", "1.0.0", "original-digest", "{\"module_source\":\"original release\"}");
    if (version === 3) db.exec("PRAGMA user_version = 3");
  } finally { db.close(); }
  return home;
}

for (const version of [1, 3] as const) {
  test(`W3-06-F-05 W3-06-F-08 Home ${version === 1 ? "v1" : "incomplete v3"} is refused intact while Goals remains usable`, { timeout: 60_000 }, async t => {
    const home = await rejectedStore(version), before = readStore(runtimePath(home));
    const { host, project, request } = await serveHomeRuntime(t, { homeDirectory: home });
    const first = host.homePlugins!.ready();
    const refusal = version === 1 ? { code: "storage.schema_version_mismatch" } : { code: "actions.execution_failed" };
    await assert.rejects(first, refusal);
    assert.equal(host.homePlugins!.ready(), first, "ordinary preparation keeps the failure and never retries");
    const one = await project("Goals survives a broken Home runtime");
    const snapshot = await host.actionClient(one.reference).invoke(person(["goals:read"], one.project_id), goalsActions.snapshot, {});
    assert.ok(snapshot && typeof snapshot === "object");
    const page = await request(`/projects/${one.project_id}`);
    assert.equal(page.status, 200, await page.clone().text());
    const html = await page.text();
    assert.equal([...html.matchAll(/data-work-surface="issues"/gu)].length, 1, "the unavailable Runtime stage owns the only Issues page");
    assert.doesNotMatch(html, /<form\b[^>]*\bdata-issue-composer\b/u, "Manifest fallback must not revive the unavailable plugin");
    assert.match(html, /data-home-plugin-unavailable/u);
    assert.match(html, /查看插件状态/u);
    const own = await request(`/api/plugins/${ISSUES_PLUGIN_ID}/state`);
    assert.equal(own.status, 503, "the unavailable Home entry keeps its own failure");
    assert.deepEqual(readStore(runtimePath(home)), before, "no installs, grants, generations, releases, version or schema were changed");
    assert.equal(host.homePlugins!.ready(), first);
    const retry = host.homePlugins!.retry();
    assert.equal(host.homePlugins!.retry(), retry, "explicit concurrent retries share one attempt");
    await assert.rejects(retry, refusal);
    assert.deepEqual(readStore(runtimePath(home)), before);
  });
}

test("W5-01-HOME-STAGE-01 Home stage remains single through Runtime disable and re-enable", { timeout: 60_000 }, async t => {
  const { host, project, request } = await serveHomeRuntime(t);
  const one = await project("Home stage has one Runtime owner");
  const platform = await host.homePlugins!.ready();
  const install = host.homePlugins!.installation(ISSUES_PLUGIN_ID)!;
  const page = async () => {
    const response = await request(`/projects/${one.project_id}`);
    assert.equal(response.status, 200, await response.clone().text());
    const html = await response.text();
    assert.equal([...html.matchAll(/data-work-surface="issues"/gu)].length, 1);
    return html + pluginDocuments(html).join("");
  };
  assert.match(await page(), /<form\b[^>]*\bdata-issue-composer\b/u);
  platform.supervisor.revoke(ISSUES_PLUGIN_ID);
  await platform.runtime.stop(install.install_id);
  const unavailable = await page();
  assert.match(unavailable, /data-home-plugin-unavailable/u);
  assert.doesNotMatch(unavailable, /<form\b[^>]*\bdata-issue-composer\b/u);
  await platform.supervisor.enable(ISSUES_PLUGIN_ID);
  assert.match(await page(), /<form\b[^>]*\bdata-issue-composer\b/u);
});

test("W3-06-F-04 Home KV survives shutdown, isolates installs and rejects an interleaved stale update from another connection", { timeout: 60_000 }, async t => {
  const first = homeProbe("firstkv"), other = homeProbe("otherkv");
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [first.definition, other.definition] } });
  await host.homePlugins!.ready();
  const initial = first.contexts.at(-1)!, a = initial.services!.storage!, b = other.contexts.at(-1)!.services!.storage!;
  a.set("draft", "未发送的原文"); b.set("draft", "另一安装的原文");
  assert.equal(a.get("draft"), "未发送的原文"); assert.equal(b.get("draft"), "另一安装的原文");
  const connection = new DatabaseSync(runtimePath(home));
  try {
    const second = new SqlitePluginPrivateStorage(connection).forPlugin(initial, first.definition.manifest);
    assert.equal(a.compareAndSet!("revision", null, "v1"), true);
    // Both real connections read v1 before either attempt writes. The first update wins; the interleaved stale update cannot overwrite it.
    const fromA = a.get("revision"), fromB = second.get("revision");
    assert.equal(a.compareAndSet!("revision", fromA, "from-a"), true);
    assert.equal(second.compareAndSet!("revision", fromB, "from-b"), false);
    assert.equal(second.get("revision"), "from-a");
  } finally { connection.close(); }
  await host.homePlugins!.close();
  // BL-411: outside every call a handle kept after close is refused and does nothing; the restart below reads the draft unchanged.
  assert.equal(a.set("draft", "after close"), undefined);
  assert.equal(a.get("draft"), undefined, "it reads nothing either, though the draft is there");
  assert.equal(host.homePlugins!.installations().length, 0);
  // Opening another Host is allowed only after the old execution owner has closed.
  await host.close();
  const restarted = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [first.definition, other.definition] } });
  try {
    await restarted.homePlugins!.ready();
    assert.equal(first.contexts.at(-1)!.services!.storage!.get("draft"), "未发送的原文");
    assert.equal(other.contexts.at(-1)!.services!.storage!.get("draft"), "另一安装的原文");
    assert.equal(restarted.homePlugins!.installation(first.id)!.state, "running", "normal shutdown preserved enabled intent");
  } finally { await restarted.close(); }
});

test("W3-06-F-04 candidate preflight is read-only and failed startup restores the original Home KV", { timeout: 60_000 }, async t => {
  const probe = homeProbe(), { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const { platform, install } = await grantHomeProbe(host, probe);
  probe.contexts.at(-1)!.services!.storage!.set("draft", "original draft");
  const next = homeProbe("homeprobe", "1.1.0");
  let checked: PluginUpgradeContext["services"];
  next.definition.validateUpgrade = async ({ context }) => { checked = context.services; assert.equal(context.services!.storage!.get("draft"), "original draft"); };
  next.definition.start = async context => { context.services!.storage!.set("draft", "candidate corruption"); throw new Error("candidate failed"); };
  await assert.rejects(platform.runtime.upgrade({ install_id: install.install_id, definition: next.definition, grants: probe.permissions }), /启动失败/u);
  assert.deepEqual(Object.keys(checked!).sort(), ["storage"]);
  assert.deepEqual(Object.keys(checked!.storage!).sort(), ["get"]);
  assert.equal(platform.runtime.get(install.install_id).version, "1.0.0");
  assert.equal(platform.runtime.get(install.install_id).state, "running");
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("draft"), "original draft");
});
