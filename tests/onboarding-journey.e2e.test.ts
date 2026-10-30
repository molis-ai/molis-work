import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { TodoBatch } from "@molis-ai/molis-work-plugin-todo/contract";
import { TODO_ACTION_PERMISSIONS, todoOrganizeActions } from "@molis-ai/molis-work-plugin-todo";
import { withContextJourneys, type ContextJourney, type ContextReference } from "../apps/local-host/dist/context-onboarding-store.js";
import { startContextJourney, waitContextJourney } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { assertLayoutClean } from "./fixtures/layout-audit.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";

// The way in for a new person and for a new project, in a real browser (specs/archive/project-arrival-flow): the opening, the
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

// Every seeded material is the same mail; the journey's staging holds it once, as its file and as its text, under its digest.
const MAIL_SHA256 = createHash("sha256").update(MAIL).digest("hex");
const reference = (n: number, title = `材料 ${n}：张总的邮件`): ContextReference => ({
  source_id: `m${n}`, version: 1, label: `S${n}`, title, path: `${title}.md`, text: { sha256: MAIL_SHA256, bytes: Buffer.byteLength(MAIL), chars: MAIL.length },
  original: { filename: `${title}.md`, mime: "text/markdown", sha256: MAIL_SHA256, size_bytes: Buffer.byteLength(MAIL) },
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
    for (const kind of ["files", "texts"]) {
      const directory = join(homeDirectory, "context-onboarding", "journeys", id, kind);
      mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, MAIL_SHA256), MAIL);
    }
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

