// W5-06 remainder, slice 1 (BL-387): what a project can make new for a Goal and how its home starts are the enabled plugins' declared
// `creates` and `start`, written into the page by the Host's render; the page scripts keep no list by plugin.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEMO_PROJECT_ID, LocalProjectDatabase, runWithLocale, seedDemoBoard, PERSONAL_PLUGIN_IDS, PROJECT_SCOPED_PLUGIN_IDS } from "@molis-ai/molis-work-app-local-host";
import { GoalProjectApplication } from "./fixtures/goal-application.js";
import { BUILTIN_PLUGIN_CATALOG, CLIENT_SCRIPT } from "@molis-ai/molis-work-app-workbench";
import { buildMolisWorkWebView } from "./fixtures/web-view.js";
import { renderMolisWorkWeb, type MolisWorkWebView } from "./workbench-renderer-fixture.js";
import { withHostPluginFacts } from "./fixtures/host-plugin-facts.js";

/** The page as the Host draws it: the plugins it shows and the marked directory are the Host's (W5-02 B1). */
const draw = (view: MolisWorkWebView, goalId?: string) => renderMolisWorkWeb(withHostPluginFacts(view), goalId);

const EVERYTHING = [...PROJECT_SCOPED_PLUGIN_IDS, ...PERSONAL_PLUGIN_IDS];

