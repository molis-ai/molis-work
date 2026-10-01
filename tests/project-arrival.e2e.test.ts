import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { PROJECT_ARRIVAL_RELATIVE_PATH } from "../apps/local-host/src/project-arrival.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { assertLayoutClean } from "./fixtures/layout-audit.js";

// The project chooser in a real browser (specs/project-arrival-flow): the directory on the desk, the brief on the sheet,
// one bar below. These follow a person through it — what is preselected, what the keys do, what an empty search or an
// unreadable brief says — and check at every width that nothing sits on anything else.

const LONG_NAME = "一个名字特别特别长的项目——用来确认目录里的名字不会顶到右边的计数和状态，也不会把整行撑破";
/** Words the page itself says, in Chinese: none of them may show in English. */
const CHINESE_CHROME = ["新建项目", "进入项目", "进入个人空间", "预览中", "回车进入", "搜索项目", "按最近打开", "当前目标", "最近打开", "还没打开过", "项目和文档保存在这台电脑", "暂停标题动画", "后台任务", "个人空间"];
/** What someone might type into the search and find nothing: long enough to test the sheet's wrapping and its buttons. */
const LONG_QUERY = "没有这个项目的名字，也没有任何和它沿着相近的叫法".repeat(2);
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

/** The seeded project (with goals), three empty ones, and the chooser's own memory of when each was opened. */
async function openChooser(t: TestContext) {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return null;
  const { homeDirectory, projectId } = browser;
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const others: string[] = [];
  try {
    for (const name of ["Coding 开发沙盒", LONG_NAME, "Footballnia"]) others.push((await catalog.createProject({ display_name: name, actor_id: "arrival-test" })).project_id);
  } finally { catalog.close(); }
  mkdirSync(join(homeDirectory, "config"), { recursive: true });
  const memory = { schema_version: 1, last_project_id: projectId!, projects: {
    [projectId!]: { last_opened_at: hoursAgo(2), description: "把目录交互的每一步都在真实浏览器里走一遍，确认它们顺手。" },
    [others[0]!]: { last_opened_at: hoursAgo(30), description: null },
    [others[1]!]: { last_opened_at: hoursAgo(200), description: null },
  } };
  writeFileSync(join(homeDirectory, PROJECT_ARRIVAL_RELATIVE_PATH), JSON.stringify(memory));
  const { command, sessionId, evaluate, waitFor, navigate, origin } = browser;
  const press = async (key: string, modifiers = 0) => {
    const codes: Record<string, number> = { Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38, k: 75 };
    const base = { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: codes[key] ?? 0, modifiers };
    await command("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base, ...(key === "Enter" ? { text: "\r" } : {}) }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", ...base }, sessionId);
  };
  const view = (width: number, height = 900, scheme: "light" | "dark" = "light") => Promise.all([
    command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId),
    command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: scheme }] }, sessionId),
  ]);
  // A brief the page is told to hold, fail, or let through: the sheet's other states. Installed before the page's own
  // scripts run, and switchable in the page that is open (a retry after a failure reads the real one).
  let installed: string | null = null;
  const briefs = async (mode: "pass" | "hold" | "fail") => {
    if (installed) await command("Page.removeScriptToEvaluateOnNewDocument", { identifier: installed }, sessionId);
    installed = mode === "pass" ? null : (await command<{ identifier: string }>("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
      window.__briefMode = ${JSON.stringify(mode)};
      const real = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = String(input?.url ?? input);
        if (!/\\/api\\/projects\\/[^/]+\\/brief/.test(url) || window.__briefMode === 'pass') return real(input, init);
        if (window.__briefMode === 'fail') return Promise.reject(new TypeError('Failed to fetch'));
        return new Promise(() => {});
      };
    })()` }, sessionId)).identifier;
    await evaluate(`window.__briefMode = ${JSON.stringify(mode)}`);
  };
  const open = async (path = "/", mode: "pass" | "hold" | "fail" = "pass") => {
    await briefs(mode);
    await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
  };
  const settled = () => waitFor("document.querySelector('#chooser-detail .mw-brief') && document.querySelector('#chooser-detail .mw-brief').getAttribute('aria-busy') !== 'true'", 8_000);
  return { ...browser, projectId: projectId!, others, press, view, briefs, open, settled, homeDirectory };
}

const selected = "document.querySelector('.chooser').dataset.selected";
const rowIds = "[...document.querySelectorAll('.chooser-dir [role=option]')].map(row => row.dataset.id)";

test("the chooser opens on the project last opened, shows its brief, and Enter goes in", { timeout: 90_000 }, async t => {
  const chooser = await openChooser(t);
  if (!chooser) return;
  const { evaluate, waitFor, navigate, press, view, open, settled, projectId, others, homeDirectory } = chooser;
  await view(1440);
  await open("/?desktop=1");
  await waitFor("document.querySelectorAll('.chooser-dir [role=option]').length === 5");
  // Personal space first, then by when each was opened; the one never opened (the seeded order's last) comes after the rest.
  assert.deepEqual(await evaluate<string[]>(rowIds), ["personal", projectId, others[0], others[1], others[2]]);
  assert.equal(await evaluate(selected), projectId);
  await settled();
  assert.equal(await evaluate("document.querySelector('#chooser-detail .mw-brief__title').textContent"), "目录交互验证");
  assert.match(await evaluate<string>("document.querySelector('#chooser-detail .mw-brief__desc').textContent"), /真实浏览器里走一遍/, "the sentence kept at creation introduces it");
  assert.match(await evaluate<string>("document.querySelector('#chooser-detail').textContent"), /当前目标/);
  assert.match(await evaluate<string>("document.querySelector('.arrival-bar .mw-bar-context').textContent"), /目录交互验证[\s\S]*预览中 · 回车进入/);
  assert.equal(await evaluate("document.querySelector('.arrival-bar [data-act=enter] .mw-btn__key').textContent"), "↵");
  // The row says what the brief found, so looking down the list needs no clicking.
  assert.match(await evaluate<string>("document.querySelector('#row-' + CSS.escape(" + JSON.stringify(projectId) + ") + ' .mw-dir-row__count')?.textContent ?? ''"), /^\d+\/\d+$/);
  await navigate(() => press("Enter"));
  assert.equal(await evaluate("location.pathname + location.search"), `/projects/${projectId}/?desktop=1`);
  // Going in is what the chooser remembers: the same project is preselected next time, with a fresh stamp.
  const remembered = JSON.parse(readFileSync(join(homeDirectory, PROJECT_ARRIVAL_RELATIVE_PATH), "utf8")) as { last_project_id: string; projects: Record<string, { last_opened_at: string }> };
  assert.equal(remembered.last_project_id, projectId);
  assert.ok(Date.now() - Date.parse(remembered.projects[projectId]!.last_opened_at) < 60_000, "stamped just now");
});

test("the arrow keys move through the directory and the brief and the bar follow; Enter goes in to the one in view", { timeout: 90_000 }, async t => {
  const chooser = await openChooser(t);
  if (!chooser) return;
  const { evaluate, waitFor, navigate, press, view, open, settled, others, projectId } = chooser;
  await view(1440);
  await open("/");
  await settled();
  await evaluate("document.querySelector('.chooser-dir [aria-selected=true]').focus()");
  await press("ArrowDown");
  assert.equal(await evaluate(selected), others[0], "down moves to the next project");
  await waitFor("document.querySelector('#chooser-detail .mw-brief__title')?.textContent === 'Coding 开发沙盒'");
  await settled();
  assert.match(await evaluate<string>("document.querySelector('.arrival-bar .mw-bar-context strong').textContent"), /Coding 开发沙盒/);
  assert.equal(await evaluate("document.activeElement.dataset.id"), others[0], "focus travels with the selection");
  assert.match(await evaluate<string>("document.querySelector('#chooser-detail').textContent"), /还没有目标/, "a project with no goals says so instead of showing a zero");
  await press("End");
  assert.equal(await evaluate(selected), others[2]);
  await press("Home");
  assert.equal(await evaluate(selected), "personal");
  await waitFor("document.querySelector('#chooser-detail .mw-brief__title')?.textContent === '个人空间'");
  assert.equal(await evaluate("document.querySelector('.arrival-bar [data-act=enter] [data-slot=button-label]').textContent"), "进入个人空间");
  await press("ArrowDown");
  assert.equal(await evaluate(selected), projectId);
  await navigate(() => press("Enter"));
  assert.equal(await evaluate("location.pathname"), `/projects/${projectId}/`);
});

test("moving quickly down the directory asks the Host for the project it stops on, not for every one it passes", { timeout: 90_000 }, async t => {
  const chooser = await openChooser(t);
  if (!chooser) return;
  const { evaluate, waitFor, press, view, open, settled, others } = chooser;
  await view(1440);
  await open("/");
  await settled();
  await evaluate(`(() => {
    window.__briefCalls = [];
    const real = window.fetch.bind(window);
    window.fetch = (input, init) => { const url = String(input?.url ?? input); if (/\\/api\\/projects\\/[^/]+\\/brief/.test(url)) window.__briefCalls.push(decodeURIComponent(url)); return real(input, init); };
  })()`);
  await evaluate("document.querySelector('.chooser-dir [aria-selected=true]').focus()");
  for (let step = 0; step < 3; step++) await press("ArrowDown");
  assert.equal(await evaluate("document.querySelector('.chooser').dataset.selected"), others[2], "three rows down");
  assert.ok(await evaluate("!!document.querySelector('#chooser-detail .mw-brief--loading')"), "the sheet answers at once with what is known");
  await waitFor("document.querySelector('#chooser-detail .mw-brief__title')?.textContent === 'Footballnia'");
  await settled();
  const calls = await evaluate<string[]>("window.__briefCalls");
  assert.equal(calls.length, 1, `one read for the project it stopped on: ${JSON.stringify(calls)}`);
  assert.match(calls[0]!, new RegExp(`/api/projects/${others[2]}/brief`));
});

test("search narrows the directory, ⌘K reaches it from anywhere, and nothing found offers a new project of that name", { timeout: 90_000 }, async t => {
  const chooser = await openChooser(t);
  if (!chooser) return;
  const { evaluate, waitFor, navigate, click, press, view, open, settled } = chooser;
  await view(1440);
  await open("/");
  await settled();
  await press("k", 4); // ⌘K on a Mac keyboard (Meta)
  assert.equal(await evaluate("document.activeElement.id"), "chooser-q");
  await chooser.command("Input.insertText", { text: "foot" }, chooser.sessionId);
  await waitFor("[...document.querySelectorAll('.chooser-dir [role=option]')].filter(row => !row.hidden).length === 1");
  assert.equal(await evaluate("document.querySelector('.chooser-dir [role=option]:not([hidden])').dataset.name"), "Footballnia");
  assert.equal(await evaluate("[...document.querySelectorAll('.chooser-dir [data-slot=directory-heading]')].filter(heading => !heading.hidden).length"), 1, "a heading with nothing under it goes quiet");
  assert.equal(await evaluate(selected), await evaluate("document.querySelector('.chooser-dir [role=option]:not([hidden])').dataset.id"), "the one left is the one in view");
  await settled();
  assert.equal(await evaluate("document.querySelector('#chooser-detail .mw-brief__title').textContent"), "Footballnia");
  // Nothing matches: the sheet says so and offers the name as a new project; the bar can no longer go in.
  await chooser.command("Input.insertText", { text: "不存在的" }, chooser.sessionId);
  await waitFor("document.querySelector('#chooser-detail .brief-none')");
  assert.match(await evaluate<string>("document.querySelector('#chooser-detail').textContent"), /没有叫「foot不存在的」的项目/);
  assert.equal(await evaluate("document.querySelector('.arrival-bar [data-act=enter]').getAttribute('aria-disabled')"), "true");
  assert.equal(await evaluate("document.querySelector('[data-chooser-none]').hidden"), false);
  await navigate(() => click("#chooser-detail [data-act=new-named]"));
  assert.equal(await evaluate("location.pathname"), "/onboarding");
  assert.equal(await evaluate("new URLSearchParams(location.search).get('name')"), "foot不存在的");
  assert.equal(await evaluate("new URLSearchParams(location.search).get('mode')"), "new-project");
});

test("Escape clears a search and brings the directory back", { timeout: 60_000 }, async t => {
  const chooser = await openChooser(t);
  if (!chooser) return;
  const { evaluate, waitFor, press, view, open, settled, command, sessionId } = chooser;
  await view(1440);
  await open("/");
  await settled();
  await evaluate("document.getElementById('chooser-q').focus()");
  await command("Input.insertText", { text: "zzzz" }, sessionId);
  await waitFor("document.querySelector('#chooser-detail .brief-none')");
  await press("Escape");
  await waitFor("[...document.querySelectorAll('.chooser-dir [role=option]')].every(row => !row.hidden) && !document.querySelector('#chooser-detail .brief-none')");
  assert.equal(await evaluate("document.getElementById('chooser-q').value"), "");
  await settled();
});

test("everything on the chooser can be reached with the Tab key, in the order it is read, and the way in is one Tab away from the list", { timeout: 90_000 }, async t => {
  const chooser = await openChooser(t);
  if (!chooser) return;
  const { evaluate, command, sessionId, view, open, settled, projectId } = chooser;
  await view(1440);
  await open("/");
  await settled();
  const tab = async () => {
    await command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, sessionId);
    return evaluate<string>(`(() => { const a = document.activeElement; if (!a || a === document.body) return ''; return a.id || a.dataset.act || a.getAttribute('aria-label') || a.className.split(' ')[0] || a.tagName; })()`);
  };
  // One lap: from the first stop until the way in has been reached.
  const visited: string[] = [];
  for (let step = 0; step < 30 && !visited.includes("enter"); step++) { const at = await tab(); if (at && visited.at(-1) !== at) visited.push(at); }
  const at = (name: string) => visited.indexOf(name);
  for (const name of ["chooser-q", `row-${projectId}`, "chooser-detail", "new", "enter"]) assert.ok(at(name) >= 0, `${name} can be reached: ${JSON.stringify(visited)}`);
  assert.ok(at("chooser-q") < at(`row-${projectId}`) && at(`row-${projectId}`) < at("chooser-detail") && at("chooser-detail") < at("new") && at("new") < at("enter"),
    `the search, the selected project, its sheet (which scrolls), then the way in: ${JSON.stringify(visited)}`);
  assert.equal(visited.filter(name => name.startsWith("row-")).length, 1, `the list is one stop (the selected row), the arrows do the rest: ${JSON.stringify(visited)}`);
  assert.ok(visited.some(name => /助理|assistant/i.test(name)), `the Assistant's line is reachable: ${JSON.stringify(visited)}`);
  // Each stop shows where it is.
  await evaluate("document.getElementById('chooser-q').focus()");
  assert.notEqual(await evaluate("getComputedStyle(document.getElementById('chooser-q').closest('.mw-input-group')).boxShadow"), "none", "the focused search has a ring");
});