/** Ignored review evidence from the actual page; no tracked screenshot group is added. */
async function reviewShot(journey: NonNullable<Awaited<ReturnType<typeof openJourneyBrowser>>>, name: string) {
  const directory = join(process.cwd(), ".impeccable", "qa", "review", "onboarding-review-fixes");
  await mkdir(directory, { recursive: true });
  const { data } = await journey.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, journey.sessionId);
  await writeFile(join(directory, name + ".png"), Buffer.from(data, "base64"));
}

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
  assert.equal(await evaluate("document.querySelectorAll('.mw-steps li').length"), 7);
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
  // The sources are a list on the Welcome steps' sheet; the bar is theirs too (the way back, then skip and go on), and the empty card says what goes there.
  assert.equal(await evaluate("document.querySelectorAll('.welcome.onboard .ob-sources .ob-source').length"), 5);
  assert.equal(await evaluate("document.querySelector('[data-open=files] .ob-source__act.mw-btn').textContent"), "添加", "a row says what pressing it does, drawn as a button");
  assert.equal(await evaluate("document.querySelector('[data-action=prepare]').disabled"), true, "nothing to confirm yet");
  assert.equal(await evaluate("document.querySelector('.arrival-bar .mw-bar-status')"), null);
  assert.match(await evaluate<string>("document.querySelector('.ob-right .ob-scene-note').textContent"), /材料会按来源排在这里/);
  // ONB-INT-02: the 200 / 50 MB / 20 MB line was the old cap (2026-10-22). The sources step says there is no cap.
  assert.doesNotMatch(await evaluate<string>("document.querySelector('.ob-left').textContent"), /200 份|50 MB|20 MB/);
  assert.match(await evaluate<string>("document.querySelector('.ob-left').textContent"), /不限份数和大小/);
  await assertLayoutClean(evaluate, "sources, empty");

  // A folder: its files are listed by name and size at once, and a pasted page adds a group beside it.
  // A source that only chooses files opens the system chooser at once: one press, nothing to open first.
  await journey.command("Page.setInterceptFileChooserDialog", { enabled: true }, journey.sessionId);
  await evaluate("window.chosen = []; const open = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function () { window.chosen.push(this.id); return open.call(this); };");
  await click("[data-open=folder]");
  assert.deepEqual(await evaluate("window.chosen"), ["cx-upload-directory"], "the folder choice opens the chooser");
  assert.equal(await evaluate("document.querySelector('.ob-source__cfg')"), null, "and opens no settings of its own");
  await setFiles("#cx-upload-directory", [folder]);
  await waitFor("document.querySelectorAll('.ob-right .mw-file-group .mw-file-row').length === 4");
  assert.match(await evaluate<string>("document.querySelector('.ob-right .ob-stage-head span').textContent"), /^4 份/);
  assert.equal(await evaluate("document.querySelector('[data-open=folder] .ob-source__act.is-added').textContent"), "已添加 4");
  assert.ok(await evaluate("!!document.querySelector('.arrival-bar [data-action=blank]')"), "the step can still be skipped");
  await assertLayoutClean(evaluate, "sources, folder added");
  await click("[data-open=browser]");
  await evaluate("document.getElementById('cx-browser-text').focus()");
  await journey.command("Input.insertText", { text: "这是一段从网页复制来的正文。" }, journey.sessionId);
  await waitFor("document.querySelectorAll('.ob-right .mw-file-group').length === 2");
  assert.equal(await evaluate("document.activeElement?.id"), "cx-browser-text", "typing is not interrupted by the list redrawing");
  await assertLayoutClean(evaluate, "sources, two groups");
  await click(".ob-right .mw-file-group[data-group=browser] .mw-file-group__x");
  await waitFor("document.querySelectorAll('.ob-right .mw-file-group').length === 1");

  // Confirm the scope: the next step is the model, and the file list is the step behind it.
  await click("[data-action=prepare]");
  await waitFor(`${obView("model")} && !!document.querySelector('[data-action=model-back]')`);
  assert.equal(await evaluate("(document.querySelector('.ob-right')?.textContent || '').includes('首版功能范围')"), false, "the model step does not list the files");
  await click("[data-action=model-back]");
  await waitFor(obView("preview"));
  assert.ok(await evaluate("document.querySelectorAll('.ob-right .mw-file-row .mw-check').length >= 4"));
  // No count or size limit (user 2026-10-22): no meters against a cap, no “up to 200 files / 50 MB”.
  assert.equal(await evaluate("document.querySelectorAll('.ob-meter, .ob-meters').length"), 0);
  assert.doesNotMatch(await evaluate<string>("document.querySelector('.ob-left').textContent"), /200 份|50 MB|上限/);
  await click(".ob-right .mw-file-row .mw-check[data-file]");
  await waitFor("document.querySelector('.mw-file-group__count')?.textContent.trim() === '3/4'");
  assert.equal(await evaluate("document.querySelector('.mw-file-group__head .mw-check').indeterminate"), true);
  assert.equal(await evaluate("document.activeElement?.matches('.mw-check[data-file]')"), true, "the focus stays on the row that changed");
  // ONB-FILE-01: the range controls are not inside the checkbox label, the rest of the row selects, and the group folds.
  assert.equal(await evaluate("document.querySelectorAll('label.mw-file-group__pick button, label.mw-file-group__head button').length"), 0);
  await click(".ob-right .mw-file-row:has(.mw-check[data-file]:checked) .mw-file-row__size");
  await waitFor("document.querySelector('.mw-file-group__count')?.textContent.trim() === '2/4'");
  await click("[data-fold]");
  await waitFor("document.querySelectorAll('.ob-right .mw-file-row').length === 0");
  assert.equal(await evaluate("document.querySelector('[data-fold]')?.getAttribute('aria-expanded')"), "false");
  await click("[data-fold]");
  await waitFor("document.querySelectorAll('.ob-right .mw-file-row').length >= 4");
  await assertLayoutClean(evaluate, "scope");
  await click("[data-action=sources]");
  await waitFor(obView("sources"));
  assert.equal(await evaluate("document.querySelectorAll('.ob-right .mw-file-group').length"), 1, "going back keeps what was added");
  await click("[data-action=prepare]");
  await waitFor(`${obView("model")} && !!document.querySelector('[data-action=start]')`);

  // No model is connected in this Home: the materials are kept, and the person names the project they begin.
  assert.equal(await evaluate("document.querySelector('[data-action=start] [data-slot=button-label]').textContent"), "先带入资料");
  assert.match(await evaluate<string>("document.querySelector('.ob-right')?.textContent || ''"), /常用供应商/);
  // ONB-LIM-10: the upload goes by bytes across every source. Each upload waits a moment here, so the bar can be read part-way.
  await evaluate("(() => { const send = window.fetch; window.fetch = (url, init) => String(url).includes('/files?path=') ? new Promise(resolve => setTimeout(resolve, 400)).then(() => send(url, init)) : send(url, init); })()");
  await click("[data-action=start]");
  await waitFor("Number(document.querySelector('.ob-upload [role=progressbar]')?.getAttribute('aria-valuenow')) > 0");
  const upload = await evaluate<{ now: number; max: number; text: string }>("(() => { const bar = document.querySelector('.ob-upload [role=progressbar]'); return { now: +bar.getAttribute('aria-valuenow'), max: +bar.getAttribute('aria-valuemax'), text: document.querySelector('.ob-upload small').textContent }; })()");
  assert.ok(upload.now < upload.max, JSON.stringify(upload)); assert.match(upload.text, /^已上传 \d.* \/ \d.*B$/);
  await assertLayoutClean(evaluate, "scope, uploading");
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