/** The Demo project's view with the plugins the project shows laid over it. */
function withView<T>(run: (view: MolisWorkWebView, goalId: string) => T): T {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-declared-rows-"));
  const databasePath = join(directory, "demo.db");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  try {
    const application = new GoalProjectApplication(store);
    application.projectOpened(DEMO_PROJECT_ID);
    // These render-only cases change UI declarations; their sample is written through the real Goals modules, without publishing that test Manifest.
    application.goals.commands.createGoal(DEMO_PROJECT_ID, {
      goal_id: "placement-goal", title: "Placement", outcome: "", why: "", business_logic: "",
      definition_state: "draft", decomposition_state: "abstract", acceptance_criteria: [],
    }, { actor_id: "test-user", idempotency_key: "placement-goal" });
    const view = buildMolisWorkWebView(store, application, { databasePath, projectId: DEMO_PROJECT_ID, demo: true });
    return run(view, view.goals[0]!.goal.goal_id);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
}

const showing = (view: MolisWorkWebView, enabled: readonly string[]) => ({ ...view, enabled_plugins: [...enabled], hidden_plugins: [] }) as MolisWorkWebView;
/** A project that shows Goals and `keep` and nothing else: personal plugins are shown unless hidden, so the others are hidden. */
const hiding = (view: MolisWorkWebView, hidden: readonly string[]) => ({ ...view, enabled_plugins: EVERYTHING.filter(id => !hidden.includes(id)), hidden_plugins: [...hidden] }) as MolisWorkWebView;
const only = (view: MolisWorkWebView, keep: readonly string[]) => ({ ...view,
  enabled_plugins: ["goals", ...keep.filter(id => PROJECT_SCOPED_PLUGIN_IDS.includes(id) && id !== "goals")],
  hidden_plugins: PERSONAL_PLUGIN_IDS.filter(id => !keep.includes(id)) }) as MolisWorkWebView;
const creates = (html: string) => [...html.matchAll(/data-placement-create="([^"]*)" data-placement-create-title="([^"]*)"[^>]*>([^<]*)</gu)]
  .map(([, station, title, label]) => ({ station, title, label }));

test("RAC-600 the Goal's 「为这个 Goal 新建」 buttons are the shown plugins' declared `creates`, in the declared order", () => {
  withView((view, goalId) => {
    assert.deepEqual(creates(draw(showing(view, EVERYTHING), goalId)).map(({ station, title, label }) => [station, title, label]), [
      ["pages", "文档", "文档"], ["form", "问卷", "问卷"], ["dataset", "数据表", "数据表"], ["ppt", "演示稿", "演示稿"],
    ]);
    assert.deepEqual(creates(draw(only(view, ["ppt"]), goalId)).map(kind => kind.station), ["ppt"], "only the plugins the project shows");
    assert.deepEqual(creates(draw(hiding(view, ["ppt"]), goalId)).map(kind => kind.station).includes("ppt"), false,
      "a plugin the person hid from the project makes nothing new");
    assert.deepEqual(creates(draw(only(view, []), goalId)), []);
  });
});

test("RAC-600 RAC-603 the button reads in the request's language while the declared title stays the key the page names things by", () => {
  withView((view, goalId) => {
    const english = runWithLocale("en", () => creates(draw(only(view, ["ppt", "form"]), goalId)));
    assert.deepEqual(english.map(({ title, label }) => [title, label]), [["问卷", "Form"], ["演示稿", "Presentation"]]);
  });
});

test("RAC-601 a new object and its card are named from the declared title on the button, not a table by plugin in the page script", () => {
  assert.match(CLIENT_SCRIPT, /placementCreateTitle/u, "the placement client reads the title off the button");
  assert.doesNotMatch(CLIENT_SCRIPT, /pages: L\("文档"\)|ppt: L\("演示稿"\)|form: L\("问卷"\)|dataset: L\("数据表"\)/u);
  assert.doesNotMatch(CLIENT_SCRIPT, /names\[station\]/u);
});

test("RAC-602 SCS-11: the page asks the protected homepage for starts instead of embedding a separate list", () => {
  withView(view => assert.doesNotMatch(draw(showing(view, EVERYTHING)), /data-home-starts/u));
  assert.match(CLIENT_SCRIPT, /\/api\/host\/surface-home/u);
});

test("RAC-603 every declared create title is worded in English with its own plugin's words", () => {
  withView((view, goalId) => {
    const html = runWithLocale("en", () => draw(showing(view, EVERYTHING), goalId));
    const texts = creates(html).map(kind => kind.label);
    assert.equal(texts.length, 4);
    for (const text of texts) assert.doesNotMatch(text, /[\u4e00-\u9fff]/u, `${text} reads in English`);
  });
});

test("RAC-600 RAC-602 page defaults, an explicit empty selection, hidden personal plugins and an explicit selection keep their own visible entries", () => {
  withView((view, goalId) => {
    const defaults = { ...view };
    delete defaults.enabled_plugins;
    delete defaults.hidden_plugins;
    const defaultHtml = draw(defaults, goalId);
    assert.deepEqual(creates(defaultHtml).map(kind => kind.station), ["pages", "form", "dataset", "ppt"]);

    const emptyHtml = draw({ ...defaults, enabled_plugins: [] }, goalId);
    assert.deepEqual(creates(emptyHtml), [], "an unshown Goals owner draws no Goal input buttons");
    assert.doesNotMatch(emptyHtml, /<[^>]+\b(?:data-work-surface="goals"|data-goal-inputs\b)/u);

    const goalHtml = draw({ ...defaults, enabled_plugins: ["goals"] }, goalId);
    assert.deepEqual(creates(goalHtml).map(({ station, title, label }) => [station, title, label]), [
      ["pages", "文档", "文档"], ["form", "问卷", "问卷"], ["dataset", "数据表", "数据表"], ["ppt", "演示稿", "演示稿"],
    ], "a shown Goal keeps every visible personal plugin's declared create");

    const hiddenHtml = draw({ ...defaults, hidden_plugins: ["pages", "form", "dataset", "ppt", "lingguang"] }, goalId);
    assert.deepEqual(creates(hiddenHtml), []);

    const explicitHtml = draw(only(view, ["ppt"]), goalId);
    assert.deepEqual(creates(explicitHtml).map(kind => kind.station), ["ppt"]);
  });
});

test("RAC-600 RAC-602 a default project's declared create reaches the real page, remains absent from an explicit empty selection, and stays escaped", t => {
  // Today's creates all belong to personal plugins. Give an already-default project plugin a legal create declaration so that
  // the page's wrong empty fallback cannot pass just because the current personal declarations hide the difference.
  const goals = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "goals");
  assert.ok(goals);
  const original = Object.getOwnPropertyDescriptor(goals.manifest.ui, "views");
  assert.ok(original);
  const views = goals.manifest.ui.views!.map(view => view.slot === "navigator"
    ? { ...view, creates: { station: "default-goal", title: '默认 "</button><script>&' },
      start: { title: '起点 "</script>&', hint: '说明 " onmouseover="alert(1)', icon: "target" } } : view);
  Object.defineProperty(goals.manifest.ui, "views", { ...original, value: views });
  t.after(() => Object.defineProperty(goals.manifest.ui, "views", original));

  withView((view, goalId) => {
    const defaults = { ...view };
    delete defaults.enabled_plugins;
    delete defaults.hidden_plugins;
    const html = draw(defaults, goalId);
    assert.deepEqual(creates(html).map(kind => kind.station), ["default-goal", "pages", "form", "dataset", "ppt"]);
    assert.deepEqual(creates(html)[0], { station: "default-goal", title: "默认 &quot;&lt;/button&gt;&lt;script&gt;&amp;", label: "默认 &quot;&lt;/button&gt;&lt;script&gt;&amp;" });
    assert.doesNotMatch(html, /默认 "<\/button><script>&/u);
    assert.doesNotMatch(html, /data-home-starts|起点 "<\/script>&/u);

    const goalHtml = draw({ ...defaults, enabled_plugins: ["goals"] }, goalId);
    assert.deepEqual(creates(goalHtml), creates(html), "an explicitly shown Goal keeps the same declared titles and escaping");
    assert.doesNotMatch(goalHtml, /默认 "<\/button><script>&|起点 "<\/script>&/u);

    const empty = draw({ ...defaults, enabled_plugins: [] }, goalId);
    assert.deepEqual(creates(empty), []);
    assert.doesNotMatch(empty, /<[^>]+\b(?:data-work-surface="goals"|data-goal-inputs\b)/u);
  });
});