test("the personal space opens from the chooser without a project in view", { timeout: 60_000 }, async t => {
  const chooser = await openChooser(t);
  if (!chooser) return;
  const { evaluate, waitFor, navigate, click, view, open, settled } = chooser;
  await view(1440);
  await open("/");
  await settled();
  await click("#row-personal");
  await waitFor("document.querySelector('#chooser-detail .mw-brief__title')?.textContent === '个人空间'");
  await settled();
  assert.match(await evaluate<string>("document.querySelector('#chooser-detail').textContent"), /不属于任何项目的资料和工作/);
  assert.doesNotMatch(await evaluate<string>("document.querySelector('#chooser-detail').textContent"), /当前目标|还没有项目描述/);
  await navigate(() => click(".arrival-bar [data-act=enter]"));
  assert.equal(await evaluate("location.pathname"), "/projects/personal/");
});

test("a brief that cannot be read says so where it would be, the project still opens, and retry reads it again", { timeout: 90_000 }, async t => {
  const chooser = await openChooser(t);
  if (!chooser) return;
  const { evaluate, waitFor, navigate, click, view, open, briefs, projectId } = chooser;
  await view(1440);
  await open("/", "fail");
  await waitFor("document.querySelector('#chooser-detail .mw-brief--error')");
  assert.match(await evaluate<string>("document.querySelector('#chooser-detail').textContent"), /项目简介暂时读不到/);
  assert.equal(await evaluate("document.querySelector('.arrival-bar [data-act=enter]').getAttribute('aria-disabled')"), null, "the way in stays open");
  await briefs("pass");
  await click("#chooser-detail [data-act=retry-brief]");
  await waitFor("document.querySelector('#chooser-detail .mw-brief:not(.mw-brief--error):not(.mw-brief--loading)')");
  assert.equal(await evaluate("document.querySelector('#chooser-detail .mw-brief__title').textContent"), "目录交互验证");
  await navigate(() => click(".arrival-bar [data-act=enter]"));
  assert.equal(await evaluate("location.pathname"), `/projects/${projectId}/`);
});