// ONB-INT-01: choosing a large folder used to freeze the sources page until every name was saved.
// The count is on screen first, part-way, and the old 200 / 50 MB / 20 MB line stays gone.
test("ONB-INT-01 a large folder shows how far the count has come before the list appears", { timeout: 120_000 }, async t => {
  const journey = await openJourneyBrowser(t, "empty");
  if (!journey) return;
  const { go, evaluate, waitFor } = journey;
  await go("/onboarding");
  await waitFor("!!document.querySelector('.arrival')");
  await evaluate("localStorage.setItem('molis-work:onboarding-intro','done')");
  await go("/onboarding");
  await waitFor(obView("sources"));
  await evaluate(`(() => {
    const real = window.setTimeout;
    window.setTimeout = (fn, ms, ...rest) => ms === 0 ? (window.__holdCount = fn, 1) : real(fn, ms, ...rest);
    window.__restoreTimeout = () => { window.setTimeout = real; };
    const input = document.getElementById('cx-upload-directory');
    const data = new DataTransfer();
    for (let i = 0; i < 3000; i++) data.items.add(new File(['x'], 'n' + i + '.md'));
    input.files = data.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor("!!document.querySelector('.ob-upload [role=progressbar]')");
  const progress = await evaluate<{ now: number; max: number; text: string }>("(() => { const bar = document.querySelector('.ob-upload [role=progressbar]'); return { now: +bar.getAttribute('aria-valuenow'), max: +bar.getAttribute('aria-valuemax'), text: document.querySelector('.ob-upload small').textContent }; })()");
  assert.ok(progress.now > 0 && progress.now < progress.max, JSON.stringify(progress));
  assert.equal(progress.max, 3000);
  assert.match(progress.text, /已查看 \d+ \/ 3000 项 · 收录 \d+ 份/);
  await evaluate("const resume = window.__holdCount; window.__restoreTimeout(); resume();");
  await waitFor("document.querySelector('[data-open=folder] .ob-source__act.is-added')?.textContent === '已添加 3000'", 20_000);
  assert.match(await evaluate<string>("document.querySelector('.ob-left').textContent"), /不限份数和大小/);
  assert.doesNotMatch(await evaluate<string>("document.querySelector('.ob-left').textContent"), /200 份|50 MB|20 MB/);
});

// ONB-MODEL-01: the step after the files is the text model. The right side is that step's own content, saved through
// the model settings capability. Automation (arrival.still) shows the end state of the 130ms leave and 420ms enter.
test("ONB-MODEL-01 connecting a text model is its own journey step and returns to the files", { timeout: 120_000 }, async t => {
  const journey = await openJourneyBrowser(t, "empty");
  if (!journey) return;
  const { go, evaluate, waitFor, click, seed } = journey;
  const id = seed(item => {
    item.sources = [{ kind: "files", selected: true, files: [{ path: "笔记.md", size: 120, modified_ms: 1 }], metadata: { files: [{ path: "笔记.md", size: 120, modified_ms: 1, identity: "upload" }], skipped: 0, truncated: false } }];
    item.previewed = true;
  });
  await go("/onboarding");
  await waitFor("!!document.querySelector('.arrival')");
  await evaluate("localStorage.setItem('molis-work:onboarding-intro','done')");
  await go(`/onboarding?desktop=1&journey=${id}`);
  await waitFor(`${obView("model")} && location.pathname === '/onboarding' && location.search.includes(${JSON.stringify(id)}) && !!document.querySelector('[data-ob-template=deepseek]')`, 20_000);
  const step = await evaluate<{ settings: boolean; files: boolean; title: string; back: string; choices: string }>(`(() => ({
    settings: !!document.querySelector('.settings-navigation, .project-preferences-chrome, [data-model-settings]'),
    files: (document.querySelector('.ob-right')?.textContent || '').includes('笔记.md'),
    title: document.querySelector('.ob-left #ob-title')?.textContent || '',
    back: document.querySelector('[data-action=model-back]')?.textContent || '',
    choices: document.querySelector('.ob-right [data-ob-template=deepseek]')?.textContent || '',
  }))()`);
  assert.equal(step.settings, false);
  assert.equal(step.files, false);
  assert.equal(step.title, "连接文字模型");
  assert.equal(step.back, "返回");
  assert.equal(step.choices, "DeepSeek");
  await click("[data-ob-template=deepseek]");
  await waitFor("!!document.querySelector('#ob-model-key')");
  assert.equal(await evaluate("!!document.querySelector('[data-ob-base], [data-ob-model-id]')"), false, "DeepSeek already has an address and a model");
  assert.equal(await evaluate("document.activeElement?.id"), "ob-model-key");
  assert.equal(await evaluate("(document.querySelector('.ob-right')?.textContent || '').includes('笔记.md')"), false);
  await click("[data-action=model-back]");
  await waitFor(`${obView("preview")} && location.search.includes(${JSON.stringify(id)})`, 20_000);
  assert.match(await evaluate<string>("document.querySelector('.ob-right')?.textContent || ''"), /笔记\.md/);
  await click("[data-action=model]");
  await waitFor(`${obView("model")} && !!document.querySelector('[data-ob-template=deepseek]')`);
  assert.equal(await evaluate("(document.querySelector('.ob-right')?.textContent || '').includes('笔记.md')"), false);
});

test("ONB-FIX-01 connected provider and model text stays literal in the real journey DOM", { timeout: 120_000 }, async t => {
  const journey = await openJourneyBrowser(t, "empty");
  if (!journey) return;
  const provider = '<img data-ob-injected="provider" src=x onerror="globalThis.__obXss = 1"> & "供应商"';
  const model = '<svg data-ob-injected="model" onload="globalThis.__obXss = 2"></svg> <model>&\'';
  await seedConfiguredModels(journey.homeDirectory, [{ provider_id: "literal-provider", display_name: provider, model_id: model }]);
  const id = journey.seed(item => {
    item.sources = [{ kind: "files", selected: true, files: [{ path: "笔记.md", size: 120, modified_ms: 1 }], metadata: { files: [{ path: "笔记.md", size: 120, modified_ms: 1, identity: "upload" }], skipped: 0, truncated: false } }];
    item.previewed = true;
  });
  await journey.go("/onboarding");
  await journey.evaluate("localStorage.setItem('molis-work:onboarding-intro','done')");
  for (const [width, scheme] of [[1440, "light"], [390, "dark"]] as const) {
    await journey.view(width, width === 390 ? 844 : 900, scheme);
    await journey.go(`/onboarding?desktop=1&journey=${id}`);
    await journey.waitFor(`${obView("model")} && !!document.querySelector('.ob-stage-head span') && !!document.querySelector('[data-ob-template=deepseek]')`, 20_000);
    const configuration = await journey.evaluate<{ model: string }>("(async () => (await fetch('/api/onboarding/context')).json())()");
    assert.ok(configuration.model.includes(provider)); assert.ok(configuration.model.includes(model));
    const state = await journey.evaluate<{ text: string; elements: number; injected: number; executed: number }>(`(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const label = document.querySelector('.ob-stage-head span');
      return { text: label?.textContent || '', elements: label?.childElementCount ?? -1,
        injected: document.querySelectorAll('[data-ob-injected]').length, executed: Number(globalThis.__obXss || 0) };
    })()`);
    t.diagnostic(JSON.stringify({ acceptance: "ONB-FIX-01", width, scheme, ...state }));
    assert.equal(state.text, configuration.model, `${width}/${scheme}: the raw provider and model text is preserved`);
    assert.equal(state.elements, 0); assert.equal(state.injected, 0); assert.equal(state.executed, 0);
    await reviewShot(journey, `model-label-${width}-${scheme}`);
  }
});

// ONB-FOLDER-01: on the desktop, Downloads, Documents, Desktop and another folder are one vertical list and any of them can be on together.
test("ONB-FOLDER-01 folder places are a vertical list and more than one can be included", { timeout: 120_000 }, async t => {
  const journey = await openJourneyBrowser(t, "empty");
  if (!journey) return;
  const { go, evaluate, waitFor, click, command, sessionId } = journey;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const grants = {};
    window.__TAURI__ = { core: { invoke: async (command, args = {}) => {
      if (command === 'context_directory_status') return Object.values(grants);
      if (command === 'context_directory_authorize') {
        const grant = { id: args.id, name: args.id, path: '/Users/me/' + args.id, state: 'ready' };
        grants[args.id] = grant;
        return grant;
      }
      if (command === 'context_directory_forget') { delete grants[args.id]; return { id: args.id, name: args.id, state: 'unconnected' }; }
      if (command === 'context_directory_preview') return { files: [{ path: args.id + '/笔记.md', size: 20, modified_ms: 1, identity: 'desktop' }], skipped: 0, truncated: false };
      throw new Error('unexpected ' + command);
    } } };
  })();` }, sessionId);
  await go("/onboarding");
  await waitFor("!!document.querySelector('.arrival')");
  await evaluate("localStorage.setItem('molis-work:onboarding-intro','done')");
  await go("/onboarding");
  await waitFor(obView("sources"));
  await click("[data-open=folder]");
  await waitFor("!!document.querySelector('.ob-picks')");
  assert.equal((await evaluate<string>("getComputedStyle(document.querySelector('.ob-picks')).gridTemplateColumns")).split(" ").length, 1);
  assert.deepEqual(await evaluate<string[]>("[...document.querySelectorAll('.ob-picks [data-pick]')].map(node => node.dataset.pick)"), ["downloads", "documents", "desktop", "custom"]);
  await click("[data-pick=downloads]");
  await waitFor("document.querySelector('[data-pick=downloads]')?.getAttribute('aria-pressed') === 'true'");
  await click("[data-pick=documents]");
  await waitFor("document.querySelectorAll('.ob-picks [aria-pressed=true]').length === 2");
  assert.deepEqual(await evaluate<string[]>("[...document.querySelectorAll('.ob-picks [aria-pressed=true]')].map(node => node.dataset.pick)"), ["downloads", "documents"]);
  await click("[data-pick=downloads]");
  await waitFor("document.querySelector('[data-pick=downloads]')?.getAttribute('aria-pressed') === 'false' && document.querySelector('[data-pick=documents]')?.getAttribute('aria-pressed') === 'true'");
});

