import assert from "node:assert/strict";
import test from "node:test";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { createTextReader, inspectLocaleSet, parseLocalePack, refuseSharedTextPrefix, textArgs } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";
import { pagePack } from "./fixtures/page-text.js";

const OWNER = "io.molis.work.example.notes";
const TITLE = "notes.panel.title";
const COUNT = "notes.panel.count";
const pack = (locale: string, messages: unknown, owner = OWNER) => ({ format_version: 1, owner, locale, messages });
const read = (locale: string, messages: unknown, owner?: string) => parseLocalePack(JSON.stringify(pack(locale, messages, owner)));
const checked = (locale: string, messages: unknown): UiLocalePack => {
  const result = read(locale, messages);
  assert.ok(result.ok, JSON.stringify(result));
  return result.value;
};
const manifest = (extra: Record<string, unknown>) => ({
  schema_version: 1, host_api_version: 1, plugin_id: OWNER, version: "1.0.0", name: "Notes", kind: "app",
  publisher: { publisher_id: "acme", signature: "acme-notes" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
  ui: { contributions: [], ...extra }, actions: [],
});

test("RAC-750 a pack accepts the owner’s stable keys and rejects unsafe text and someone else’s keys", () => {
  assert.ok(read("zh", { [TITLE]: "笔记", [COUNT]: "共 {count} 条" }).ok);
  assert.ok(read("en", {}).ok, "a plugin does not have to bring words");
  const refused = (messages: unknown, code: string, owner?: string) => {
    const result = read("en", messages, owner);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.problems.some(problem => problem.code === code), JSON.stringify(result.problems));
  };
  refused({ 保存: "Save" }, "ui.locale_key");
  refused({ "goals.tree.title": "Goals" }, "ui.locale_key_owner");
  refused({ "common.save": "Save" }, "ui.locale_owner", "com.acme.common");
  refused({ [TITLE]: "" }, "ui.locale_text");
  refused({ [TITLE]: "x".repeat(2001) }, "ui.locale_text");
  refused({ [TITLE]: "<script>bad</script>" }, "ui.locale_markup");
  refused({ [COUNT]: "{count} {count|item|items}" }, "ui.locale_old_plural");
  refused([], "ui.file_wrong_type");
});

test("RAC-751 a current Manifest accepts locale files and rejects each retired inline field", () => {
  const declared = { default: "zh", available: ["zh", "en"] };
  assert.deepEqual(parsePluginManifest(manifest({ locales: declared })).ui.locales, declared);
  assert.doesNotThrow(() => parsePluginManifest(manifest({})));
  for (const [field, value] of [["messages", { [TITLE]: { zh: "笔记", en: "Notes" } }], ["translations", { 笔记: "Notes" }]] as const) {
    for (const extra of [{ [field]: value }, { locales: declared, [field]: value }]) {
      assert.throws(() => parsePluginManifest(manifest(extra)), { code: "plugin.declaration_invalid", message: new RegExp(`^ui\\.${field} 已取消：.*ui\\.locales`, "u") }, field);
    }
  }
  assert.throws(() => parsePluginManifest({ ...manifest({ locales: declared }), schema_version: 2 }), { code: "plugin.manifest_version_invalid", message: /Manifest 版本不受支持|Manifest version is not supported/ });
});

test("RAC-752 plugin text validation checks both languages and refuses a second owner with the same key prefix", () => {
  const zh = checked("zh", { [TITLE]: "笔记", [COUNT]: "共 {count} 条" });
  const en = checked("en", { [TITLE]: "Notes", [COUNT]: { plural_arg: "count", forms: { one: "{count} item", other: "{count} items" } } });
  assert.deepEqual(inspectLocaleSet([zh, en], { default: "zh" }), []);
  const wrong = checked("en", { [TITLE]: "Notes", [COUNT]: "{total} notes" });
  assert.ok(inspectLocaleSet([zh, wrong], { default: "zh" }).some(problem => problem.blocking && problem.key === COUNT));
  assert.throws(() => refuseSharedTextPrefix(OWNER, "com.other.notes"), /notes/u);
  assert.doesNotThrow(() => refuseSharedTextPrefix(OWNER, OWNER));
});

test("RAC-753 RAC-754 a reader answers only from the authorized owner’s supplied packs", () => {
  const zh = checked("zh", { [TITLE]: "笔记", [COUNT]: "共 {count} 条" });
  const en = checked("en", { [TITLE]: "Notes" });
  const ref = { owner: OWNER, key: TITLE, fallback: "Not authorized" };
  const workbench = pagePack("workbench", "en");
  assert.equal(createTextReader({ packs: [workbench], locale: "en" }).text(ref), "Not authorized");
  const allowed = createTextReader({ packs: [workbench, zh, en], locale: "en" });
  assert.equal(allowed.text(ref), "Notes");
  assert.equal(allowed.text({ ...ref, key: COUNT, args: textArgs({ count: 3 }) }), "共 3 条");
  assert.equal(allowed.text({ ...ref, owner: "com.other.notes" }), "Not authorized");
  assert.equal(allowed.text({ owner: "workbench", key: "workbench.shell.settings" }), "Settings");
});