test("in English the chooser lays out cleanly too: longer words, the same room", { timeout: 300_000 }, async t => {
  const chooser = await openChooser(t);
  if (!chooser) return;
  const { evaluate, waitFor, click, view, open, settled, command, sessionId, origin, others } = chooser;
  await command("Network.enable", {}, sessionId);
  await command("Network.setCookie", { name: "molis_work_locale", value: "en", url: origin }, sessionId);
  for (const { name, width, height } of SCREENS.filter(screen => ["1440", "768", "390 phone", "320 phone"].includes(screen.name))) {
    const where = (state: string) => `${state} · ${name} · English`;
    await view(width, height ?? 900);
    await open(width >= 760 ? "/?desktop=1" : "/");
    await settled();
    assert.equal(await evaluate("document.documentElement.lang"), "en");
    const bodyText = await evaluate<string>("document.body.innerText");
    // What a person wrote (project names, goals, their introduction) stays as written; the page's own words are English.
    assert.deepEqual(CHINESE_CHROME.filter(word => bodyText.includes(word)), [], "no word of the page is left in Chinese");
    await assertLayoutClean(evaluate, where("project in view"));
    await click("#row-personal");
    await waitFor("document.querySelector('#chooser-detail .mw-brief__title')?.textContent === 'Personal space'");
    await settled();
    await assertLayoutClean(evaluate, where("personal space in view"));
    await click(`#row-${others[1]}`);
    await settled();
    await assertLayoutClean(evaluate, where("long name in view"));
    await evaluate("document.getElementById('chooser-q').focus()");
    await command("Input.insertText", { text: LONG_QUERY }, sessionId);
    await waitFor("document.querySelector('#chooser-detail .brief-none')");
    await assertLayoutClean(evaluate, where("nothing found"));
  }
});

