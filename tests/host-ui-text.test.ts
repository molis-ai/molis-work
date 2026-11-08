import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiContribution, UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";
import { DEMO_PROJECT_ID, LocalProjectDatabase, PluginHostExecutor, seedDemoBoard, hostTextProblems, installHostUiText, runBackgroundWork, runDevelopmentText, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { hasPluginText, registerPluginText, renderStagePage } from "@molis-ai/molis-work-app-workbench";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { PluginRuntime, pluginLocaleReader } from "@molis-ai/molis-work-plugin-runtime";
import { format, say, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

// The Host's text context (specs/font-and-skin-system/a-section-contract.md §5.2, §8.3): the words a session registers and takes back, the language a
// scope gives and takes back when it ends, and one context for every Host a process opens.

installHostUiText();

const pack = (owner: string, locale: string, messages: Record<string, string>): UiLocalePack => ({ format_version: 1, owner, locale, messages });
const reader = (owner: string, packs: readonly UiLocalePack[]) => ({ owner, default: packs[0]!.locale, pack: (locale: string) => packs.find((item) => item.locale === locale) ?? null });
const later = <T>(read: () => T) => new Promise<T>((resolve, reject) => setTimeout(() => { try { resolve(read()); } catch (error) { reject(error); } }, 5));
const PROBE = "io.molis.work.example.text-probe";
const probeWords = registerPluginText(reader(PROBE, [pack(PROBE, "zh", { "text-probe.main.title": "标题" }), pack(PROBE, "en", { "text-probe.main.title": "Title" })]), { t: true });
test.after(() => probeWords());

test("FSS-69 one context for every Host a process opens: installing it again changes nothing", () => {
  const installed = Reflect.get(globalThis, Symbol.for("molis.work.ui-text.v1"));
  installHostUiText();
  installHostUiText();
  assert.equal(Reflect.get(globalThis, Symbol.for("molis.work.ui-text.v1")), installed);
  assert.equal(runWithLocale("en", () => t("text-probe.main.title")), "Title");
});

test("FSS-69 a timer started in a request does not keep the request's language once it ended: production falls back and says so", async () => {
  const before = hostTextProblems().length;
  const [inside, after] = await runWithLocale("en", () => [t("text-probe.main.title"), later(() => t("text-probe.main.title"))] as const);
  assert.equal(inside, "Title");
  assert.equal(await after, "标题", "the owner's default language, not the ended request's");
  assert.ok(hostTextProblems().slice(before).some((problem) => problem.code === "ui.text_no_context" && problem.key === 't("text-probe.main.title")'), "and a problem says so");
});

test("FSS-69 in a developer's run a timer left behind throws: it has no language, and it is not the place to fall back", async () => {
  // The scope's function returns at once and leaves the timer running, as a page's handler does.
  const { after } = runDevelopmentText("en", () => { assert.equal(t("text-probe.main.title"), "Title"); return { after: later(() => t("text-probe.main.title")) }; });
  await assert.rejects(after, { code: "ui.text_no_context" });
  await assert.rejects(runDevelopmentText(null, () => later(() => format.number(3))), { code: "ui.text_no_context" });
});

test("FSS-69 a nested runWithLocale and a runBackgroundWork end their language too, and concurrent requests keep their own", async () => {
  const nested = runWithLocale("zh", () => runWithLocale("en", () => ({ pending: later(() => say.text({ owner: PROBE, key: "text-probe.main.title" })) })));
  assert.equal(await nested.pending, "标题");
  const background = runBackgroundWork("en", () => ({ pending: later(() => t("text-probe.main.title")) }));
  assert.equal(await background.pending, "标题");
  const inDevelopment = runDevelopmentText(null, () => runWithLocale("en", () => ({ pending: later(() => t("text-probe.main.title")) })));
  await assert.rejects(inDevelopment.pending, { code: "ui.text_no_context" }, "a nested scope keeps the development run's way of answering");
  // While the scope's own promise runs, its timers still have its language: it ends when that promise does.
  assert.equal(await runWithLocale("en", () => later(() => t("text-probe.main.title"))), "Title");
  const answers = await Promise.all(Array.from({ length: 8 }, (_, index) => runWithLocale(index % 2 ? "en" : "zh", async () => {
    await new Promise((resolve) => setTimeout(resolve, 8 - index));
    return t("text-probe.main.title");
  })));
  assert.deepEqual(answers, ["标题", "Title", "标题", "Title", "标题", "Title", "标题", "Title"]);
});

test("FSS-60 t refuses a second owner of the same last segment; say finds each owner by its full name", () => {
  const a = "io.molis.work.a.notes", b = "io.molis.work.b.notes";
  const first = registerPluginText(reader(a, [pack(a, "en", { "notes.main.title": "A notes" })]), { t: true });
  try {
    assert.throws(() => registerPluginText(reader(b, [pack(b, "en", { "notes.main.title": "B notes" })]), { t: true }), { code: "ui.text_owner_conflict" });
    assert.equal(hasPluginText(b), false, "the refused owner left nothing behind");
  } finally { first(); }
  // Neither runs `t` in this process (a sandboxed plugin, a content pack): both are registered, and neither answers for the other.
  const withdrawA = registerPluginText(reader(a, [pack(a, "en", { "notes.main.title": "A notes" })]), { t: false });
  const withdrawB = registerPluginText(reader(b, [pack(b, "en", { "notes.main.title": "B notes" })]), { t: false });
  try {
    runWithLocale("en", () => {
      assert.equal(say.text({ owner: a, key: "notes.main.title" }), "A notes");
      assert.equal(say.text({ owner: b, key: "notes.main.title" }), "B notes");
    });
  } finally { withdrawA(); withdrawB(); }
});

test("FSS-60 the words leave when every session that registered them is released; an upgrade's old version does not stay", () => {
  const owner = "io.molis.work.example.counted";
  const v1 = reader(owner, [pack(owner, "en", { "counted.main.title": "Old title", "counted.main.only-old": "Only in the old version" })]);
  const v2 = reader(owner, [pack(owner, "en", { "counted.main.title": "New title" })]);
  const inProjectA = registerPluginText(v1, { t: true }), inProjectB = registerPluginText(v1, { t: true });
  inProjectA();
  assert.equal(hasPluginText(owner), true, "the other project's session still has them");
  const upgraded = registerPluginText(v2, { t: true });
  runWithLocale("en", () => {
    assert.equal(t("counted.main.title"), "New title", "the newest registration answers");
    assert.equal(t("counted.main.only-old"), "Only in the old version", "a key it lacks falls to the version still running elsewhere");
  });
  inProjectB();
  runWithLocale("en", () => assert.equal(t("counted.main.only-old"), "This text cannot be shown right now", "the old version is gone once its last session is: the platform's own sentence for it"));
  upgraded();
  inProjectA();
  assert.equal(hasPluginText(owner), false);
});

/** A project plugin with one stage view whose page says its own words, and the files its Manifest declares, counting what is read. */
function viewsProbe() {
  const id = "io.molis.work.example.views-probe", contribution_id = `${id}.main`;
  const files: Record<string, string> = {
    "locales/en.json": JSON.stringify(pack(id, "en", { "views-probe.main.title": "My own words" })),
    "locales/zh.json": JSON.stringify(pack(id, "zh", { "views-probe.main.title": "我自己的词" })),
  };
  const reads: string[] = [];
  const view: UiContribution = { descriptor: { contribution_id, kind: "embedded", label: "Probe", slots: [], surfaces: [{ surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" }] },
    render: () => `<main data-work-surface="views-probe">${t("views-probe.main.title")}</main>` };
  const definition: PluginDefinition = { manifest: { schema_version: 1, host_api_version: 1, plugin_id: id, version: "1.0.0", name: "Views probe", kind: "app",
    publisher: { publisher_id: "example", signature: "views-probe" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }], permissions: [],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
    ui: { contributions: [contribution_id], views: [{ view_id: "main", slot: "stage", title: "Probe", contribution_id }], locales: { default: "en", available: ["en", "zh"] } } },
  async start() { return { kind: "app", views: [view] }; } };
  const words = pluginLocaleReader(definition.manifest, (path) => { reads.push(path); return files[path] ?? null; })!;
  return { definition, words, reads, view };
}

function projectRig(t: TestContext, localePacks?: (definition: PluginDefinition) => ReturnType<typeof pluginLocaleReader>) {
  const directory = mkdtempSync(join(tmpdir(), "molis-host-ui-text-")), file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const events = { appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event), eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const executor = new PluginHostExecutor({ actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: "user",
    artifacts: new ArtifactsModule({ db: store.db, ...events }), processItems: new ProcessItemsModule({ db: store.db, ...events }), ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }), ...(localePacks ? { localePacks } : {}) });
  const runtime = new PluginRuntime(undefined, executor, { hostIds: ISOLATED_HOST_IDS, actions: pluginActions(store, DEMO_PROJECT_ID) });
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  return runtime;
}

test("FSS-60 FSS-63 a plugin with stage views draws its own words through renderStagePage; a second render in a language reads no file", async (t) => {
  const probe = viewsProbe();
  const runtime = projectRig(t, (definition) => definition.manifest.plugin_id === probe.definition.manifest.plugin_id ? probe.words : null);
  const installId = runtime.install({ trust: { level: "unsigned" }, definition: probe.definition, deployment: "local", grants: [] }).install.install_id;
  await runtime.start(installId);
  const stage = runtime.contribution(installId);
  assert.ok(stage?.kind === "app");
  const draw = (locale: "zh" | "en") => runWithLocale(locale, () => renderStagePage(stage.views[0]!, {}, "views-probe", false).html);
  assert.match(draw("en"), /My own words/);
  assert.match(draw("zh"), /我自己的词/);
  assert.deepEqual(probe.reads, ["locales/en.json", "locales/zh.json"], "each language's file once");
  draw("en");
  draw("zh");
  assert.deepEqual(probe.reads, ["locales/en.json", "locales/zh.json"], "a second render of a language reads nothing");
  await runtime.uninstall(installId);
  assert.equal(hasPluginText(probe.definition.manifest.plugin_id), false, "released with the session");
});

test("FSS-63 a plugin with no language files reads nothing and registers nothing", async (t) => {
  const probe = viewsProbe();
  const runtime = projectRig(t);
  const installId = runtime.install({ trust: { level: "unsigned" }, definition: probe.definition, deployment: "local", grants: [] }).install.install_id;
  await runtime.start(installId);
  assert.equal(hasPluginText(probe.definition.manifest.plugin_id), false);
  assert.deepEqual(probe.reads, []);
  await runtime.uninstall(installId);
});
