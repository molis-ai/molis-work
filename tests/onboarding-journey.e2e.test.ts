import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { TodoBatch } from "@molis-ai/molis-work-contracts/modules/todo";
import { TODO_ACTION_PERMISSIONS, todoOrganizeActions } from "@molis-ai/molis-work-plugin-todo";
import { withContextJourneys, type ContextJourney, type ContextReference } from "../apps/local-host/src/context-onboarding-store.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { assertLayoutClean } from "./fixtures/layout-audit.js";

// The way in for a new person and for a new project, in a real browser (specs/project-arrival-flow): the opening, the
// two Welcome questions, and the journey from existing materials to a named project. The first test follows a person
// through it; the rest put every screen — including the ones that need a journey already part-way — at every width, in
// light and dark, and check that nothing overlaps, is cut off, or out of reach.

const MAIL = "小王你好，请周五前发新版方案，预算等小李确认。另外，下周的团建改到周四，大家知悉。";
const TODOS = JSON.stringify({
  candidates: [
    { ref: "c1", kind: "request", title: "发送新版方案", why: "张总要求周五前收到", owner: { who: "你", stated: true }, due: { date: null, phrase: null }, placement: "project",
      evidence: [{ material: 1, excerpt: "请周五前发新版方案" }], depends_on: ["c2"] },
    { ref: "c2", kind: "waiting", title: "等待小李确认预算", why: "预算要小李确认", owner: { who: "小李", stated: true }, due: { date: null, phrase: null }, placement: "project",
      waiting: { who: "小李", what: "确认预算" }, evidence: [{ material: 1, excerpt: "预算等小李确认" }] },
    { ref: "c3", kind: "suggestion", title: "今天催小李确认预算，并把新版方案里还没定的预算项逐条列给他看一遍", why: "预算影响周五交付", owner: { who: "你", stated: false }, due: { date: null, phrase: null },
      evidence: [{ material: 1, excerpt: "预算等小李确认" }] },
  ],
  reference_only: [{ summary: "团建改到周四（通知）", material: 1 }],
});
const LONG_NAME = "一个名字特别特别长的项目——用来确认标题、预览和底栏里的名字都不会顶破各自的框，也不会盖住旁边的按钮";
const SUMMARY = `# 新版方案\n\n## 当前进展\n张总要求周五前发新版方案，预算等小李确认；团建改到周四。[S1]\n\n## 下一步\n1. 周四前把预算项列给小李，请他逐条确认。[S1]\n2. **周五上午**把新版方案发给张总。\n\n一段很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长的话，用来确认摘要里的长行会自己折行而不是撑出横向滚动条。https://example.com/a/very/long/path/that/never/breaks/anywhere/at/all/in/the/text`;

const reference = (n: number, title = `材料 ${n}：张总的邮件`): ContextReference => ({
  source_id: `m${n}`, version: 1, label: `S${n}`, title, path: `${title}.md`, body: MAIL,
  original: { filename: `${title}.md`, mime: "text/markdown", data_base64: Buffer.from(MAIL).toString("base64") },
});
const fileMeta = (count: number) => Array.from({ length: count }, (_, index) => ({
  path: index % 3 === 0 ? `会议纪要/第${index + 1}次产品评审会议纪要与后续跟进事项的完整记录（含各方意见）.md` : `资料-${index + 1}.md`,
  size: 800 + index * 410, modified_ms: 1_700_000_000_000, identity: "upload",
}));