test("the Assistant in the bar speaks for the project in view, and keeps a draft for each one", { timeout: 90_000 }, async t => {
  const chooser = await openChooser(t);
  if (!chooser) return;
  const { evaluate, waitFor, click, view, open, settled, command, sessionId, others, projectId } = chooser;
  await view(1440);
  await open("/");
  await settled();
  const placeholder = () => evaluate<string>("document.querySelector('[data-assistant-input]').placeholder");
  assert.match(await placeholder(), /目录交互验证/, "the first words it offers are about the project in view");
  await evaluate("document.querySelector('[data-assistant-input]').focus()");
  await command("Input.insertText", { text: "把周五的发布清单整理出来" }, sessionId);
  await click(`#row-${others[0]}`);
  await waitFor("document.querySelector('#chooser-detail .mw-brief__title')?.textContent === 'Coding 开发沙盒'");
  assert.match(await placeholder(), /Coding 开发沙盒/);
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]').value"), "", "another project starts with an empty line");
  await evaluate("document.querySelector('[data-assistant-input]').focus()");
  await command("Input.insertText", { text: "先看看沙盒的测试" }, sessionId);
  await click("#row-personal");
  await waitFor("document.querySelector('#chooser-detail .mw-brief__title')?.textContent === '个人空间'");
  assert.match(await placeholder(), /个人空间/);
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]').value"), "");
  await click(`#row-${projectId}`);
  await waitFor("document.querySelector('#chooser-detail .mw-brief__title')?.textContent === '目录交互验证'");
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]').value"), "把周五的发布清单整理出来", "each project's words are where they were left");
  await click(`#row-${others[0]}`);
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]').value"), "先看看沙盒的测试");
  // A long line in the bar stays inside it, whatever the width.
  await evaluate("document.querySelector('[data-assistant-input]').focus()");
  await command("Input.insertText", { text: "再补一句很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长的话，看看输入框会不会顶到旁边的按钮".repeat(2) }, sessionId);
  for (const width of [1440, 768, 390]) { await view(width, 900); await assertLayoutClean(evaluate, `a long line in the bar · ${width}`); }
});