// While organizing (user 2026-10-22): reading goes by bytes, the summary by its calls, and once a call has finished the page says how
// long the rest may take, worked out from the calls done; reopening the page shows the same, from the journey.
test("ONB-LIM-10 while organizing, bars go by bytes and by calls, the time left comes once a call has finished, and reopening shows the same", { timeout: 120_000 }, async t => {
  const journey = await openJourneyBrowser(t, true);
  if (!journey) return;
  const { view, go, evaluate, waitFor, homeDirectory } = journey;
  await view(1440);
  // One long material, already read: about 270,000 characters make several batches, one more for their notes, then the proposal.
  const text = "# 长材料\n\n" + "普通的工作背景。\n".repeat(30_000), sha256 = createHash("sha256").update(text).digest("hex"), bytes = Buffer.byteLength(text);
  const id = journey.seed(item => { item.sources = [{ kind: "files", selected: true, references: [{ ...reference(1, "长材料"), text: { sha256, bytes, chars: text.length }, original: { filename: "长材料.md", mime: "text/markdown", sha256, size_bytes: bytes } }] }]; });
  for (const kind of ["files", "texts"]) writeFileSync(join(homeDirectory, "context-onboarding", "journeys", id, kind, sha256), text);
  let first!: () => void, hold!: (error: Error) => void;
  const firstGate = new Promise<void>(resolve => { first = resolve; }), held = new Promise<string>((_, reject) => { hold = reject; });
  let calls = 0;
  const completeText = async () => { if (++calls > 1) return held; await firstGate; return "# 要点\n普通的工作背景 [S1]"; };
  startContextJourney(homeDirectory, id, { model: async () => ({ runtimeLabel: "stub", completeText }) } as never);
  // On a failure the round is let go here; the Home goes in the browser's own clean-up, which runs before this one.
  const release = () => { first(); hold(new Error("test over")); };
  t.after(release);
  const summary = "document.querySelectorAll('.ob-phase')[1]";
  const bar = `${summary}?.querySelector('[role=progressbar]')`;
  await go(`/onboarding?mode=new-project&journey=${id}`);
  await waitFor(`/正在估算剩余时间/.test(${summary}?.textContent ?? '')`, 20_000);
  const all = withContextJourneys(homeDirectory, store => store.get(id)).synthesis!.batches.all;
  assert.ok(all > 2, "the first round's batches, a round for their notes, and the proposal");
  assert.deepEqual(await evaluate(`[${bar}.getAttribute('aria-valuenow'), ${bar}.getAttribute('aria-valuemax')]`), ["0", String(all)], "every call is counted before the first is made");
  assert.deepEqual(await evaluate("(() => { const b = document.querySelector('.ob-right [role=progressbar]'); return [b.getAttribute('aria-valuenow'), b.getAttribute('aria-valuemax')]; })()"), [String(bytes), String(bytes)], "reading goes by bytes");
  first();
  await waitFor(`/还要不到 1 分钟/.test(${summary}?.textContent ?? '') && ${bar}.getAttribute('aria-valuenow') === '1'`, 20_000);
  await assertLayoutClean(evaluate, "reading, time left");
  await go(`/onboarding?mode=new-project&journey=${id}`);
  await waitFor(`/还要不到 1 分钟/.test(${summary}?.textContent ?? '') && ${bar}?.getAttribute('aria-valuenow') === '1'`, 20_000);
  await view(390);
  await assertLayoutClean(evaluate, "reading, time left, 390");
  release(); await waitContextJourney(homeDirectory, id);
});

