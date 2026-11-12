import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { describePluginTablesRefusal, describeUnavailable, diagnosticId, homeUpgradeDescriptors, upgradeRefusal } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG, hostSettingsSectionLabel, renderOwnerUnavailableCard, type OwnerUnavailableReason } from "@molis-ai/molis-work-app-workbench";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { sqliteVersionRefusal } from "@molis-ai/molis-work-storage";
import { installTextForTest, parseLocalePack } from "@molis-ai/molis-work-plugin-sdk/ui";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

/** The workbench's own words, for the tests that draw or name a part outside a page. */
function withWorkbenchText(t: { after(fn: () => void): void }) {
  const file = new URL("../apps/workbench/resources/locales/zh.json", import.meta.url);
  const pack = parseLocalePack(readFileSync(file, "utf8"), { file: file.pathname });
  assert.ok(pack.ok);
  t.after(installTextForTest({ locale: "zh", packs: [pack.value] }));
}

// upgrade-continuity U3 (specs/upgrade-continuity/owner-isolation-and-rollback-design.md §2): a store an upgrade left behind stops only
// its own part, which says so in place, with the ways out; everything else keeps working.

const DIAGNOSTIC = /^D-[0-9A-F]{8}$/u;

test("UPG3-01 every store and file of the Home names the part it stops, in words the settings and plugins already use", t => {
  withWorkbenchText(t);
  const plugins = new Set(BUILTIN_PLUGIN_CATALOG.map(entry => entry.manifest.plugin_id));
  for (const descriptor of homeUpgradeDescriptors()) {
    const { block } = descriptor;
    assert.ok(block, `${descriptor.pattern} names no part`);
    if (block.kind === "setting") assert.ok(hostSettingsSectionLabel(block.page), `${descriptor.pattern} names settings page ${block.page}, which the settings do not have`);
    if (block.kind === "plugin") assert.ok(plugins.has(block.plugin_id), `${descriptor.pattern} names plugin ${block.plugin_id}, which the build does not ship`);
  }
  assert.ok(homeUpgradeDescriptors().some(descriptor => descriptor.block.kind === "projects"), "the catalog stops the project list");
});

test("UPG3-04 the diagnostic number is the same for one store in one round, another in the next, and carries no path", async t => {
  const home = await mkdtemp(join(tmpdir(), "owner-unavailable-")); t.after(() => rm(home, { recursive: true, force: true }));
  const catalog = join("projects", "catalog.db");
  const owner = describeUnavailable(home, { code: "storage.upgrade_failed", path: catalog });
  assert.deepEqual(owner && { block: owner.block, reason: owner.reason, project_id: owner.project_id }, { block: { kind: "projects" }, reason: "upgrade_failed", project_id: null });
  assert.match(owner.diagnostic_id, DIAGNOSTIC);
  assert.equal(owner.diagnostic_id, diagnosticId("none", catalog), "a store the record has no unit for is named under round none");
  assert.equal(describeUnavailable(home, { code: "storage.upgrade_failed", path: catalog })?.diagnostic_id, owner.diagnostic_id);
  assert.notEqual(diagnosticId("run-a", catalog), diagnosticId("run-b", catalog));
  assert.notEqual(diagnosticId("run-a", catalog), diagnosticId("run-a", join("projects", "p1", "molis-work.db")));
  assert.equal(owner.diagnostic_id.includes("catalog"), false);
  const library = describeUnavailable(home, { code: "storage.store_too_new", path: join("projects", "p1", "molis-work.db") });
  assert.deepEqual(library && { block: library.block, reason: library.reason, project_id: library.project_id }, { block: { kind: "project" }, reason: "store_too_new", project_id: "p1" });
});