test("sixty projects scroll inside the directory, the keys keep the selection in view, and the frame never moves", { timeout: 180_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { homeDirectory, command, sessionId, evaluate, waitFor, navigate, origin, click } = browser;
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  try { for (let index = 1; index <= 60; index++) await catalog.createProject({ display_name: `项目 ${String(index).padStart(2, "0")}`, actor_id: "arrival-test" }); } finally { catalog.close(); }
  const press = async (key: string) => {
    const codes: Record<string, number> = { End: 35, Home: 36, ArrowDown: 40 };
    await command("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code: key, windowsVirtualKeyCode: codes[key] }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: codes[key] }, sessionId);
  };
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  for (const width of [1440, 390]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
    await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
    await waitFor("document.querySelectorAll('.chooser-dir [role=option]').length === 62");
    assert.ok(await evaluate("(() => { const dir = document.querySelector('.chooser-dir'); return dir.scrollHeight > dir.clientHeight; })()"), "the directory is longer than its column and scrolls there");
    const frame = await evaluate<{ title: number; bar: number }>("({ title: document.querySelector('.arrival-titlebar').getBoundingClientRect().top, bar: document.querySelector('.arrival-bar').getBoundingClientRect().top })");
    await evaluate("document.querySelector('.chooser-dir [aria-selected=true]').focus()");
    await press("End");
    await waitFor("document.querySelector('.chooser').dataset.selected === [...document.querySelectorAll('.chooser-dir [role=option]')].at(-1).dataset.id");
    const inView = await evaluate<{ row: boolean; page: number; title: number; bar: number }>(`(() => {
      const dir = document.querySelector('.chooser-dir').getBoundingClientRect(), row = document.querySelector('.chooser-dir [aria-selected=true]').getBoundingClientRect();
      return { row: row.top >= dir.top - 1 && row.bottom <= dir.bottom + 1, page: document.documentElement.scrollTop + document.body.scrollTop,
        title: document.querySelector('.arrival-titlebar').getBoundingClientRect().top, bar: document.querySelector('.arrival-bar').getBoundingClientRect().top };
    })()`);
    assert.deepEqual(inView, { row: true, page: 0, ...frame }, `the last project is in view and nothing else moved at ${width}`);
    await assertLayoutClean(evaluate, `sixty projects, last in view · ${width}`);
    await press("Home");
    await waitFor("document.querySelector('.chooser').dataset.selected === 'personal'");
    assert.ok(await evaluate("document.querySelector('.chooser-dir').scrollTop === 0"), "Home brings the top back");
  }
  // Search reaches into the middle of the list, and ⌘K / Esc come back.
  await evaluate("document.getElementById('chooser-q').focus()");
  await command("Input.insertText", { text: "项目 5" }, sessionId);
  await waitFor("[...document.querySelectorAll('.chooser-dir [role=option]')].filter(row => !row.hidden).length === 10");
  await click("#chooser-q");
});

test("a Home with no project opens on the personal space and offers to begin the first one", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "empty");
  if (!browser) return;
  const { origin, sessionId, command, evaluate, waitFor, click, navigate } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/onboarding" }, sessionId));
  await navigate(() => click("#cx-exit"));
  await waitFor("document.querySelector('#chooser-detail .brief-none')");
  assert.deepEqual(await evaluate<string[]>(rowIds), ["personal"]);
  assert.equal(await evaluate(selected), "personal");
  assert.match(await evaluate<string>("document.querySelector('#chooser-detail').textContent"), /从一个真实项目开始/);
  await assertLayoutClean(evaluate, "an empty Home at 1440");
  await navigate(() => click("#chooser-detail .brief-none__actions a:last-child"));
  assert.equal(await evaluate("location.pathname"), "/onboarding");
  assert.equal(await evaluate("new URLSearchParams(location.search).get('start')"), "blank");
  assert.equal(await evaluate("document.body.dataset.onboardingMode"), "new_project");
});

