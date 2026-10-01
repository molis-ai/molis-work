import assert from "node:assert/strict";
import test from "node:test";
import { runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { renderMolisWorkProjectIndex, renderMolisWorkArrivalStylesheet } from "./workbench-renderer-fixture.js";

// The project chooser (specs/project-arrival-flow): the directory on the desk, the brief on the sheet, one bar below.
// Server-rendered, so everything the first paint shows is here; what the brief reads arrives from the Host afterwards.

// Local time, so “yesterday” and “3 hours ago” read the same wherever the suite runs.
const NOW = "2026-10-01T10:00:00";
const hoursAgo = (n: number) => new Date(Date.parse(NOW) - n * 3_600_000).toISOString();
const projects = [
  { project_id: "local-1", display_name: "工作台", data_class: "user" as const },
  { project_id: "demo-1", display_name: "Molis Work 示例项目", data_class: "regenerable_demo" as const },
  { project_id: "local-2", display_name: "另一份项目", data_class: "user" as const },
];
const arrival = (extra: Partial<Parameters<typeof renderMolisWorkProjectIndex>[3] & object> = {}) =>
  ({ now: NOW, last_project_id: null, opened: {}, ...extra });

/** The row ids in the order the directory lists them. */
const rowIds = (html: string) => [...html.matchAll(/<[^>]* data-id="([^"]+)"[^>]*role="option"|role="option"[^>]* data-id="([^"]+)"/g)].map(match => match[1] ?? match[2]);
const rowOf = (html: string, id: string) => new RegExp(`<[^>]*\\bid="row-${id}"[^>]*>`).exec(html)?.[0] ?? "";
const visibleText = (html: string) => html.replace(/<span class="project-monogram"[^>]*>[^<]*<\/span>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<template[\s\S]*?<\/template>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ");

test("the chooser is the arrival frame: titlebar, stage, and the resident bar, on its own sheet", () => {
  const html = renderMolisWorkProjectIndex(projects, "", false, arrival());
  assert.match(html, /<body class="arrival-page immersive-workbench" data-arrival="chooser">/);
  assert.match(html, /<link rel="stylesheet" href="\/assets\/molis-work-arrival\.css">/);
  assert.match(html, /<header class="arrival-titlebar" data-region="titlebar">/);
  assert.match(html, /role="img" aria-label="Molis Work"/, "the wordmark");
  assert.match(html, /class="mw-caption"/, "the chooser carries the caption");
  assert.match(html, /href="\/capabilities\/library"[^>]*>[\s\S]*?能力/);
  assert.match(html, /href="\/settings\/appearance"[^>]*>[\s\S]*?设置/);
  assert.match(html, /<div class="workbench-bar arrival-bar" data-dock data-bar="chooser"/);
  assert.match(html, /data-assistant-island|assistant-composer-input/, "the bar's centre is the assistant");
  assert.match(html, /<main class="arrival-stage" id="stage"><div class="stage-split chooser" data-view="chooser"/);
  assert.match(html, /<section class="stage-sheet chooser-detail" id="chooser-detail" aria-live="polite"/);
  assert.doesNotMatch(html, /project-index-page|project-card|data-project-search-row|migration/);
  assert.equal(html.match(/data-tauri-drag-region/g), null, "a browser has no drag region");
});

test("the personal space comes first, then projects by when they were last opened, then the rest in catalogue order", () => {
  const html = renderMolisWorkProjectIndex(projects, "", false, arrival({ opened: { "local-2": hoursAgo(2), "local-1": hoursAgo(30) } }));
  assert.deepEqual(rowIds(html), ["personal", "local-2", "local-1", "demo-1"]);
  assert.match(html, /个人[\s\S]*?项目 · 按最近打开/);
});

test("the project last opened is preselected, so Enter continues where the person was", () => {
  const picked = renderMolisWorkProjectIndex(projects, "", false, arrival({ opened: { "local-2": hoursAgo(2), "local-1": hoursAgo(30) }, last_project_id: "local-1" }));
  assert.match(picked, /data-selected="local-1"/);
  assert.match(rowOf(picked, "local-1"), /aria-selected="true"[^>]*tabindex="0"|tabindex="0"[^>]*aria-selected="true"/);
  assert.match(rowOf(picked, "local-2"), /aria-selected="false"/);
  assert.match(rowOf(picked, "local-2"), /tabindex="-1"/, "one tab stop in the list");
  assert.match(picked, /data-act="enter" href="\/projects\/local-1\/"/);
  assert.match(picked, /上次在 工作台 · 昨天/);
  // A last project that no longer exists falls back to the newest one, never to a dead link.
  const gone = renderMolisWorkProjectIndex(projects, "", false, arrival({ opened: { "local-2": hoursAgo(2) }, last_project_id: "deleted" }));
  assert.match(gone, /data-selected="local-2"/);
  assert.doesNotMatch(gone, /\/projects\/deleted/);
});

test("each row says how long ago it was opened, and a demo project says what it is", () => {
  const html = renderMolisWorkProjectIndex(projects, "", false, arrival({ opened: { "local-2": hoursAgo(2) } }));
  assert.match(rowOf(html, "local-2"), /data-opened-at="/);
  assert.match(html, /2 小时前/);
  assert.match(html, /演示数据 · 还没打开过/);
  assert.match(rowOf(html, "demo-1"), /data-demo/);
  assert.match(html, /还没打开过/);
});

test("a Home with no project opens on the personal space and offers the first project", () => {
  const html = renderMolisWorkProjectIndex([], "", false, arrival());
  assert.deepEqual(rowIds(html), ["personal"]);
  assert.match(html, /data-selected="personal"[^>]*data-projects="0"/);
  assert.match(html, /data-act="enter" href="\/projects\/personal\/"[\s\S]*?进入个人空间/);
  assert.match(html, /欢迎来到 Molis Work/);
  assert.match(html, /<template data-tpl="nobody">[\s\S]*?从一个真实项目开始[\s\S]*?带入材料新建[\s\S]*?<\/template>/);
});

test("a project list that could not be read says so where the list would be, and the personal space still opens", () => {
  const html = renderMolisWorkProjectIndex([], "", false, arrival({ load_error: true }));
  assert.match(html, /class="mw-empty mw-empty--error chooser-error" role="alert"/);
  assert.match(html, /项目列表暂时读不到/);
  assert.deepEqual(rowIds(html), ["personal"]);
  assert.doesNotMatch(html, /项目 · 按最近打开/);
});

test("what a person named a project is text, never markup", () => {
  const hostile = [{ project_id: "x1", display_name: `<img src=x onerror="alert(1)"> & "引号"`, data_class: "user" as const }];
  const html = renderMolisWorkProjectIndex(hostile, "", false, arrival());
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &quot;引号&quot;/);
  const data = /<script type="application\/json" id="arrival-data">([\s\S]*?)<\/script>/.exec(html)![1]!;
  assert.doesNotMatch(data, /</, "a name cannot close the script");
  assert.deepEqual(JSON.parse(data).projects, ["x1"]);
});

test("inside the desktop app every way on keeps the desktop shell", () => {
  const desktop = renderMolisWorkProjectIndex(projects, "", true, arrival({ opened: { "local-1": hoursAgo(1) }, last_project_id: "local-1" }));
  assert.match(desktop, /<header class="arrival-titlebar" data-region="titlebar" data-tauri-drag-region="deep">/);
  assert.match(desktop, /<body class="arrival-page immersive-workbench" data-arrival="chooser" data-native-desktop="true">/);
  assert.match(desktop, /data-act="enter" href="\/projects\/local-1\/\?desktop=1"/);
  assert.match(desktop, /data-act="new" href="\/onboarding\?mode=new-project&desktop=1"|data-act="new" href="\/onboarding\?mode=new-project&amp;desktop=1"/);
  assert.match(desktop, /data-href="\/projects\/local-2\/\?desktop=1"/);
  assert.match(desktop, /href="\/settings\/appearance\?desktop=1"/);
});

test("the control token rides in the page head and nowhere else", () => {
  const html = renderMolisWorkProjectIndex(projects, "token-123", false, arrival());
  assert.equal(html.match(/token-123/g)?.length, 1);
  assert.match(html, /<meta name="molis-work-control-token" content="token-123">/);
});

test("in English the page says nothing in Chinese except what a person named", () => {
  const html = runWithLocale("en", () => renderMolisWorkProjectIndex(projects, "", false, arrival({ opened: { "local-2": hoursAgo(2) }, last_project_id: "local-2" })));
  assert.match(html, /<html lang="en">/);
  const text = visibleText(html).replace(/工作台|Molis Work 示例项目|另一份项目/g, "");
  assert.deepEqual(text.match(/\p{Script=Han}+/gu), null);
  assert.match(text, /New project/);
  assert.match(text, /Personal space/);
});

test("the sheet keeps the desk's frame fixed while the directory and the brief scroll inside it", () => {
  const css = renderMolisWorkArrivalStylesheet();
  assert.match(css, /html:has\(> body\.arrival-page\), body\.arrival-page \{[^}]*overflow: hidden;/);
  assert.match(css, /\.chooser-dir \{ flex: 1; min-height: 0; overflow: auto;/);
  assert.match(css, /\.stage-sheet \{[^}]*overflow: auto;/);
  assert.match(css, /\.chooser \{ --side-w: clamp\(296px, 24vw, 344px\); \}/);
  assert.match(css, /@media \(max-width: 760px\) \{\s*\.stage-split \{ grid-template-columns: minmax\(0, 1fr\); grid-template-rows: auto minmax\(0, 1fr\);/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