/** An isolated Home with a stub model: a Todo batch can be organized, so a journey can already be reviewing drafts. */
async function openJourneyBrowser(t: TestContext, mode: true | "empty") {
  const browser = await openGoalBrowser(t, mode, undefined, async () => TODOS);
  if (!browser) return null;
  const { command, sessionId, evaluate, waitFor, navigate, origin, homeDirectory, localHost } = browser;
  const view = (width: number, height = 900, scheme: "light" | "dark" = "light") => Promise.all([
    command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId),
    command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: scheme }] }, sessionId),
  ]);
  const press = async (key: string) => {
    const base = { key, code: key, windowsVirtualKeyCode: key === "Enter" ? 13 : 27 };
    // Enter is typed with its character, so a field's form takes it as a submit the way a keyboard does.
    await command("Input.dispatchKeyEvent", key === "Enter" ? { type: "keyDown", ...base, text: "\r", unmodifiedText: "\r" } : { type: "rawKeyDown", ...base }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", ...base }, sessionId);
  };
  const go = (path: string) => navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
  const seed = (build: (journey: ContextJourney) => void) => {
    const id = randomUUID();
    withContextJourneys(homeDirectory, store => { const journey = store.create(id); build(journey); return store.save(journey); });
    return id;
  };
  const batch = async () => (await localHost!.homeActionClient().invoke({ actor_id: "web-user", project_id: null, audience: "user", permissions: [...TODO_ACTION_PERMISSIONS, "model:invoke"] },
    todoOrganizeActions.extract, { title: "开始使用时整理的待办", origin: "onboarding", materials: [{ title: "张总：新版方案", text: MAIL }] }) as { batch: TodoBatch }).batch;
  /** The input a `webkitdirectory` chooser takes is a directory path; the browser lists what it holds. */
  const setFiles = async (selector: string, paths: string[]) => {
    const { root } = await command<{ root: { nodeId: number } }>("DOM.getDocument", { depth: 0 }, sessionId);
    const { nodeId } = await command<{ nodeId: number }>("DOM.querySelector", { nodeId: root.nodeId, selector }, sessionId);
    assert.ok(nodeId, `no input ${selector}`);
    await command("DOM.setFileInputFiles", { nodeId, files: paths }, sessionId);
  };
  await command("DOM.enable", {}, sessionId);
  return { ...browser, view, press, go, seed, batch, setFiles, evaluate, waitFor };
}
const screen = (name: string) => `document.querySelector('.arrival')?.dataset.screen === ${JSON.stringify(name)}`;
const obView = (name: string) => `!!document.querySelector('[data-ob-view=${JSON.stringify(name)}]')`;
const resetIntro = "try { sessionStorage.clear(); localStorage.removeItem('molis-work:onboarding-intro'); } catch {}";