test("UPG3-01 RAC-403 a refusal of anything that is not one of this Home's stores gets no explanation, whatever its code", async t => {
  const home = await mkdtemp(join(tmpdir(), "owner-unavailable-")); t.after(() => rm(home, { recursive: true, force: true }));
  const unrelated = sqliteVersionRefusal("unrelated.db", 2, 1);
  assert.deepEqual(upgradeRefusal(unrelated), { code: "storage.store_too_new", path: "unrelated.db" });
  assert.equal(describeUnavailable(home, upgradeRefusal(unrelated)!), undefined);
  assert.equal(upgradeRefusal(new Error("storage.upgrade_failed")), undefined);
  assert.equal(upgradeRefusal(new ActionError("storage.upgrade_failed", "no path")), undefined, "a refusal that names no path names no store");
  assert.equal(upgradeRefusal(new ActionError("actions.execution_failed", "x", { details: { path: join("projects", "catalog.db") } })), undefined);
  assert.equal(describePluginTablesRefusal(home, "goals", null, { code: "plugin.project_database.shape_mismatch" }), undefined,
    "a plugin's tables that do not match their declaration are no upgrade's matter");
  const newer = describePluginTablesRefusal(home, "goals", null, { code: "plugin.project_database.version_mismatch", details: { recorded_version: 3, declared_version: 2 } });
  assert.equal(newer?.reason, "store_too_new");
  assert.deepEqual(newer?.block, { kind: "plugin", plugin_id: "goals" });
});

test("UPG3-02 the card gives each reason its own sentence and only the ways out that work for it", t => {
  withWorkbenchText(t);
  const card = (reason: OwnerUnavailableReason, rollback: string | null = "/settings/update?rollback=1") =>
    renderOwnerUnavailableCard({ title: "Pages", reason, diagnostic_id: "D-3F9A2C81", rollback_href: rollback, reload_href: "/projects/p1/" });
  const sentences = new Set<string>();
  for (const reason of ["upgrade_failed", "store_too_new", "upgrade_no_space", "snapshot_invalid", "unreadable"] as const) {
    const html = card(reason);
    assert.match(html, new RegExp(`data-owner-unavailable="${reason}"`, "u"));
    assert.match(html, /role="alert"/u);
    assert.match(html, /data-copy-value="D-3F9A2C81"/u, "every card lets the number be copied");
    assert.equal(/data-owner-unavailable-rollback/u.test(html), reason === "upgrade_failed", `${reason}: only a failed upgrade goes back a version`);
    assert.equal(/href="\/projects\/p1\/"/u.test(html), reason !== "store_too_new", `${reason}: a newer store stays refused however often it reloads`);
    sentences.add(/<p>([^<]+)<\/p>/u.exec(html)![1]!);
  }
  assert.equal(sentences.size, 5, "each reason says its own sentence");
  assert.doesNotMatch(card("upgrade_failed", null), /data-owner-unavailable-rollback/u, "no version to go back to, no button");
});

test("UPG3-03 UPG3-02 a catalog from a newer version stops the project list in place: the Home's own pages still open, reads say unavailable, writes are refused, its bytes stay", { timeout: 60_000 }, async t => {
  const f = await serveHomeRuntime(t);
  const project = await f.project("Kept as it is");
  const file = join(f.home, "projects", "catalog.db");
  const db = new DatabaseSync(file);
  try { db.exec("UPDATE catalog_meta SET value = '99' WHERE key = 'schema_version'"); } finally { db.close(); }
  const bytes = readFileSync(file);
  for (const path of ["/", `/projects/${project.project_id}/`]) {
    const page = await f.request(path, { headers: { accept: "text/html" } });
    assert.equal(page.status, 200, path);
    const html = await page.text();
    assert.match(html, /data-owner-unavailable-page/u, path);
    assert.match(html, /data-owner-unavailable="store_too_new"/u, path);
    assert.match(html, /项目列表暂不可用/u, path);
    assert.match(html, /data-copy-value="D-[0-9A-F]{8}"/u, path);
    assert.doesNotMatch(html, /data-owner-unavailable-rollback/u, "a newer store is no failed upgrade to go back from");
  }
  const appearance = await f.request("/settings/appearance", { headers: { accept: "text/html" } });
  assert.equal(appearance.status, 200);
  assert.doesNotMatch(await appearance.text(), /data-owner-unavailable/u, "settings that are not the project list still open");
  const list = await f.request("/api/settings/projects");
  assert.equal(list.status, 503, "a read says unavailable, with no substitute list");
  const body = await list.json() as { code?: string; details?: { block?: string; diagnostic_id?: string } };
  assert.equal(body.code, "storage.store_too_new");
  const write = await f.request("/api/settings/projects", { method: "POST", body: { title: "Not now" } });
  assert.ok(write.status >= 400, `a write is refused (${write.status})`);
  assert.deepEqual(readFileSync(file), bytes, "neither the card nor the refusals touch the catalog");
});