const SCREENS: Array<{ name: string; width: number; height?: number }> = [
  { name: "1920", width: 1920, height: 1080 }, { name: "1440", width: 1440 }, { name: "1280", width: 1280, height: 720 }, { name: "1024", width: 1024, height: 700 },
  { name: "900", width: 900, height: 700 }, { name: "768", width: 768, height: 800 }, { name: "600", width: 600, height: 800 }, { name: "390 phone", width: 390, height: 844 }, { name: "375 phone", width: 375, height: 667 }, { name: "320 phone", width: 320, height: 568 }, { name: "phone, sideways", width: 667, height: 375 },
];

/** The page's motion rests under automation and reduced motion; the tests of the motion itself say the browser is neither. */
async function withMotion(journey: { command: (method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<unknown>; sessionId: string }) {
  await journey.command("Page.addScriptToEvaluateOnNewDocument", { source: "Object.defineProperty(navigator, 'webdriver', { get: () => false });" }, journey.sessionId);
  await journey.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }, journey.sessionId);
  await journey.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, journey.sessionId);
}

test("the opening types its name, the way on arrives a moment after it, and a first Enter only ends the typing", { timeout: 90_000 }, async t => {
  const journey = await openJourneyBrowser(t, "empty");
  if (!journey) return;
  const { go, evaluate, waitFor, press } = journey;
  await withMotion(journey);
  const wayOn = "getComputedStyle(document.querySelector('.arrival-bar .bar-end')).visibility";
  // Left alone, the name types and the way on appears a few seconds in.
  await go("/onboarding");
  await waitFor(screen("opening"));
  assert.equal(await evaluate("document.querySelector('.opening .mw-wordmark').dataset.state"), "typing");
  assert.equal(await evaluate(wayOn), "hidden", "no way on while the name is being typed");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#cx-exit')).visibility"), "visible", "but a way out is always there");
  await waitFor(`${wayOn} === 'visible'`, 8_000);
  assert.equal(await evaluate("document.querySelector('.arrival').dataset.screen"), "opening", "it waits to be asked");
  // A first Enter before that ends the typing and nothing more; the second goes on.
  await go("/onboarding");
  await waitFor(screen("opening"));
  await press("Enter");
  await waitFor("document.querySelector('.opening').classList.contains('is-ready') && document.querySelector('.opening .mw-wordmark').dataset.state === 'done'");
  assert.equal(await evaluate("document.querySelector('.arrival').dataset.screen"), "opening", "the first Enter only ended the typing");
  await waitFor(`${wayOn} === 'visible'`);
  await press("Enter");
  await waitFor("document.querySelector('.welcome')?.dataset.step === 'language'", 5_000);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.arrival-titlebar .mw-wordmark')).visibility"), "visible", "the name has settled into the titlebar");
});

