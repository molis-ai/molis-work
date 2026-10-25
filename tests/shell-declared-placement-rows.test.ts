// W5-06 remainder, slice 1 (BL-387): what a project can make new for a Goal and how its home starts are the enabled plugins' declared
// `creates` and `start`, written into the page by the Host's render; the page scripts keep no list by plugin.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEMO_PROJECT_ID, EN, GoalProjectApplication, LocalProjectDatabase, runWithLocale, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { CLIENT_SCRIPT, PERSONAL_PLUGIN_IDS, PROJECT_SCOPED_PLUGIN_IDS } from "@molis-ai/molis-work-app-workbench";
import { buildMolisWorkWebView } from "./fixtures/web-view.js";
import { renderMolisWorkWeb, type MolisWorkWebView } from "./workbench-renderer-fixture.js";

const EVERYTHING = [...PROJECT_SCOPED_PLUGIN_IDS, ...PERSONAL_PLUGIN_IDS];

/** The Demo project's view with the plugins the project shows laid over it. */
function withView<T>(run: (view: MolisWorkWebView, goalId: string) => T): T {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-declared-rows-"));
  const databasePath = join(directory, "demo.db");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  try {
    const view = buildMolisWorkWebView(store, new GoalProjectApplication(store), { databasePath, projectId: DEMO_PROJECT_ID, demo: true });
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
const unescape = (value: string) => value.replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
const homeStarts = (html: string) => JSON.parse(unescape(/data-work-surface="home" data-home-starts="([^"]*)"/u.exec(html)![1]!)) as Array<{ id: string; title: string; hint: string; glyph: string }>;

test("RAC-600 the Goal's 「为这个 Goal 新建」 buttons are the shown plugins' declared `creates`, in the declared order", () => {
  withView((view, goalId) => {
    assert.deepEqual(creates(renderMolisWorkWeb(showing(view, EVERYTHING), goalId)).map(({ station, title, label }) => [station, title, label]), [
      ["pages", "文档", "文档"], ["form", "问卷", "问卷"], ["dataset", "数据表", "数据表"], ["ppt", "演示稿", "演示稿"],
    ]);
    assert.deepEqual(creates(renderMolisWorkWeb(only(view, ["ppt"]), goalId)).map(kind => kind.station), ["ppt"], "only the plugins the project shows");
    assert.deepEqual(creates(renderMolisWorkWeb(hiding(view, ["ppt"]), goalId)).map(kind => kind.station).includes("ppt"), false,
      "a plugin the person hid from the project makes nothing new");
    assert.deepEqual(creates(renderMolisWorkWeb(only(view, []), goalId)), []);
  });
});

test("RAC-600 RAC-603 the button reads in the request's language while the declared title stays the key the page names things by", () => {
  withView((view, goalId) => {
    const english = runWithLocale("en", () => creates(renderMolisWorkWeb(only(view, ["ppt", "form"]), goalId)));
    assert.deepEqual(english.map(({ title, label }) => [title, label]), [["问卷", "Form"], ["演示稿", "Presentation"]]);
  });
});

test("RAC-601 a new object and its card are named from the declared title on the button, not a table by plugin in the page script", () => {
  assert.match(CLIENT_SCRIPT, /placementCreateTitle/u, "the placement client reads the title off the button");
  assert.doesNotMatch(CLIENT_SCRIPT, /pages: L\("文档"\)|ppt: L\("演示稿"\)|form: L\("问卷"\)|dataset: L\("数据表"\)/u);
  assert.doesNotMatch(CLIENT_SCRIPT, /names\[station\]/u);
});

test("RAC-602 the project home's starts are the shown plugins' declared `start`, in the declared order, and the page script keeps none", () => {
  withView(view => {
    assert.deepEqual(homeStarts(renderMolisWorkWeb(showing(view, EVERYTHING))), [
      { id: "goals", title: "推进一个目标", hint: "明确要做成什么，接着往下走。", glyph: "target" },
      { id: "pages", title: "写一份文档", hint: "把思路写下来，逐步整理成作品。", glyph: "file" },
      { id: "lingguang", title: "记下一点灵感", hint: "还没想清楚，也可以先留下。", glyph: "idea" },
    ]);
    assert.deepEqual(homeStarts(renderMolisWorkWeb(only(view, ["lingguang"]))).map(start => start.id), ["goals", "lingguang"]);
    assert.deepEqual(homeStarts(renderMolisWorkWeb(only(view, []))).map(start => start.id), ["goals"], "a project that shows only Goals starts with Goals");
    assert.deepEqual(homeStarts(renderMolisWorkWeb(hiding(view, ["lingguang"]))).map(start => start.id), ["goals", "pages"]);
  });
  assert.match(CLIENT_SCRIPT, /homeStarts/u, "the home client reads the list off the page");
  assert.doesNotMatch(CLIENT_SCRIPT, /plugin: 'goals', title: |plugin: 'pages', title: |plugin: 'lingguang', title: /u);
});

test("RAC-603 every declared create title, start title and hint has its English in the dictionary the page translates with", () => {
  withView((view, goalId) => {
    const html = renderMolisWorkWeb(showing(view, EVERYTHING), goalId);
    const texts = [...creates(html).map(kind => kind.title), ...homeStarts(html).flatMap(start => [start.title, start.hint])];
    assert.equal(texts.length, 4 + 3 * 2);
    for (const text of texts) assert.ok(EN[text] && EN[text] !== text, `${text} has an English sentence`);
  });
});
