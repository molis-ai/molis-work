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
import { WORK_BRIEF_PLUGIN_ID } from "@molis-ai/molis-work-plugin-work-brief";
import { dualPlugin } from "./fixtures/dual-plugin.js";
import { MolisWorkLocalHost, projectActionAvailability } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { grantHomeProbe, homeProbe, person, serveHomeRuntime } from "./fixtures/home-runtime.js";

const runtimePath = (home: string) => join(home, "plugin-runtime", "plugin-runtime.db");
function readStore(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return { version: db.prepare("PRAGMA user_version").get()!.user_version, schema: describeSqliteSchema(db),
    installs: db.prepare("SELECT install_id, record_json FROM plugin_runtime_installs ORDER BY install_id").all(),
    releases: db.prepare("SELECT * FROM plugin_runtime_release_artifacts ORDER BY plugin_id").all() }; }
  finally { db.close(); }
}

// RAC-2365 RAC-2367 W3-06-F-05: independent current-schema facts at a wrong version or with KV removed; no historical DDL.
async function rejectedStore(version: 1 | 2) {
  const home = await mkdtemp(join(tmpdir(), "home-runtime-version-"));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  await mkdir(join(home, "plugin-runtime"));
  const db = new DatabaseSync(runtimePath(home));
  try {
    db.exec(await readFile(new URL("./fixtures/home-store-schemas/plugin-runtime.sql", import.meta.url), "utf8"));
    db.prepare("INSERT INTO plugin_runtime_installs (install_id, record_json, publisher_trust) VALUES (?,?,?)").run("original-install", JSON.stringify({ plugin_id: "example.retained", install_id: "original-install",
      installation_generation: "original-generation", grants: ["storage:private", "retained:read"], state: "installed", version: "1.0.0", publisher_trust: "unsigned" }), "unsigned");
    db.prepare("INSERT INTO plugin_runtime_release_artifacts VALUES (?,?,?,?,?)").run("example.retained", "original-publisher", "1.0.0", "original-digest", "{\"module_source\":\"original release\"}");
    if (version === 1) db.exec("DROP TABLE plugin_private_values");
    db.exec(`PRAGMA user_version = ${version}`);
  } finally { db.close(); }
  return home;
}