test("a new person's first run: the opening, two questions, materials, a name, and the project they made", { timeout: 180_000 }, async t => {
  const journey = await openJourneyBrowser(t, "empty");
  if (!journey) return;
  const { view, press, go, setFiles, evaluate, waitFor, click, navigate, origin } = journey;
  const folder = await mkdtemp(join(tmpdir(), "molis-arrival-files-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  for (const name of ["首版功能范围.md", "用户访谈-0926.md", "竞品笔记.md", "设计评审纪要.txt"]) await writeFile(join(folder, name), `# ${name}\n\n${"这是一份示例材料，用来确认带入、阅读和保存的每一步。".repeat(20)}`);
  await view(1440);

  // The way in lands on the first run, and a new person sees the opening on a screen of its own.
  await go("/");
  assert.equal(await evaluate("location.pathname"), "/onboarding");
  assert.equal(await evaluate("document.body.dataset.onboardingMode"), "first_run");
  await waitFor(screen("opening"));
  await waitFor("document.querySelector('.opening')?.classList.contains('is-done')");
  assert.ok(await evaluate("!!document.querySelector('.opening .mw-wordmark') && !!document.querySelector('.opening [data-caption]')"), "the wordmark and the caption");
  assert.equal(await evaluate("document.querySelector('[data-action=intro-next] .mw-btn__key').textContent"), "↵");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.arrival-tools')).visibility"), "hidden", "no global entrances on the opening");
  await assertLayoutClean(evaluate, "opening");
  await press("Enter");
  await waitFor(screen("welcome") + " && document.querySelector('.welcome')?.dataset.step === 'language'");
  assert.equal(await evaluate("document.querySelectorAll('.mw-steps li').length"), 6);
  assert.equal(await evaluate("[...document.querySelectorAll('.mw-steps li')].findIndex(li => li.hasAttribute('aria-current'))"), 0);
  assert.equal(await evaluate("document.querySelector('#cx-exit').textContent.trim()"), "稍后再说");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.arrival-global')).display"), "none", "only the theme switch stays in the titlebar");
  await assertLayoutClean(evaluate, "language");
  // Choosing English reloads the page in English and the person is still on the same question.
  await navigate(() => click(".welcome-options a[hreflang=en]"));
  await waitFor("document.documentElement.lang === 'en' && document.querySelector('.welcome')?.dataset.step === 'language'");
  assert.equal(await evaluate("document.querySelector('#ob-title').textContent"), "Language");
  assert.equal(await evaluate("document.querySelector('#cx-exit').textContent.trim()"), "Not now");
  assert.deepEqual(await evaluate("document.body.innerText.replace('简体中文', '').match(/\\p{Script=Han}/gu)"), null, "nothing is left in Chinese but the language's own name");
  await assertLayoutClean(evaluate, "language, English");
  await navigate(() => click(".welcome-options a[hreflang=zh]"));
  await waitFor("document.documentElement.lang.startsWith('zh') && document.querySelector('.welcome')?.dataset.step === 'language'");
  await press("Enter");
  await waitFor("document.querySelector('.welcome')?.dataset.step === 'appearance'");
  await click("[data-theme-option=dark]");
  assert.equal(await evaluate("document.documentElement.dataset.resolvedTheme"), "dark", "a theme takes hold the moment it is chosen");
  await assertLayoutClean(evaluate, "appearance, dark");
  await click("[data-theme-option=light]");
  // The option just chosen has the focus, so Enter would choose it again; the button in the bar goes on.
  await click("[data-action=intro-next]");
  await waitFor(obView("sources"));
  assert.equal(await evaluate("document.querySelector('#ob-title').textContent"), "带入已有的材料");
  assert.equal(await evaluate("document.querySelectorAll('.ob-source').length"), 5);
  assert.equal(await evaluate("document.querySelector('[data-action=prepare]').disabled"), true, "nothing to confirm yet");
  assert.match(await evaluate<string>("document.querySelector('.arrival-bar .mw-bar-status').textContent"), /还没有材料/);
  await assertLayoutClean(evaluate, "sources, empty");

  // A folder: its files are listed by name and size at once, and a pasted page adds a group beside it.
  await click("[data-open=folder]");
  assert.ok(await evaluate("!!document.querySelector('#cfgp-folder')"), "the row opens where it is");
  await setFiles("#cx-upload-directory", [folder]);
  await waitFor("document.querySelectorAll('.ob-right .mw-file-group .mw-file-row').length === 4");
  assert.match(await evaluate<string>("document.querySelector('.arrival-bar .mw-bar-status strong').textContent"), /已添加 4 份材料/);
  assert.match(await evaluate<string>("document.querySelector('[data-open=folder] .mw-dir-row__count').textContent"), /已添加 4/);
  await assertLayoutClean(evaluate, "sources, folder added");
  await click("[data-open=browser]");
  await evaluate("document.getElementById('cx-browser-text').focus()");
  await journey.command("Input.insertText", { text: "这是一段从网页复制来的正文。" }, journey.sessionId);
  await waitFor("document.querySelectorAll('.ob-right .mw-file-group').length === 2");
  assert.equal(await evaluate("document.activeElement?.id"), "cx-browser-text", "typing is not interrupted by the list redrawing");
  await assertLayoutClean(evaluate, "sources, two groups");
  await click(".ob-right .mw-file-group[data-group=browser] .mw-file-group__x");
  await waitFor("document.querySelectorAll('.ob-right .mw-file-group').length === 1");

  // Confirm the scope: each file is a choice, and unchecking one makes its group read as partly chosen.
  await click("[data-action=prepare]");
  await waitFor(obView("preview"));
  assert.ok(await evaluate("document.querySelectorAll('.ob-right .mw-file-row .mw-check').length >= 4 && document.querySelectorAll('.ob-meter').length === 2"));
  await click(".ob-right .mw-file-row .mw-check[data-file]");
  await waitFor("document.querySelector('.mw-file-group__count')?.textContent.trim() === '3/4'");
  assert.equal(await evaluate("document.querySelector('.mw-file-group__head .mw-check').indeterminate"), true);
  assert.equal(await evaluate("document.activeElement?.matches('.mw-check[data-file]')"), true, "the focus stays on the row that changed");
  await assertLayoutClean(evaluate, "scope");
  await click("[data-action=sources]");
  await waitFor(obView("sources"));
  assert.equal(await evaluate("document.querySelectorAll('.ob-right .mw-file-group').length"), 1, "going back keeps what was added");
  await click("[data-action=prepare]");
  await waitFor(obView("preview"));

  // No model is connected in this Home: the materials are kept, and the person names the project they begin.
  assert.equal(await evaluate("document.querySelector('[data-action=start] [data-slot=button-label]').textContent"), "先带入资料");
  await click("[data-action=start]");
  await waitFor(obView("materials"), 20_000);
  assert.ok(await evaluate("!!document.querySelector('[data-action=materials-only]')"));
  await assertLayoutClean(evaluate, "materials ready");
  await click("[data-action=materials-only]");
  await waitFor("!!document.getElementById('cx-blank-name')");
  await evaluate("document.getElementById('cx-blank-name').focus()");
  await journey.command("Input.insertText", { text: LONG_NAME }, journey.sessionId);
  assert.equal(await evaluate("document.querySelector('.ob-project-name').textContent"), LONG_NAME, "the preview follows the name as it is typed");
  await assertLayoutClean(evaluate, "naming, long name");
  await navigate(() => press("Enter"));
  await waitFor("location.pathname.startsWith('/projects/')", 20_000);
  assert.match(await evaluate<string>("location.pathname"), /^\/projects\/[^/]+\/?$/);
  const created = await (await fetch(origin + "/api/settings/projects")).json() as { projects: Array<{ display_name: string }> };
  assert.deepEqual(created.projects.map(project => project.display_name), [LONG_NAME]);
});

const SCREENS: Array<{ name: string; width: number; height?: number }> = [
  { name: "1920", width: 1920, height: 1080 }, { name: "1440", width: 1440 }, { name: "1024", width: 1024, height: 700 },
  { name: "768", width: 768, height: 800 }, { name: "600", width: 600, height: 800 }, { name: "390 phone", width: 390, height: 844 }, { name: "375 phone", width: 375, height: 667 }, { name: "320 phone", width: 320, height: 568 },
];

test("the opening and the two questions lay out cleanly at every width, in light and dark", { timeout: 300_000 }, async t => {
  const journey = await openJourneyBrowser(t, "empty");
  if (!journey) return;
  const { view, press, go, evaluate, waitFor } = journey;
  for (const scheme of ["light", "dark"] as const) {
    for (const { name, width, height } of SCREENS) {
      const where = (state: string) => `${state} · ${name} · ${scheme}`;
      await view(width, height ?? 900, scheme);
      await go("/onboarding");
      await evaluate(resetIntro);
      await go("/onboarding");
      await waitFor(screen("opening"));
      await waitFor("document.querySelector('.opening')?.classList.contains('is-done')");
      await assertLayoutClean(evaluate, where("opening"));
      await press("Enter");
      await waitFor("document.querySelector('.welcome')?.dataset.step === 'language'");
      await assertLayoutClean(evaluate, where("language"));
      await press("Enter");
      await waitFor("document.querySelector('.welcome')?.dataset.step === 'appearance'");
      await assertLayoutClean(evaluate, where("appearance"));
      await press("Enter");
      await waitFor(obView("sources"));
      await assertLayoutClean(evaluate, where("sources, empty"));
    }
  }
});

/** Every screen the journey can be on that a person reaches only part-way: each is a journey the Host already holds. */
async function seededScreens(journey: NonNullable<Awaited<ReturnType<typeof openJourneyBrowser>>>): Promise<Array<[string, string, string]>> {
  const { seed, batch } = journey;
  const drafts = await batch();
  const scope = seed(item => {
    item.sources = [
      { kind: "directory", selected: true, days: 30, excluded: ["资料-2.md"], files: fileMeta(24).map(file => ({ path: file.path, data: Buffer.from("x").toString("base64") })), metadata: { files: fileMeta(24), skipped: 3, truncated: false } },
      { kind: "browser", selected: true, text: MAIL.repeat(40), url: "https://example.com/some/very/long/address/that/goes/on/and/on/and/on" },
    ];
    item.previewed = true;
  });
  const added = seed(item => {
    item.sources = [{ kind: "directory", selected: true, days: 30, files: fileMeta(12).map(file => ({ path: file.path, data: Buffer.from("x").toString("base64") })), metadata: { files: fileMeta(12), skipped: 0, truncated: false } },
      { kind: "browser", selected: true, text: MAIL }];
  });
  const reviewWithDrafts = seed(item => {
    item.sources = [{ kind: "browser", selected: true, references: [reference(1)] }];
    item.phase = "review";
    item.summary = { title: "新版方案", body: SUMMARY, references: [reference(1), reference(2, "材料 2：预算表（含各部门明细与历史对比的完整版本）")] };
    item.todo = { status: "ready", batch_id: drafts.batch_id, batch: drafts, error: null };
  });
  const reviewPlain = seed(item => {
    item.sources = [{ kind: "browser", selected: true, references: [reference(1)] }];
    item.phase = "review";
    item.summary = { title: LONG_NAME, body: SUMMARY, references: [reference(1)] };
    item.todo = { status: "failed", batch_id: null, batch: null, error: "模型暂时没有响应" };
  });
  const interrupted = seed(item => {
    item.sources = [{ kind: "browser", selected: true, references: [reference(1)] }, { kind: "directory", selected: true, error: "读取 会议纪要/第1次产品评审会议纪要与后续跟进事项的完整记录（含各方意见）.md 失败：文件已移动", files: [{ path: "a.md", data: "" }] }];
    item.phase = "failed";
    item.error = "上次整理已中断，已读取的材料仍在。可以继续。";
  });
  const needsModel = seed(item => {
    item.sources = [{ kind: "directory", selected: true, references: [reference(1), reference(2, "竞品笔记"), reference(3, "设计评审纪要与后续跟进事项的完整记录")], skipped: 2 }];
    item.phase = "failed";
    item.needs_model = true;
    item.error = "尚未连接文字模型";
  });
  const saving = seed(item => {
    item.sources = [{ kind: "browser", selected: true, references: [reference(1)] }];
    item.phase = "failed";
    item.adoption = { title: LONG_NAME, body: SUMMARY, blank: false };
    item.summary = { title: "新版方案", body: SUMMARY, references: [reference(1)] };
  });
  const reselect = seed(item => {
    item.sources = [{ kind: "browser", selected: true, references: [{ ...reference(1), original: undefined as never }] }];
    item.phase = "review";
  });
  return [
    ["sources, nothing added", "/onboarding?mode=new-project", obView("sources")],
    ["sources, materials added", `/onboarding?mode=new-project&journey=${added}`, `${obView("sources")} && document.querySelectorAll('.ob-right .mw-file-group').length === 2`],
    ["scope, long names", `/onboarding?mode=new-project&journey=${scope}`, `${obView("preview")} && document.querySelectorAll('.mw-file-row').length > 20`],
    ["reading, interrupted", `/onboarding?mode=new-project&journey=${interrupted}`, obView("reading")],
    ["materials ready", `/onboarding?mode=new-project&journey=${needsModel}`, obView("materials")],
    ["review with drafts", `/onboarding?mode=new-project&journey=${reviewWithDrafts}`, `${obView("review")} && document.querySelectorAll('[data-draft]').length === 3`],
    ["review, long name, no drafts", `/onboarding?mode=new-project&journey=${reviewPlain}`, obView("review")],
    ["saving, interrupted", `/onboarding?mode=new-project&journey=${saving}`, obView("saving")],
    ["choose the materials again", `/onboarding?mode=new-project&journey=${reselect}`, obView("reselect")],
    ["naming, long name", `/onboarding?mode=new-project&start=blank&name=${encodeURIComponent(LONG_NAME)}`, `${obView("blank")} && !!document.getElementById('cx-blank-name')`],
    ["naming, empty", "/onboarding?mode=new-project&start=blank", `${obView("blank")} && !!document.getElementById('cx-blank-name')`],
    ["the guide cannot open", `/onboarding?mode=new-project&journey=${randomUUID()}`, obView("error")],
    ["after an update", "/onboarding?mode=update", screen("update")],
  ];
}

test("every screen of the journey lays out cleanly at every width, in light and dark — including a long name, long files and drafts", { timeout: 600_000 }, async t => {
  const journey = await openJourneyBrowser(t, true);
  if (!journey) return;
  const { view, go, evaluate, waitFor, click } = journey;
  const states = await seededScreens(journey);
  for (const scheme of ["light", "dark"] as const) {
    for (const { name, width, height } of SCREENS) {
      await view(width, height ?? 900, scheme);
      for (const [state, path, ready] of states) {
        await go(path + (width >= 760 ? "&desktop=1" : ""));
        await waitFor(ready, 10_000);
        await assertLayoutClean(evaluate, `${state} · ${name} · ${scheme}`);
      }
      // A source's own settings are part of the list: open each, one at a time.
      await go("/onboarding?mode=new-project");
      await waitFor(obView("sources"));
      for (const row of ["folder", "files", "browser", "gmail", "chat"]) {
        await click(`[data-open=${row}]`);
        await waitFor(`!!document.querySelector('#cfgp-${row}')`);
        await assertLayoutClean(evaluate, `${row} settings open · ${name} · ${scheme}`);
      }
    }
  }
});

test("in English every screen of the journey lays out cleanly too: longer words, the same room", { timeout: 300_000 }, async t => {
  const journey = await openJourneyBrowser(t, true);
  if (!journey) return;
  const { view, go, evaluate, waitFor, command, sessionId, origin } = journey;
  await command("Network.enable", {}, sessionId);
  await command("Network.setCookie", { name: "molis_work_locale", value: "en", url: origin }, sessionId);
  const states = await seededScreens(journey);
  for (const { name, width, height } of SCREENS.filter(screen => ["1440", "768", "390 phone", "320 phone"].includes(screen.name))) {
    await view(width, height ?? 900, "light");
    for (const [state, path, ready] of states) {
      await go(path + (width >= 760 ? "&desktop=1" : ""));
      await waitFor(ready, 10_000);
      await assertLayoutClean(evaluate, `${state} · ${name} · English`);
    }
  }
});

test("a new project begun from the chooser starts at the sources, a blank start can be named and left, and the way back is the chooser", { timeout: 90_000 }, async t => {
  const journey = await openJourneyBrowser(t, true);
  if (!journey) return;
  const { view, go, evaluate, waitFor, click, navigate } = journey;
  await view(1440);
  await go("/onboarding?mode=new-project&name=Footballnia");
  await waitFor(`${obView("blank")} && !!document.getElementById('cx-blank-name')`);
  assert.equal(await evaluate("document.getElementById('cx-blank-name').value"), "Footballnia", "the name typed in the chooser's search comes with it");
  assert.equal(await evaluate("document.querySelector('.ob-project-name').textContent"), "Footballnia");
  assert.equal(await evaluate("document.querySelector('#cx-exit').textContent.trim()"), "返回项目");
  assert.equal(await evaluate("document.querySelectorAll('.mw-steps li').length"), 4, "no Welcome questions on the way to a second project");
  await click("[data-action=back]");
  await waitFor(obView("sources"));
  await navigate(() => click("#cx-exit"));
  assert.equal(await evaluate("location.pathname"), "/");
  await waitFor("document.querySelector('.chooser')");
});

test("the update page says what is new, offers one way on, and goes on to the chooser", { timeout: 60_000 }, async t => {
  const journey = await openJourneyBrowser(t, true);
  if (!journey) return;
  const { view, go, evaluate, waitFor, click, navigate, origin } = journey;
  await view(1440);
  await go("/onboarding?mode=update");
  await waitFor(screen("update"));
  assert.match(await evaluate<string>("document.querySelector('#onboarding-update-title').textContent"), /Molis Work 已更新/);
  assert.equal(await evaluate("document.querySelectorAll('.ob-update-list li').length"), 2);
  assert.equal(await evaluate("document.querySelector('[data-onboarding-dismiss=update] .mw-btn__key').textContent"), "↵");
  await assertLayoutClean(evaluate, "update page");
  // Dismissing records that this version was seen; the page stays the way into the chooser.
  await navigate(() => click("[data-onboarding-dismiss=update]"));
  assert.equal(await evaluate("location.pathname"), "/");
  const status = await (await fetch(origin + "/api/onboarding/status")).json() as { update_required?: boolean };
  assert.notEqual(status.update_required, true);
});
