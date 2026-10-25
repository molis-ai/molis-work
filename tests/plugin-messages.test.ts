import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { DEMO_PROJECT_ID, LocalProjectDatabase, createPluginPlatform, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { EN, createWorkbenchLocale, registerPluginMessages, unregisterPluginMessages, type WebLocale } from "@molis-ai/molis-work-app-workbench";
import { messageDeclarationProblems, parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

// PG-071: a Plugin brings its page words in its Manifest (`ui.messages` by stable key, `ui.translations` for the Host's own
// build), the same way whether it ships with the Host or is installed, and the page's catalog is built from the Plugins that
// are registered. The shape check is the SDK's, so the author's tools and the Host refuse the same declarations.

let current: WebLocale = "en";
const { L, clientI18nScript } = createWorkbenchLocale(() => current);
const inLocale = <T>(locale: WebLocale, run: () => T): T => { const before = current; current = locale; try { return run(); } finally { current = before; } };
const pageCatalog = (locale: WebLocale): Record<string, string> => {
  const page: { MOLIS_WORK_MESSAGES?: Record<string, string> } = {};
  inLocale(locale, () => runInNewContext(clientI18nScript(), page));
  return page.MOLIS_WORK_MESSAGES ?? {};
};

const NOTES = { "notes.panel.title": { zh: "笔记", en: "Notes" }, "notes.panel.count": { zh: "共 {count} 条", en: "{count} items" } };
const declared = (plugin_id: string, ui: PluginManifest["ui"]): Pick<PluginManifest, "plugin_id" | "ui"> => ({ plugin_id, ui });

test("RAC-750 the shared declaration check accepts a Plugin's own stable keys and refuses what would reach into other words", () => {
  assert.deepEqual(messageDeclarationProblems(declared("com.acme.notes", { contributions: [], messages: NOTES, translations: { "保存笔记": "Save note" } })), []);
  assert.deepEqual(messageDeclarationProblems(declared("com.acme.notes", { contributions: [] })), [], "a Plugin may bring no words");
  const refused = (messages: unknown, plugin_id = "com.acme.notes") => messageDeclarationProblems(declared(plugin_id, { contributions: [], messages: messages as never }));
  assert.match(refused({ "保存": { zh: "保存", en: "Save" } })[0] ?? "", /必须是 <主人>\.<区域>\.<名称>/, "a Chinese key would replace the Host's own word");
  assert.match(refused({ "goals.tree.title": { zh: "目标", en: "Goals" } })[0] ?? "", /必须以插件自己的名字「notes」开头/, "another Plugin's keys are not this Plugin's to declare");
  assert.match(refused({ "common.save": { zh: "保存", en: "Save" } }, "com.acme.common")[0] ?? "", /common 留给通用词/, "the shared words belong to the Host");
  assert.match(refused({ "notes.a.b": { zh: "{count} 条", en: "items" } })[0] ?? "", /不同的 \{占位符\}/);
  assert.match(refused({ "notes.a.b": { zh: "笔记", en: "笔记" } })[0] ?? "", /en 里还有中文/);
  assert.match(refused({ "notes.a.b": { zh: "笔记", en: "" } })[0] ?? "", /需要非空的 zh 与 en/);
  assert.match(refused({ "notes.a.b": { zh: "笔记", en: "x".repeat(2001) } })[0] ?? "", /最长 2000 字/);
  assert.match(refused([])[0] ?? "", /必须为对象/);
  const translations = (value: unknown) => messageDeclarationProblems(declared("com.acme.notes", { contributions: [], translations: value as never }));
  assert.match(translations({ "保存": "" })[0] ?? "", /需要非空的英文/);
  assert.match(translations("x")[0] ?? "", /必须为对象/);
});

const manifestWith = (extra: Record<string, unknown>, schema_version = 2) => ({
  schema_version, host_api_version: schema_version, plugin_id: "io.molis.work.example.notes", version: "1.0.0", name: "Notes", kind: schema_version === 1 ? "native" : "app",
  publisher: { publisher_id: "acme", signature: "acme-notes" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
  ui: { contributions: [], ...extra }, ...(schema_version === 1 ? {} : { actions: [] }),
});

test("RAC-751 reading a Manifest refuses a bad word declaration, so an install never carries one", () => {
  assert.deepEqual(parsePluginManifest(manifestWith({ messages: NOTES })).ui.messages, NOTES);
  assert.throws(() => parsePluginManifest(manifestWith({ messages: { "保存": { zh: "保存", en: "Save" } } })), /ui\.messages/);
  assert.throws(() => parsePluginManifest(manifestWith({ messages: { "goals.tree.title": { zh: "目标", en: "Goals" } } })), /必须以插件自己的名字/);
  assert.throws(() => parsePluginManifest(manifestWith({ messages: NOTES }, 1)), /ui\.messages/, "the first Manifest version has no words block");
});

test("RAC-752 a built-in and an installed Plugin register their words the same way; the Host's own build alone may translate Chinese source text", () => {
  const word = "只有测试用到的中文原文";
  assert.deepEqual(registerPluginMessages(declared("com.acme.notes", { contributions: [], messages: NOTES, translations: { [word]: "Test-only source text" } }), { host: false }), []);
  try {
    assert.equal(inLocale("en", () => L("notes.panel.title")), "Notes");
    assert.equal(inLocale("zh", () => L("notes.panel.title")), "笔记");
    assert.equal(inLocale("en", () => L("notes.panel.count", { count: 3 })), "3 items");
    assert.equal(inLocale("en", () => L(word)), word, "an installed Plugin's Chinese-keyed translations are not read");
    assert.deepEqual(registerPluginMessages(declared("io.molis.work.example.words", { contributions: [], translations: { [word]: "Test-only source text" } }), { host: true }), []);
    assert.equal(inLocale("en", () => L(word)), "Test-only source text");
    assert.equal(inLocale("zh", () => L(word)), word);
    // The Host's own sentence wins over a Plugin's translation of it; a Plugin cannot reword the Host.
    const [hostKey] = Object.keys(EN);
    assert.deepEqual(registerPluginMessages(declared("io.molis.work.example.reword", { contributions: [], translations: { [hostKey!]: "A Plugin's own wording" } }), { host: true }), []);
    assert.equal(inLocale("en", () => L(hostKey!)), EN[hostKey!]);
  } finally {
    for (const id of ["com.acme.notes", "io.molis.work.example.words", "io.molis.work.example.reword"]) unregisterPluginMessages(id);
  }
});

test("RAC-752 a key another installed Plugin has declared is refused, and the refused Plugin registers none of its words", () => {
  assert.deepEqual(registerPluginMessages(declared("com.acme.notes", { contributions: [], messages: NOTES }), { host: false }), []);
  try {
    const second = registerPluginMessages(declared("com.other.notes", { contributions: [], messages: { ...NOTES, "notes.other.only": { zh: "仅此", en: "Only here" } } }), { host: false });
    assert.match(second.join(" "), /notes\.panel\.title 已由 com\.acme\.notes 声明/);
    assert.equal(inLocale("en", () => L("notes.panel.title")), "Notes", "the first Plugin keeps its word");
    assert.equal(inLocale("en", () => L("notes.other.only")), "notes.other.only", "the refused Plugin's other words are not registered either");
    assert.match(registerPluginMessages(declared("com.acme.bad", { contributions: [], messages: { "保存": { zh: "保存", en: "Save" } } }), { host: false }).join(" "), /ui\.messages/, "the Host runs the same shape check");
    // Registering again replaces the Plugin's own words, never collides with itself.
    assert.deepEqual(registerPluginMessages(declared("com.acme.notes", { contributions: [], messages: { "notes.panel.title": { zh: "笔记本", en: "Notebook" } } }), { host: false }), []);
    assert.equal(inLocale("en", () => L("notes.panel.title")), "Notebook");
    assert.equal(inLocale("en", () => L("notes.panel.count", { count: 1 })), "notes.panel.count", "the words it no longer declares are gone");
  } finally {
    for (const id of ["com.acme.notes", "com.other.notes", "com.acme.bad"]) unregisterPluginMessages(id);
  }
});

test("RAC-753 a page's catalog holds the words of the Plugins that are registered, and a Plugin that is not registered adds nothing", () => {
  assert.equal("notes.panel.title" in pageCatalog("en"), false, "before it is registered");
  registerPluginMessages(declared("com.acme.notes", { contributions: [], messages: NOTES }), { host: false });
  try {
    assert.equal(pageCatalog("en")["notes.panel.title"], "Notes");
    assert.equal(pageCatalog("zh")["notes.panel.title"], "笔记");
    assert.equal(pageCatalog("en")["notes.panel.count"], "{count} items");
  } finally { unregisterPluginMessages("com.acme.notes"); }
  assert.equal("notes.panel.title" in pageCatalog("en"), false, "after it is unregistered");
  assert.equal("goals.quote.open" in pageCatalog("en"), true, "the built-in Plugins are registered when the Host starts");
});

const PLUGIN_ID = "io.molis.work.example.words-fixture";
const definition = (): PluginDefinition => {
  const manifest: PluginManifest = {
    schema_version: 2, host_api_version: 2, plugin_id: PLUGIN_ID, version: "1.0.0", name: "Words fixture", kind: "app",
    publisher: { publisher_id: "molis", signature: "words-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, actions: [],
    ui: { contributions: [], messages: { "words-fixture.panel.title": { zh: "固定文字", en: "Fixture words" } }, translations: { "夹具里的中文": "Words in the fixture" } },
  };
  return { manifest, async start() { return { kind: "app", views: [], actions: [] }; }, async stop() {} };
};

test("RAC-753 starting a Plugin registers the words its Manifest declares, whether it ships with the Host or not", async () => {
  const directory = mkdtempSync(join(tmpdir(), "plugin-messages-"));
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  try {
    const platform = createPluginPlatform({
      actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
      artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
      processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
      ui: new UiHost(), home: null, privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
    });
    assert.equal(inLocale("en", () => L("words-fixture.panel.title")), "words-fixture.panel.title", "not yet started");
    const report = await platform.start([{ definition: definition() }]);
    assert.deepEqual(report.running, [PLUGIN_ID]);
    assert.equal(inLocale("en", () => L("words-fixture.panel.title")), "Fixture words", "an installed Plugin's words are read from its Manifest");
    assert.equal(inLocale("zh", () => L("words-fixture.panel.title")), "固定文字");
    assert.equal(inLocale("en", () => L("夹具里的中文")), "夹具里的中文", "its Chinese-keyed translations are not, it does not ship with the Host");
    assert.equal(pageCatalog("en")["words-fixture.panel.title"], "Fixture words");
  } finally {
    unregisterPluginMessages(PLUGIN_ID);
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