for (const version of [2, 1] as const) {
  test(`W3-06-F-05 W3-06-F-08 RAC-402 RAC-404 Home ${version === 2 ? "wrong-version 2" : "incomplete current 1"} refuses Goals authority intact while its recovery page opens`, { timeout: 60_000 }, async t => {
    const home = await rejectedStore(version), before = readStore(runtimePath(home));
    const beforeBytes = await readFile(runtimePath(home));
    const { host, project, request } = await serveHomeRuntime(t, { homeDirectory: home,
      actionAvailability: projectActionAvailability((options, operation) => withCatalog(options, operation), home) });
    const withCatalog = host.configurePersonalPlanning(home, withMolisWorkProjectCatalog);
    const first = host.homePlugins!.ready();
    const refusal = version === 2 ? { code: "storage.store_too_new" } : { code: "actions.execution_failed" };
    await assert.rejects(first, refusal);
    assert.equal(host.homePlugins!.ready(), first, "ordinary preparation keeps the failure and never retries");
    const one = await project("A broken Home has a recovery page");
    // The stopped Runtime registered no Goals action. Public discovery stays available (W3-06-F-08): since 44B no plugin is always on,
    // so what a project offers no longer waits on the damaged Home ledger.
    const client = host.actionClient(one.reference, false), caller = person(["goals:read"], one.project_id);
    await assert.rejects(client.invoke(caller, goalsActions.snapshot, {}), { code: "actions.missing" });
    await assert.doesNotReject(client.discover(caller));
    const page = await request(`/projects/${one.project_id}`, { headers: { accept: "text/html" } });
    assert.equal(page.status, 200, await page.clone().text());
    assert.match(page.headers.get("content-type") ?? "", /^text\/html\b/iu);
    const html = await page.text();
    assert.equal(html.match(/<!doctype html>/giu)?.length, 1, "one Host document owns the failure response");
    assert.equal(html.match(/<html[\s>]/giu)?.length, 1);
    assert.equal(html.match(/<body[\s>]/giu)?.length, 1);
    assert.match(html, /<body\b[^>]*\bdata-home-plugin-store-unavailable\b/iu);
    assert.deepEqual(pluginDocuments(html), [], "the recovery Host must not carry a plugin's separate document");
    assert.doesNotMatch(html, /<(?:iframe|object|embed)\b|\bsrcdoc\s*=/iu, "no plugin page is mounted inside the recovery document");
    assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/iu, "only the inline Host theme/desktop bootstrap may run");
    assert.doesNotMatch(html, /\btarget\s*=\s*["']?_blank\b|\bwindow\s*\.\s*open\s*\(/iu, "recovery stays in the current Host page");
    assert.doesNotMatch(html, /id="molis-work-data"/u, "the failure response has no Goals snapshot");
    assert.match(html, /data-home-plugin-unavailable/u);
    assert.match(html, /查看插件状态/u);
    assert.match(html, /Home 插件运行库不可用/u);
    // A Home plugin's own entry (Work Brief's Home half; Issues runs in partitions since batch 108) keeps its own failure.
    const own = await request(`/api/plugins/${WORK_BRIEF_PLUGIN_ID}/enable`, { method: "POST", body: {} });
    assert.equal(own.status, 503, "the unavailable Home entry keeps its own failure");
    assert.deepEqual(readStore(runtimePath(home)), before, "no installs, grants, generations, releases, version or schema were changed");
    assert.deepEqual(await readFile(runtimePath(home)), beforeBytes, "rendering leaves the bad ledger bytes intact");
    assert.equal(host.homePlugins!.ready(), first);
    const retry = host.homePlugins!.retry();
    assert.equal(host.homePlugins!.retry(), retry, "explicit concurrent retries share one attempt");
    await assert.rejects(retry, refusal);
    assert.deepEqual(readStore(runtimePath(home)), before);
    assert.deepEqual(await readFile(runtimePath(home)), beforeBytes, "explicit refusal retry also leaves the ledger bytes intact");
  });
}

// Since batch 108 the Home stage on a project page is a dual-instance plugin's whose view is in its Home half (no personal plugin draws one).
test("W5-01-HOME-STAGE-01 Home stage remains single through Runtime disable and re-enable", { timeout: 60_000 }, async t => {
  const probe = dualPlugin("singlehomestage");
  const { host, project, request } = await serveHomeRuntime(t, { pluginFixtures: { home: [{ definition: probe.home, dual_instance: true }], project: [probe.project] } });
  const one = await project("Home stage has one Runtime owner");
  const platform = await host.homePlugins!.ready();
  const install = host.homePlugins!.installation(probe.id)!;
  // One stage either way: the Home half's view while it runs, its placeholder while it does not.
  const id = probe.id.replaceAll(".", "\\.");
  const stage = new RegExp(`<section\\b[^>]*(?:\\bdata-plugin-owner="${id}"[^>]*\\bdata-plugin-slot="workbench\\.main"|data-work-surface="${id}"[^>]*data-home-plugin-unavailable)`, "gu");
  const page = async () => {
    const response = await request(`/projects/${one.project_id}`);
    assert.equal(response.status, 200, await response.clone().text());
    const html = await response.text();
    assert.equal([...html.matchAll(stage)].length, 1);
    return html;
  };
  assert.doesNotMatch(await page(), /data-home-plugin-unavailable/u);
  platform.supervisor.revoke(probe.id);
  await platform.runtime.stop(install.install_id);
  assert.match(await page(), /data-home-plugin-unavailable/u);
  await platform.supervisor.enable(probe.id);
  assert.doesNotMatch(await page(), /data-home-plugin-unavailable/u);
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
  // D0151/D0304: a closed owner refuses reads; an empty list would misreport unavailable facts as no installations.
  assert.throws(() => host.homePlugins!.installations(), { code: "actions.plugin_unavailable", message: "Home 插件宿主已关闭" });
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
  const probe = homeProbe(), next = homeProbe("homeprobe", "1.1.0");
  // The test acts as the Host's code: the candidate is the one other object admitted to the process (S-75 ⑥).
  const { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition], installed: new Set([next.definition]) } });
  const { platform, install } = await grantHomeProbe(host, probe);
  probe.contexts.at(-1)!.services!.storage!.set("draft", "original draft");
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