test("the opening and the two questions lay out cleanly at every width, in light and dark", { timeout: 300_000 }, async t => {
  // ONB-FIX-02: real computed styles guard both the element and the welcome pseudo-element, not CSS text.
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
      await waitFor(`document.documentElement.dataset.resolvedTheme === ${JSON.stringify(scheme)}`);
      const openingOpacity = await evaluate("getComputedStyle(document.querySelector('.opening-glow')).opacity");
      assert.equal(openingOpacity, scheme === "dark" ? "0.5" : "1", where("opening opacity"));
      if (width === 1440 && scheme === "dark") await reviewShot(journey, "opening-1440-dark");
      await assertLayoutClean(evaluate, where("opening"));
      await press("Enter");
      await waitFor("document.querySelector('.welcome')?.dataset.step === 'language'");
      const welcomeOpacity = await evaluate("getComputedStyle(document.querySelector('.welcome'), '::before').opacity");
      assert.equal(welcomeOpacity, scheme === "dark" ? "0.5" : "1", where("welcome pseudo opacity"));
      if ([1440, 1024, 390].includes(width)) t.diagnostic(JSON.stringify({ acceptance: "ONB-FIX-02", width, scheme, openingOpacity, welcomeOpacity }));
      if ([1440, 1024, 390].includes(width)) await reviewShot(journey, `welcome-${width}-${scheme}`);
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
async function seededScreens(journey: NonNullable<Awaited<ReturnType<typeof openJourneyBrowser>>>, locale: "zh" | "en" = "zh"): Promise<Array<[string, string, string]>> {
  const { seed, batch } = journey;
  const drafts = await batch();
  const scope = seed(item => {
    item.sources = [
      { kind: "directory", selected: true, days: 30, excluded: ["资料-2.md"], files: fileMeta(24).map(file => ({ path: file.path, staged: MAIL_SHA256 })), metadata: { files: fileMeta(24), skipped: 3, truncated: false } },
      { kind: "browser", selected: true, text: MAIL.repeat(40), url: "https://example.com/some/very/long/address/that/goes/on/and/on/and/on" },
    ];
    item.previewed = true;
  });
  const added = seed(item => {
    item.sources = [{ kind: "directory", selected: true, days: 30, files: fileMeta(12).map(file => ({ path: file.path, staged: MAIL_SHA256 })), metadata: { files: fileMeta(12), skipped: 0, truncated: false } },
      { kind: "browser", selected: true, text: MAIL }];
  });
  const reviewWithDrafts = seed(item => {
    item.sources = [{ kind: "browser", selected: true, references: [reference(1)] }];
    item.phase = "review";
    item.summary = { title: "新版方案", body: SUMMARY, references: [reference(1), reference(2, "材料 2：预算表（含各部门明细与历史对比的完整版本）")] };
    item.todo = { status: "ready", batches: [drafts], total: 1, error: null };
  });
  const reviewPlain = seed(item => {
    item.sources = [{ kind: "browser", selected: true, references: [reference(1)] }];
    item.phase = "review";
    item.summary = { title: LONG_NAME, body: SUMMARY, references: [reference(1)] };
    item.todo = { status: "failed", batches: [], total: 1, error: "模型暂时没有响应" };
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
  // English names the current batch before the total; Chinese names the total first. Both must show the same exact counts.
  const summaryProgress = locale === "en" ? /\b4\/8\b/ : /8\D+4/, todoProgress = locale === "en" ? /\b1\/6\b/ : /6\D+1/;
  // A long round stopped part-way: the checkpoint says how far reading, the summary's batches and the todo batches came.
  const longQueue = seed(item => {
    item.sources = [{ kind: "files", selected: true, files: fileMeta(12).map(file => ({ path: file.path, staged: MAIL_SHA256 })), reading: { done: 120, total: 300, references: [], issues: [] } }];
    item.phase = "failed"; item.error = "读取在第 121 份时中断，已读的会沿用。";
    item.reading_bytes = { done: 48_000_000, total: 120_000_000 };
    item.synthesis = { key: "fixture", stage: 1, completed: 3, total: 8, notes: [], batches: { done: 3, all: 10 }, timing: { ms: 90_000, calls: 3 } };
    item.todo = { status: "pending", batches: [], total: 6, error: null, timing: { ms: 0, calls: 0 } };
  });
  const reselect = seed(item => {
    item.sources = [{ kind: "browser", selected: true, references: [{ ...reference(1), original: undefined as never }] }];
    item.phase = "review";
  });
  return [
    ["sources, nothing added", "/onboarding?mode=new-project", obView("sources")],
    ["sources, materials added", `/onboarding?mode=new-project&journey=${added}`, `${obView("sources")} && document.querySelectorAll('.ob-right .mw-file-group').length === 2`],
    ["scope, long names", `/onboarding?mode=new-project&journey=${scope}`, `${obView("model")} && !!document.querySelector('[data-action=model-back]')`],
    ["reading, interrupted", `/onboarding?mode=new-project&journey=${interrupted}`, obView("reading")],
    ["reading, a long queue interrupted", `/onboarding?mode=new-project&journey=${longQueue}`, `${obView("reading")} && document.querySelectorAll('.ob-phase').length === 3 && /120\\D+300/.test(document.querySelector('.ob-phases').textContent) && ${summaryProgress}.test(document.querySelectorAll('.ob-phase')[1].textContent) && ${todoProgress}.test(document.querySelectorAll('.ob-phase')[2].textContent) && /48\\.0 MB \\/ 120\\.0 MB/.test(document.querySelector('.ob-phases').textContent) && document.querySelector('.ob-right [role=progressbar]').getAttribute('aria-valuenow') === '48000000' && document.querySelectorAll('.ob-phase [role=progressbar]').length === 2`],
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
        if (state === "scope, long names") {
          await click("[data-action=model-back]");
          await waitFor(`${obView("preview")} && document.querySelectorAll('.mw-file-row').length > 20`, 10_000);
        }
        await assertLayoutClean(evaluate, `${state} · ${name} · ${scheme}`);
        if (state === "reading, interrupted") {
          // RING-05: keep the source failure distinct from retained materials, with no activity after interruption.
          assert.deepEqual(await evaluate("[...document.querySelectorAll('.is-receipts [data-slot=status]')].map(node => node.dataset.mwState)"), ["done", "failed"]);
          assert.equal(await evaluate("document.querySelectorAll('[data-ob-view=reading] [data-mw-state=running]').length"), 0);
        }
      }
      // A source's own settings open under the choices: open each that has them, one at a time.
      await go("/onboarding?mode=new-project");
      await waitFor(obView("sources"));
      const rows = await evaluate<string[]>("[...document.querySelectorAll('.ob-sources [aria-expanded]')].map((row) => row.dataset.open)");
      assert.ok(rows.includes("browser"), "pasting a page has settings");
      for (const row of rows) {
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
  const { view, go, evaluate, waitFor, click, command, sessionId, origin } = journey;
  await command("Network.enable", {}, sessionId);
  await command("Network.setCookie", { name: "molis_work_locale", value: "en", url: origin }, sessionId);
  const states = await seededScreens(journey, "en");
  for (const { name, width, height } of SCREENS.filter(screen => ["1440", "768", "390 phone", "320 phone"].includes(screen.name))) {
    await view(width, height ?? 900, "light");
    for (const [state, path, ready] of states) {
      await go(path + (width >= 760 ? "&desktop=1" : ""));
      await waitFor(ready, 10_000);
      if (state === "scope, long names") {
        await click("[data-action=model-back]");
        await waitFor(`${obView("preview")} && document.querySelectorAll('.mw-file-row').length > 20`, 10_000);
      }
      await assertLayoutClean(evaluate, `${state} · ${name} · English`);
    }
  }
});

test("the new project is previewed in the sentence the chooser will use for it, and a blank start carries one line about the personal space, not a paragraph", { timeout: 60_000 }, async t => {
  const journey = await openJourneyBrowser(t, true);
  if (!journey) return;
  const { view, go, seed, evaluate, waitFor, click } = journey;
  await view(1440);
  const id = seed(item => {
    item.sources = [{ kind: "browser", selected: true, references: [reference(1)] }];
    item.phase = "review";
    item.summary = { title: "新版方案", body: SUMMARY, references: [reference(1)] };
  });
  await go(`/onboarding?mode=new-project&journey=${id}`);
  await waitFor(obView("review"));
  assert.equal(await evaluate("document.querySelector('.ob-preview .mw-brief__desc').textContent"), "张总要求周五前发新版方案，预算等小李确认；团建改到周四。",
    "the first paragraph that says something: not the heading, not the [S1] mark");
  // A cited material's text is staged on the Host, not in the journey: the dialog reads it from there (no limits, 2026-10-22).
  await click(".cx-citation[data-cite=S1]");
  await waitFor("document.getElementById('cx-dialog').open && document.querySelector('#cx-dialog .cx-source-body').textContent.length > 0");
  assert.equal(await evaluate("document.querySelector('#cx-dialog .cx-source-body').textContent"), MAIL);
  await click("#cx-dialog [data-close]");
  await go("/onboarding?mode=new-project&start=blank");
  await waitFor(`${obView("blank")} && !!document.getElementById('cx-blank-name')`);
  assert.equal(await evaluate("document.querySelectorAll('.ob-left .ob-note').length"), 0, "no long note under the name");
  assert.equal(await evaluate("document.querySelectorAll('.ob-left [data-action=personal]').length"), 1, "the way to the personal space is one line");
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
  assert.equal(await evaluate("document.querySelectorAll('.mw-steps li').length"), 5, "no Welcome questions on the way to a second project");
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