const SCREENS: Array<{ name: string; width: number; height?: number }> = [
  { name: "1920", width: 1920, height: 1080 }, { name: "1440", width: 1440 }, { name: "1280", width: 1280, height: 720 }, { name: "1024", width: 1024, height: 700 },
  { name: "900", width: 900, height: 700 }, { name: "768", width: 768, height: 800 }, { name: "600", width: 600, height: 800 }, { name: "390 phone", width: 390, height: 844 }, { name: "375 phone", width: 375, height: 667 }, { name: "320 phone", width: 320, height: 568 }, { name: "phone, sideways", width: 667, height: 375 },
];

test("every state of the chooser lays out cleanly at every width, in light and dark: nothing overlaps, is cut off, or out of reach", { timeout: 600_000 }, async t => {
  const chooser = await openChooser(t);
  if (!chooser) return;
  const { evaluate, waitFor, click, view, open, settled, command, sessionId, others } = chooser;
  for (const scheme of ["light", "dark"] as const) {
    for (const { name, width, height } of SCREENS) {
      const where = (state: string) => `${state} · ${name} · ${scheme}`;
      await view(width, height ?? 900, scheme);
      await open(width >= 760 ? "/?desktop=1" : "/");
      await settled();
      await assertLayoutClean(evaluate, where("project in view"));
      await click("#row-personal");
      await waitFor("document.querySelector('#chooser-detail .mw-brief__title')?.textContent === '个人空间'");
      await settled();
      await assertLayoutClean(evaluate, where("personal space in view"));
      // The long name, in the directory and as the sheet's title.
      await click(`#row-${others[1]}`);
      await waitFor(`document.querySelector('#chooser-detail .mw-brief__title')?.textContent === ${JSON.stringify(LONG_NAME)}`);
      await settled();
      await assertLayoutClean(evaluate, where("long name in view"));
      await evaluate("document.getElementById('chooser-q').focus()");
      await command("Input.insertText", { text: LONG_QUERY }, sessionId);
      await waitFor("document.querySelector('#chooser-detail .brief-none')");
      await assertLayoutClean(evaluate, where("nothing found"));
      // The sheet keeps what it already read (that is the point of it); an empty cache shows the states a first look would.
      await evaluate("localStorage.clear()");
      await open(width >= 760 ? "/?desktop=1" : "/", "hold");
      await waitFor("document.querySelector('#chooser-detail .mw-brief--loading')");
      await assertLayoutClean(evaluate, where("brief loading"));
      await evaluate("localStorage.clear()");
      await open(width >= 760 ? "/?desktop=1" : "/", "fail");
      await waitFor("document.querySelector('#chooser-detail .mw-brief--error')");
      await assertLayoutClean(evaluate, where("brief unreadable"));
    }
  }
});
