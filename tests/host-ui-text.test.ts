import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiContribution, UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";
import { DEMO_PROJECT_ID, LocalProjectDatabase, PluginHostExecutor, seedDemoBoard, captureHostLog, hostTextProblems, type HostLogEntry, installHostUiText, runBackgroundWork, runDevelopmentText, runWithLocale, runWithPluginText } from "@molis-ai/molis-work-app-local-host";
import { pluginTextReader, registerPluginText } from "@molis-ai/molis-work-ui-host";
import { renderStagePage } from "@molis-ai/molis-work-app-workbench";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { MemoryPluginRuntimeRepository, PluginRuntime, definitionOrigin, pluginLocaleReader } from "@molis-ai/molis-work-plugin-runtime";
import { createActionDefinition } from "@molis-ai/molis-work-plugin-sdk";
import { format, say, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

// The Host's text context (specs/font-and-skin-system/a-section-contract.md §5.2, §8.3): the words a session registers and takes back, the language a
// scope gives and takes back when it ends, and one context for every Host a process opens.

installHostUiText();

const pack = (owner: string, locale: string, messages: Record<string, string>): UiLocalePack => ({ format_version: 1, owner, locale, messages });
const reader = (owner: string, packs: readonly UiLocalePack[]) => ({ owner, default: packs[0]!.locale, pack: (locale: string) => packs.find((item) => item.locale === locale) ?? null });
const later = <T>(read: () => T) => new Promise<T>((resolve, reject) => setTimeout(() => { try { resolve(read()); } catch (error) { reject(error); } }, 5));
const SAVE = "workbench.env.save";
const PROBE = "workbench";
test("FSS-69 one context for every Host a process opens: installing it again changes nothing", () => {
  const installed = Reflect.get(globalThis, Symbol.for("molis.work.ui-text.v1"));
  installHostUiText();
  installHostUiText();
  assert.equal(Reflect.get(globalThis, Symbol.for("molis.work.ui-text.v1")), installed);
  assert.equal(runWithLocale("en", () => t(SAVE)), "Save");
});

test("FSS-69 a timer started in a request does not keep the request's language once it ended: production falls back and says so", async () => {
  const before = hostTextProblems().length;
  const [inside, after] = await runWithLocale("en", () => [t(SAVE), later(() => t(SAVE))] as const);
  assert.equal(inside, "Save");
  assert.equal(await after, "保存", "the owner's default language, not the ended request's");
  assert.ok(hostTextProblems().slice(before).some((problem) => problem.code === "ui.text_no_context" && problem.key === 't("workbench.env.save")'), "and a problem says so");
});

// FSS-72: the page shows the platform's sentence for a key the author mistyped; the log line names the key, so the author can find it.
test("FSS-69 a word not found shows the platform's sentence on the page, and the log line names its key", () => {
  const entries: HostLogEntry[] = [];
  const restore = captureHostLog(entries);
  let shown: string;
  try { shown = runWithLocale("en", () => t("workbench.env.typo")); } finally { restore(); }
  assert.doesNotMatch(shown, /workbench\.env\.typo/u, "the key never reaches the page");
  const line = entries.find((entry) => entry.area === "ui-text" && entry.event === "text-missing");
  assert.ok(line, JSON.stringify(entries));
  assert.equal(line.fields?.key, "workbench.env.typo");
  assert.equal(line.fields?.owner, PROBE);
  assert.equal(hostTextProblems().at(-1)?.key, "workbench.env.typo");
  // #1976 review ② item 4: the same word missing on every render is one line of the log, however often; each is still a problem to see.
  const again: HostLogEntry[] = [];
  const before = hostTextProblems().length;
  const restoreAgain = captureHostLog(again);
  try { for (const locale of ["en", "zh", "en"] as const) runWithLocale(locale, () => t("workbench.env.typo")); runWithLocale("en", () => t("workbench.env.other-typo")); } finally { restoreAgain(); }
  assert.deepEqual(again.filter((entry) => entry.area === "ui-text").map((entry) => entry.fields?.key), ["workbench.env.other-typo"]);
  assert.equal(hostTextProblems().length - before, 4);
});

test("FSS-69 in a developer's run a timer left behind throws: it has no language, and it is not the place to fall back", async () => {
  // The scope's function returns at once and leaves the timer running, as a page's handler does.
  const { after } = runDevelopmentText("en", () => { assert.equal(t(SAVE), "Save"); return { after: later(() => t(SAVE)) }; });
  await assert.rejects(after, { code: "ui.text_no_context" });
  await assert.rejects(runDevelopmentText(null, () => later(() => format.number(3))), { code: "ui.text_no_context" });
});

test("FSS-69 a nested runWithLocale and a runBackgroundWork end their language too, and concurrent requests keep their own", async () => {
  const nested = runWithLocale("zh", () => runWithLocale("en", () => ({ pending: later(() => say.text({ owner: PROBE, key: SAVE })) })));
  assert.equal(await nested.pending, "保存");
  const background = runBackgroundWork("en", () => ({ pending: later(() => t(SAVE)) }));
  assert.equal(await background.pending, "保存");
  const inDevelopment = runDevelopmentText(null, () => runWithLocale("en", () => ({ pending: later(() => t(SAVE)) })));
  await assert.rejects(inDevelopment.pending, { code: "ui.text_no_context" }, "a nested scope keeps the development run's way of answering");
  // While the scope's own promise runs, its timers still have its language: it ends when that promise does.
  assert.equal(await runWithLocale("en", () => later(() => t(SAVE))), "Save");
  const answers = await Promise.all(Array.from({ length: 8 }, (_, index) => runWithLocale(index % 2 ? "en" : "zh", async () => {
    await new Promise((resolve) => setTimeout(resolve, 8 - index));
    return t(SAVE);
  })));
  assert.deepEqual(answers, ["保存", "Save", "保存", "Save", "保存", "Save", "保存", "Save"]);
});

test("FSS-60 t checks the in-process prefix, while say reads only the exact bound owner", () => {
  const a = "io.molis.work.a.notes", b = "io.molis.work.b.notes";
  const scope = (id: string) => ({ install_id: id, installation_generation: "copied" });
  const sourceA = scope(a), sourceB = scope(b);
  const words = (id: string, title: string) => reader(id, [pack(id, "en", { "notes.main.title": title })]);
  const first = registerPluginText(words(a, "A notes"), { t: true, activation: sourceA });
  try {
    assert.throws(() => registerPluginText(words(b, "B notes"), { t: true, activation: sourceB }), { code: "ui.text_owner_conflict" });
    assert.equal(pluginTextReader(sourceB), null, "the refused owner left nothing behind");
  } finally { first(); }
  const withdrawA = registerPluginText(words(a, "A notes"), { t: false, activation: sourceA });
  const withdrawB = registerPluginText(words(b, "B notes"), { t: false, activation: sourceB });
  const read = (owner: string) => say.text({ owner, key: "notes.main.title", fallback: "No active source" });
  try {
    runWithLocale("en", () => {
      assert.equal(runWithPluginText(sourceA, () => read(a)), "A notes");
      assert.equal(runWithPluginText(sourceB, () => read(b)), "B notes");
      assert.equal(runWithPluginText(sourceA, () => read(b)), "No active source");
      assert.equal(read(a), "No active source");
      assert.equal(runWithPluginText(sourceA, () => t("notes.main.title")), "This text cannot be shown right now");
    });
  } finally { withdrawA(); withdrawB(); }
});

/** A project plugin with one stage view whose page says its own words, and the files its Manifest declares, counting what is read. */
function viewsProbe(title = "My own words", zhTitle = "我自己的词", oldWord = "") {
  const id = "io.molis.work.example.views-probe", contribution_id = `${id}.main`;
  const files: Record<string, string> = {
    "locales/en.json": JSON.stringify(pack(id, "en", { "views-probe.main.title": title, ...(oldWord ? { "views-probe.main.old": oldWord } : {}) })),
    "locales/zh.json": JSON.stringify(pack(id, "zh", { "views-probe.main.title": zhTitle })),
  };
  const reads: string[] = [];
  const view: UiContribution = { descriptor: { contribution_id, kind: "embedded", label: "Probe", slots: [], surfaces: [{ surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" }] },
    render: () => `<main data-work-surface="views-probe">${t("views-probe.main.title")}</main>` };
  const read = createActionDefinition(`${id}.read`, "query", { title: "Read", description: "Read the installation’s title", audiences: ["user"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", additionalProperties: false, properties: {} }, output_schema: { type: "string" } }, 1);
  const waiting = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>(), tail = Promise.withResolvers<string>();
  const definition: PluginDefinition = { manifest: { schema_version: 1, host_api_version: 1, plugin_id: id, version: "1.0.0", name: "Views probe", kind: "app",
    publisher: { publisher_id: "example", signature: "views-probe" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }], permissions: [],
    capabilities: { provides: [read.capability_id], consumes: [] }, actions: [read], routes: [{ route_id: "words", method: "GET", path: "/words" }], artifacts: { produces: [], consumes: [] },
    ui: { contributions: [contribution_id], views: [{ view_id: "main", slot: "stage", title: "Probe", contribution_id }], locales: { default: "en", available: ["en", "zh"] } } },
  async start() {
    return { kind: "app", views: [view], actions: [{ ...read, handle: () => later(() => t.text("views-probe.main.title")) }],
      routes: [{ route_id: "words", async handle(request) {
        if (request.query.hold) {
          entered.resolve();
          await waiting.promise;
          tail.resolve(t.text("views-probe.main.title"));
        }
        return { status: 200, body: say.text({ owner: id, key: "views-probe.main.old", fallback: t.text("views-probe.main.title") }) };
      } }] };
  } };
  const words = pluginLocaleReader(definition.manifest, (path) => { reads.push(path); return files[path] ?? null; })!;
  return { definition, words, reads, read, waiting, entered, tail };
}

function projectRig(t: TestContext, localePacks?: (definition: PluginDefinition) => ReturnType<typeof pluginLocaleReader>, ui: UiHost = new UiHost(),
  repository = new MemoryPluginRuntimeRepository()) {
  const directory = mkdtempSync(join(tmpdir(), "molis-host-ui-text-")), file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const events = { appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event), eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const actions = pluginActions(store, DEMO_PROJECT_ID);
  const activations = new Map<string, PluginStartContext>();
  class CapturingExecutor extends PluginHostExecutor {
    override start(definition: PluginDefinition, context: PluginStartContext) {
      activations.set(context.install_id, context);
      return super.start(definition, context);
    }
  }
  const executor = new CapturingExecutor({ actions, project_id: DEMO_PROJECT_ID, actor_id: "user",
    artifacts: new ArtifactsModule({ db: store.db, ...events }), processItems: new ProcessItemsModule({ db: store.db, ...events }), ui,
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }), ...(localePacks ? { localePacks } : {}) });
  const runtime = new PluginRuntime(repository, executor, { hostIds: ISOLATED_HOST_IDS, actions });
  t.after(async () => {
    try { for (const item of runtime.list()) if (item.state === "running") await runtime.stop(item.install_id); }
    finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
  });
  return { runtime, actions, activation: (installId: string) => activations.get(installId)! };
}

test("FSS-60 FSS-63 a plugin with stage views draws its own words through renderStagePage; a second render in a language reads no file", async (t) => {
  const probe = viewsProbe();
  const { runtime, activation } = projectRig(t, (definition) => definition.manifest.plugin_id === probe.definition.manifest.plugin_id ? probe.words : null);
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
  assert.equal(pluginTextReader(activation(installId)), null, "released with the session");
});

test("FSS-60 the words leave with the session even when something released before them throws", async (t) => {
  const probe = viewsProbe(), id = probe.definition.manifest.plugin_id, extra = `${id}.extra`;
  const manifest = { ...probe.definition.manifest, permissions: [{ permission: "ui:register", required: true, reason: "Registers a page of its own" }],
    ui: { ...probe.definition.manifest.ui, contributions: [...probe.definition.manifest.ui.contributions, extra] } };
  const definition: PluginDefinition = { manifest, async start(context) {
    context.services!.ui.register({ descriptor: { contribution_id: extra, kind: "primary-page", label: "Extra", slots: [] }, render: () => "<p>extra</p>" });
    return probe.definition.start(context);
  } };
  // Taking the page back throws, as a defect in any release before the words would (#1976 review ② item 3).
  class StuckUi extends UiHost { override unregister(): void { throw new Error("unregister stuck for the test"); } }
  const { runtime, activation } = projectRig(t, (given) => given.manifest.plugin_id === id ? probe.words : null, new StuckUi());
  const installId = runtime.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants: ["ui:register"] }).install.install_id;
  await runtime.start(installId);
  assert.equal(pluginTextReader(activation(installId)), probe.words);
  await runtime.uninstall(installId).catch(() => undefined);
  assert.equal(pluginTextReader(activation(installId)), null, "the words are taken back all the same");
});

test("FSS-63 a plugin with no language files reads nothing and registers nothing", async (t) => {
  const probe = viewsProbe();
  const { runtime, activation } = projectRig(t);
  const installId = runtime.install({ trust: { level: "unsigned" }, definition: probe.definition, deployment: "local", grants: [] }).install.install_id;
  await runtime.start(installId);
  assert.equal(pluginTextReader(activation(installId)), null);
  assert.deepEqual(probe.reads, []);
  await runtime.uninstall(installId);
});

test("FSS-60 FSS-69 the same copied installation identifiers cannot mix readers; old routes cannot borrow a new activation", async t => {
  const a = viewsProbe("First title", "甲的标题", "First version only"), b = viewsProbe("Second title", "乙的标题");
  const first = projectRig(t, definition => definitionOrigin(definition) === a.definition ? a.words : null);
  const copied = new MemoryPluginRuntimeRepository();
  const second = projectRig(t, definition => definitionOrigin(definition) === b.definition ? b.words : null, new UiHost(), copied);
  const record = first.runtime.install({ trust: { level: "unsigned" }, definition: a.definition, deployment: "local", grants: [] }).install;
  const installId = record.install_id;
  copied.save(record);
  second.runtime.register(b.definition);
  await first.runtime.start(installId);
  await second.runtime.start(installId);
  assert.notEqual(first.activation(installId), second.activation(installId));
  assert.equal(first.activation(installId).installation_generation, second.activation(installId).installation_generation);
  const caller = { actor_id: "user", audience: "user" as const, project_id: DEMO_PROJECT_ID, permissions: [], locale: "en" as const };
  assert.deepEqual(await Promise.all([first.actions.client.invoke(caller, a.read, {}), second.actions.client.invoke(caller, b.read, {})]), ["First title", "Second title"]);
  const one = first.runtime.contribution(installId), two = second.runtime.contribution(installId);
  assert.ok(one?.kind === "app" && two?.kind === "app");
  const english = { method: "GET" as const, pathname: "/words", params: {}, query: {}, actor_id: "user",
    execution: { locale: "en" as const, beforeEffect: async () => undefined } };
  assert.equal((await one.routes![0]!.handle(english)).body, "First version only");
  assert.equal((await two.routes![0]!.handle(english)).body, "Second title", "missing key cannot fall back to the other Home");
  const pending = one.routes![0]!.handle({ ...english, query: { hold: "1" } });
  await a.entered.promise;
  const old = first.activation(installId);
  try {
    await first.runtime.stop(installId);
    await first.runtime.start(installId);
  } finally { a.waiting.resolve(); }
  assert.notEqual(first.activation(installId), old);
  assert.equal((await pending).status, 403);
  assert.notEqual(await a.tail.promise, "First title", "a withdrawn handler cannot read the restarted installation's English words");
  assert.notEqual(await a.tail.promise, "甲的标题", "a withdrawn handler cannot read even the old default words");
  assert.throws(() => runWithLocale("en", () => renderStagePage(one.views![0]!, {}, "views-probe", false)), { code: "actions.forbidden" });
  assert.equal((await two.routes![0]!.handle(english)).body, "Second title", "the unrelated Home remains live");
});

test("FSS-69 nested SDK actions inherit the verified language and a settled child cannot borrow its living parent", async t => {
  const probe = viewsProbe("Default title", "本轮语言");
  const outer = createActionDefinition(`${probe.definition.manifest.plugin_id}.outer`, "query", { ...probe.read.action,
    output_schema: { type: "array", items: { type: "string" } } }, 1);
  const definition: PluginDefinition = { ...probe.definition,
    manifest: { ...probe.definition.manifest, actions: [probe.read, outer], capabilities: { provides: [probe.read.capability_id, outer.capability_id], consumes: [] } },
    async start(context) {
      const contribution = await probe.definition.start(context);
      assert.equal(contribution.kind, "app");
      let release: ReturnType<typeof Promise.withResolvers<void>>;
      let late: Promise<string>[];
      return { ...contribution, actions: [{ ...probe.read, handle() {
        late.push(release.promise.then(() => say.text({ owner: probe.definition.manifest.plugin_id, key: "views-probe.main.title" })));
        return say.text({ owner: probe.definition.manifest.plugin_id, key: "views-probe.main.title" });
      } }, { ...outer, async handle() {
        release = Promise.withResolvers<void>(); late = [];
        const actions = context.services!.actions!;
        try {
          const ordinary = await actions.invoke(probe.read, {});
          const forged = await actions.invoke(probe.read, {}, { locale: "en", beforeEffect: async () => undefined });
          release.resolve();
          return [ordinary, forged, ...await Promise.all(late)];
        } finally { release.resolve(); }
      } }] };
    },
  };
  const { runtime, actions } = projectRig(t, given => definitionOrigin(given) === definition ? probe.words : null);
  const installId = runtime.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants: [] }).install.install_id;
  await runtime.start(installId);
  const caller = { actor_id: "user", audience: "user" as const, project_id: DEMO_PROJECT_ID, permissions: [], locale: "zh" as const };
  const call = () => actions.client.invoke(caller, outer, {});
  assert.deepEqual(await call(), ["本轮语言", "本轮语言", "Default title", "Default title"], "the action alone carries the trusted language");
  assert.deepEqual(await runWithLocale("zh", call), ["本轮语言", "本轮语言", "Default title", "Default title"], "a settled nested invocation is outside the still-active page's language");
});
