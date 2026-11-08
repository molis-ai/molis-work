import assert from "node:assert/strict";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("PG-026-S4-03 demo sample warning remains visible until manual refresh and normal success still reloads", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "empty");
  if (!browser) return;
  const { origin, homeDirectory, sessionId, command, evaluate, waitFor, click, navigate } = browser;
  t.after(browser.on("Page.javascriptDialogOpening", (event, session) => {
    assert.equal(event.type, "confirm");
    void command("Page.handleJavaScriptDialog", { accept: true }, session).catch(() => undefined);
  }));
  const shelf = await fetch(origin + "/api/plugins/io.molis.work.shelf/");
  assert.equal(shelf.status, 200); await shelf.text();
  const catalog = resolve(homeDirectory, "shelf", "catalog.json"), saved = await readFile(catalog);
  await navigate(() => command("Page.navigate", { url: origin + "/settings/projects" }, sessionId));
  await waitFor("document.querySelector('[data-demo-action=create]')?.dataset.bound === '1'");
  await writeFile(catalog, "{broken-shelf-catalog");
  try {
    await click('[data-demo-action="create"]');
    await waitFor("!document.querySelector('[data-demo-error]').hidden && document.querySelector('[data-demo-error] a')");
    // This delay tests the specific old 450ms automatic-refresh boundary, not page readiness.
    await evaluate("new Promise(resolve => setTimeout(resolve, 700))");
    const warning = await evaluate<string>("document.querySelector('[data-demo-error]').textContent");
    assert.match(warning, /示例项目已创建/);
    assert.match(warning, /Shelf 示例未能恢复，请在 Shelf 中查看后重试。/);
    assert.equal(await evaluate("document.querySelector('[data-demo-error]').getAttribute('role')"), "alert");
    assert.equal(await evaluate("[...document.querySelectorAll('[data-demo-action]')].every(button => button.disabled)"), true);
    const projects = await (await fetch(origin + "/api/settings/projects")).json() as { projects: Array<{ project_id: string }> };
    assert.equal(projects.projects.length, 1);
    await writeFile(catalog, saved);
    await navigate(() => click('[data-demo-error] a'));
    assert.equal(await evaluate("document.querySelector('[data-demo-action=create]')"), null);
    const projectId = projects.projects[0]!.project_id;
    assert.ok((await (await fetch(origin + "/api/settings/projects")).json() as { projects: Array<{ project_id: string }> }).projects.some(project => project.project_id === projectId));
    await navigate(() => command("Page.navigate", { url: origin + "/settings/projects#" + encodeURIComponent(projectId) }, sessionId));
    await waitFor("document.querySelector('[data-demo-action=reset]')?.dataset.bound === '1'");
    await navigate(() => click('[data-demo-action="reset"]'));
    await waitFor("document.querySelector('[data-demo-action=reset]')?.dataset.bound === '1'");
    assert.equal(await evaluate("document.querySelector('[data-demo-error]').hidden"), true);
    assert.equal(await evaluate("document.querySelector('[data-demo-action=reset]').disabled"), false);
  } finally { await writeFile(catalog, saved); }
});

test("onboarding header return receives real pointer clicks in Web, desktop and narrow layouts", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { origin, sessionId, command, evaluate, click, navigate } = browser;
  const projects = await (await fetch(origin + "/api/settings/projects")).json();
  for (const { width, desktop } of [{ width: 1440, desktop: false }, { width: 980, desktop: true }, { width: 480, desktop: false }]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    const path = "/onboarding?mode=new-project" + (desktop ? "&desktop=1" : "");
    await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
    assert.equal(await evaluate("document.body.dataset.onboardingMode"), "new_project");
    assert.equal(await evaluate("document.querySelector('.cx-top-actions a')"), null);
    assert.doesNotMatch(await evaluate("document.body.innerHTML"), /迁移已有数据|data-project-migration|migration=1/);
    await navigate(() => click('#cx-exit'));
    assert.equal(await evaluate("location.pathname"), "/");
    assert.equal(await evaluate("new URLSearchParams(location.search).get('migration')"), null);
    assert.equal(await evaluate("document.querySelector('[data-project-migration-dialog]')"), null);
    assert.doesNotMatch(await evaluate("document.body.innerHTML"), /project-index-migration|data-open-project-migration/);
    assert.equal(await evaluate("new URLSearchParams(location.search).get('desktop')"), desktop ? "1" : null);
  }
  assert.deepEqual(await (await fetch(origin + "/api/settings/projects")).json(), projects);
});

test("first-use skip remains clickable on a narrow desktop page and creates no projects or bindings", { timeout: 30_000 }, async t => {
  const browser = await openGoalBrowser(t, "empty");
  if (!browser) return;
  const { origin, sessionId, command, evaluate, click, navigate } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/onboarding?desktop=1" }, sessionId));
  assert.equal(await evaluate("document.body.dataset.onboardingMode"), "first_run");
  await navigate(() => click("#cx-exit"));
  assert.equal(await evaluate("location.pathname + location.search"), "/?desktop=1");
  assert.deepEqual(await (await fetch(origin + "/api/settings/projects")).json(), { projects: [] });
  const status = await (await fetch(origin + "/api/onboarding/status")).json() as { state: { first_run: string; completed_project_id: string | null } };
  assert.equal(status.state.first_run, "dismissed");
  assert.equal(status.state.completed_project_id, null);
});

test("project general settings persist a rename, cancel safely, and retry deletion after network failure and a lost response", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "empty");
  if (!browser) return;
  const { origin, sessionId, command, evaluate, waitFor, click, navigate } = browser;
  await command("Network.enable", {}, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/onboarding?desktop=1" }, sessionId));
  await navigate(() => click("#cx-exit"));
  const created = await evaluate<{ project: { project_id: string } }>(`fetch('/api/settings/projects', {
    method: 'POST', headers: molisWorkControlHeaders(), body: JSON.stringify({display_name:'项目设置浏览器测试',user_confirmed:true})
  }).then(async response => { if (!response.ok) throw new Error(await response.text()); return response.json(); })`);
  const projectId = created.project.project_id;
  const prefix = `/projects/${projectId}`;
  // Project settings open in the project's workbench (specs/artifact-positioning S6).
  const general = "document.querySelector('[data-tab-workspace]')?.dataset.exclusive === 'project-settings' && !!document.querySelector('[data-work-surface=project-settings] [data-project-rename]')";
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/general?desktop=1" }, sessionId));
  await waitFor(general, 15_000);
  assert.equal(await evaluate("location.pathname + location.search"), prefix + "/?desktop=1");
  assert.equal(await evaluate("!!document.querySelector('.project-name-form[data-project-rename]')"), true);
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]') != null"), true);
  assert.equal(await evaluate("document.querySelector('[data-settings-fold=guidance]')"), null);
  await click('[data-project-rename] input');
  await evaluate("document.querySelector('[data-project-rename] input').select()");
  await command("Input.insertText", { text: "项目的新名称" }, sessionId);
  await navigate(() => click('[data-project-rename] button[type=submit]'));
  await waitFor(general, 15_000);
  assert.equal(await evaluate("document.querySelector('[data-project-rename] input').value"), "项目的新名称");
  await click('[data-project-delete-open]');
  assert.equal(await evaluate("document.querySelector('[data-project-delete-dialog]').open"), true);
  assert.equal(await evaluate("document.querySelector('[data-project-delete-dialog] button[type=submit]').disabled"), true);
  assert.match(await evaluate<string>("document.querySelector('[data-project-delete-dialog]').textContent"), /项目的新名称/);
  // The dialog lists the plugin data that goes with the project, as the Home's plugins name it.
  await waitFor("!document.querySelector('[data-project-delete-scope]').hidden && document.querySelector('[data-project-delete-scope]').textContent.includes('Pages 文稿与文件夹')");
  assert.match(await evaluate<string>("document.querySelector('[data-project-delete-scope]').textContent"), /Forms 问卷及收到的全部回答/);
  await click('[data-project-delete-cancel]');
  assert.equal((await fetch(origin + prefix + "/settings/general")).status, 200);
  await click('[data-project-delete-open]');
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor("!document.querySelector('[data-project-delete-dialog]').open");
  assert.equal((await fetch(origin + prefix + "/settings/general")).status, 200);

  // The same dialog in an English UI: the sentence, and the plugins' labels (their own English tables, served by the Host).
  await command("Network.setCookie", { name: "molis_work_locale", value: "en", url: origin }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/general?desktop=1" }, sessionId));
  await waitFor(general, 15_000);
  assert.equal(await evaluate("document.documentElement.lang"), "en");
  await click('[data-project-delete-open]');
  await waitFor("document.querySelector('[data-project-delete-scope]').textContent.includes('Pages documents and folders')");
  const englishScope = await evaluate<string>("document.querySelector('[data-project-delete-scope]').textContent");
  assert.match(englishScope, /Data that plugins keep for this project is deleted with it\./);
  assert.match(englishScope, /Forms and every answer they received/);
  assert.match(englishScope, /Todos placed in this project/);
  for (const chinese of ["Pages 文稿与文件夹", "Forms 问卷及收到的全部回答", "放在这个项目里的待办", "各插件里属于这个项目的数据也会一起删除。"]) assert.doesNotMatch(englishScope, new RegExp(chinese));
  await click('[data-project-delete-cancel]');
  await command("Network.setCookie", { name: "molis_work_locale", value: "zh", url: origin }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/general?desktop=1" }, sessionId));
  await waitFor(general, 15_000);

  // Exercise both themes and a narrow layout against the actual settings and modal. The screenshots go to the ignored review folder.
  const screenshots = resolve(".impeccable/qa/review", "project-settings");
  await mkdir(screenshots, { recursive: true });
  for (const { width, theme } of [{ width: 1280, theme: "light" }, { width: 480, theme: "dark" }]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
    await waitFor(`document.documentElement.dataset.resolvedTheme === ${JSON.stringify(theme)}`);
    const pageScreenshot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(resolve(screenshots, `project-settings-${width}-${theme}.png`), Buffer.from(pageScreenshot.data, "base64"));
    await click('[data-project-delete-open]');
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    assert.equal(await evaluate("document.querySelector('[data-project-delete-dialog]').clientHeight < 500"), true);
    const screenshot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(resolve(screenshots, `project-delete-${width}-${theme}.png`), Buffer.from(screenshot.data, "base64"));
    await click('[data-project-delete-cancel]');
  }
  await click('[data-project-delete-open]');
  await click('[name=delete_confirmed]');
  await command("Network.setBlockedURLs", { urls: [origin + `/api/settings/projects/${projectId}/delete`] }, sessionId);
  await click('[data-project-delete-dialog] button[type=submit]');
  await waitFor("!document.querySelector('[data-project-delete-error]').hidden && !document.querySelector('[data-project-delete-dialog] button[type=submit]').disabled");
  assert.equal((await fetch(origin + prefix + "/settings/general")).status, 200);
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  // The server commits, but this browser loses the response. Retry must use the same persisted deletion key.
  await evaluate(`(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (String(args[0]).endsWith('/delete')) { window.fetch = originalFetch; throw new TypeError('Connection lost after deletion'); }
      return response;
    };
  })()`);
  await click('[data-project-delete-dialog] button[type=submit]');
  // The browser lost the answer, so the page cannot know whether the project was deleted, and says so (W3-10: no browser English, no guess).
  await waitFor("!document.querySelector('[data-project-delete-error]').hidden && !document.querySelector('[data-project-delete-dialog] button[type=submit]').disabled && document.querySelector('[data-project-delete-error]').textContent.includes('不知道这次操作有没有完成')");
  assert.equal((await fetch(origin + prefix + "/settings/general")).status, 404);
  await navigate(() => click('[data-project-delete-dialog] button[type=submit]'));
  assert.equal(await evaluate("location.pathname + location.search"), "/?desktop=1");
  assert.deepEqual(await (await fetch(origin + "/api/settings/projects")).json(), { projects: [] });
});

// SSC-23, design 05-materials-directories A3 (user 2026-11-08): when the project's default output directory has files, the two option cards
// are the confirmation (no checkbox); keeping says where the folder stays, deleting removes it; an empty folder keeps today's checkbox.
test("SSC-23 A3 the delete dialog asks about the default output directory's files with option cards, says where kept files stay, and deletes them only when chosen", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "empty");
  if (!browser) return;
  const { origin, sessionId, command, evaluate, waitFor, click, navigate, homeDirectory } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/onboarding?desktop=1" }, sessionId));
  await navigate(() => click("#cx-exit"));
  const create = async (name: string) => (await evaluate<{ project: { project_id: string } }>(`fetch('/api/settings/projects', {
    method: 'POST', headers: molisWorkControlHeaders(), body: JSON.stringify({display_name:${JSON.stringify(name)},user_confirmed:true})
  }).then(async response => { if (!response.ok) throw new Error(await response.text()); return response.json(); })`)).project.project_id;
  const general = "document.querySelector('[data-tab-workspace]')?.dataset.exclusive === 'project-settings' && !!document.querySelector('[data-work-surface=project-settings] [data-project-rename]')";
  const openSettings = async (projectId: string) => {
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/settings/general?desktop=1` }, sessionId));
    await waitFor(general, 15_000);
  };
  const dialog = "document.querySelector('[data-project-delete-dialog]')";
  const submit = `${dialog}.querySelector('button[type=submit]')`;

  // An empty default output directory is not asked about: the checkbox confirms, as before.
  const empty = await create("没有文件的项目");
  await openSettings(empty);
  await click("[data-project-delete-open]");
  await waitFor(`${dialog}.querySelector('[data-project-delete-scope] span').textContent !== ''`);
  assert.equal(await evaluate(`${dialog}.querySelector('[data-project-delete-output]').hidden`), true);
  assert.equal(await evaluate(`${dialog}.querySelector('[data-project-delete-confirm]').hidden`), false);
  await click("[data-project-delete-cancel]");

  // Files there: the question shows, the checkbox goes, nothing is preset, and the button says what it will do.
  const keep = await create("留下文件的项目");
  const keptFolder = join(homeDirectory, "outputs", keep);
  await mkdir(keptFolder, { recursive: true });
  await writeFile(join(keptFolder, "报告.md"), "# 留着\n");
  await openSettings(keep);
  await click("[data-project-delete-open]");
  await waitFor(`!${dialog}.querySelector('[data-project-delete-output]').hidden`);
  assert.equal(await evaluate(`${dialog}.querySelector('[data-project-delete-confirm]').hidden`), true);
  assert.equal(await evaluate(`${submit}.disabled`), true);
  assert.deepEqual(await evaluate(`[...${dialog}.querySelectorAll('[data-ix-option]')].map(option => option.getAttribute('aria-checked'))`), ["false", "false"]);
  assert.equal(await evaluate(`${dialog}.querySelector('[role=radiogroup]').getAttribute('aria-labelledby') === ${dialog}.querySelector('.project-delete-output__ask').id`), true);
  await click("[data-project-delete-dialog] [data-ix-option=delete]");
  assert.equal(await evaluate(`${submit}.textContent`), "删除项目和文件");
  // The arrow keys move the choice, as a radio group does.
  await evaluate(`${dialog}.querySelector('[data-ix-option=delete]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))`);
  assert.equal(await evaluate(`document.activeElement?.dataset.ixOption`), "keep");
  assert.equal(await evaluate(`${submit}.textContent`), "删除项目");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  await click("[data-project-delete-dialog] button[type=submit]");
  await waitFor(`!${dialog}.querySelector('[data-project-delete-kept]').hidden`, 15_000);
  assert.equal(await evaluate(`${dialog}.querySelector('header h2').textContent`), "项目已删除");
  assert.equal(await evaluate(`${dialog}.querySelector('[data-project-delete-kept-path]').textContent`), await realpath(keptFolder).catch(() => keptFolder));
  assert.equal(await readFile(join(keptFolder, "报告.md"), "utf8"), "# 留着\n");
  assert.equal(await evaluate(`${dialog}.querySelector('[data-project-delete-actions]').hidden`), true);
  await navigate(() => click("[data-project-delete-home]"));
  assert.equal(await evaluate("location.pathname + location.search"), "/?desktop=1");

  // Chosen to delete: the folder goes with the project and the page goes back to the list.
  const gone = await create("删除文件的项目");
  const goneFolder = join(homeDirectory, "outputs", gone);
  await mkdir(goneFolder, { recursive: true });
  await writeFile(join(goneFolder, "草稿.md"), "# 删掉\n");
  await openSettings(gone);
  await click("[data-project-delete-open]");
  await waitFor(`!${dialog}.querySelector('[data-project-delete-output]').hidden`);
  await click("[data-project-delete-dialog] [data-ix-option=delete]");
  await navigate(() => click("[data-project-delete-dialog] button[type=submit]"));
  assert.equal(await evaluate("location.pathname + location.search"), "/?desktop=1");
  await assert.rejects(readFile(join(goneFolder, "草稿.md")), { code: "ENOENT" });
});

// SSC-23, design 05-materials-directories A3 and review N4 (user 2026-11-08): the deletion is one request under one key. Refused before it
// started, the choice opens again and the next try is a new deletion under a new key; once the project is out of the list but cleanup is
// unfinished, the choice is fixed and the only way on is 「重试清理」 under the same key. Files kept without being asked are said so.
test("SSC-23 A3 N4 the delete dialog opens the choice again under a new key after a refusal, fixes it while cleanup is unfinished, and says files were kept when not asked", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "empty");
  if (!browser) return;
  const { origin, sessionId, command, evaluate, waitFor, click, navigate, homeDirectory } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/onboarding?desktop=1" }, sessionId));
  await navigate(() => click("#cx-exit"));
  const create = async (name: string) => (await evaluate<{ project: { project_id: string } }>(`fetch('/api/settings/projects', {
    method: 'POST', headers: molisWorkControlHeaders(), body: JSON.stringify({display_name:${JSON.stringify(name)},user_confirmed:true})
  }).then(async response => { if (!response.ok) throw new Error(await response.text()); return response.json(); })`)).project.project_id;
  const general = "document.querySelector('[data-tab-workspace]')?.dataset.exclusive === 'project-settings' && !!document.querySelector('[data-work-surface=project-settings] [data-project-rename]')";
  const openSettings = async (projectId: string) => {
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/settings/general?desktop=1` }, sessionId));
    await waitFor(general, 15_000);
  };
  const dialog = "document.querySelector('[data-project-delete-dialog]')";
  const submit = `${dialog}.querySelector('button[type=submit]')`;
  // The page's delete request answers from a queue the test fills; every body it sent is kept to read the keys and choices back.
  const stubDelete = (answers: Array<{ status: number; body: unknown }>) => evaluate(`(() => {
    const original = window.fetch, answers = ${JSON.stringify(answers)};
    window.__deleteBodies = [];
    window.fetch = async (input, init) => {
      if (!String(input).endsWith('/delete')) return original(input, init);
      window.__deleteBodies.push(JSON.parse(init.body));
      const answer = answers.shift();
      return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'content-type': 'application/json' } });
    };
  })()`);
  const sent = () => evaluate<Array<{ idempotency_key: string; output_files?: string }>>("window.__deleteBodies");

  t.diagnostic("asked about the files: the description says the person's own folders stay");
  const projectId = await create("清理未完成的项目");
  const folder = join(homeDirectory, "outputs", projectId);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "报告.md"), "# 留着\n");
  await openSettings(projectId);
  await click("[data-project-delete-open]");
  await waitFor(`!${dialog}.querySelector('[data-project-delete-output]').hidden`);
  assert.match(await evaluate<string>(`${dialog}.querySelector('.runtime-plan-body > p[id]').textContent`), /。你自己选的文件夹里的代码和文件会保留。$/);

  t.diagnostic("refused before the deletion started: the choice opens again and the next try has a new key (N4)");
  await stubDelete([
    { status: 400, body: { error: "现在不能删除这个项目", code: "catalog.delete_refused" } },
    { status: 200, body: { deletion: { cleanup_state: "pending" } } },
    { status: 200, body: { deletion: { cleanup_state: "pending" } } },
  ]);
  await click("[data-project-delete-dialog] [data-ix-option=keep]");
  await click("[data-project-delete-dialog] button[type=submit]");
  await waitFor(`!${dialog}.querySelector('[data-project-delete-error]').hidden && !${submit}.disabled`);
  assert.match(await evaluate<string>(`${dialog}.querySelector('[data-project-delete-error]').textContent`), /现在不能删除这个项目/);
  assert.deepEqual(await evaluate(`[...${dialog}.querySelectorAll('[data-ix-option]')].map(option => option.disabled)`), [false, false]);
  await click("[data-project-delete-dialog] [data-ix-option=delete]");
  assert.equal(await evaluate(`${submit}.textContent`), "删除项目和文件");

  t.diagnostic("out of the list but cleanup unfinished: the choice is fixed and only 「重试清理」 is offered, under the same key");
  await click("[data-project-delete-dialog] button[type=submit]");
  await waitFor(`${submit}.textContent === '重试清理' && !${submit}.disabled`);
  const [refused, started] = await sent();
  assert.equal(refused.output_files, "keep");
  assert.equal(started.output_files, "delete");
  assert.notEqual(started.idempotency_key, refused.idempotency_key, "a refused deletion's key is not reused for another choice");
  assert.match(await evaluate<string>(`${dialog}.querySelector('[data-project-delete-error]').textContent`), /本机数据清理未完成/);
  assert.deepEqual(await evaluate(`[...${dialog}.querySelectorAll('[data-ix-option]')].map(option => option.disabled)`), [true, true]);
  assert.equal(await evaluate(`${dialog}.querySelector('[data-project-delete-keep-instead]').disabled`), true);
  assert.equal(await evaluate(`${dialog}.querySelector('[data-project-delete-busy]').hidden`), true);
  // The fixed choice does not move from the keyboard either.
  await evaluate(`${dialog}.querySelector('[data-ix-option=delete]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))`);
  assert.equal(await evaluate(`${dialog}.querySelector('[aria-checked=true]')?.dataset.ixOption`), "delete");
  // Closed and opened again, the dialog still only retries the cleanup.
  await click("[data-project-delete-cancel]");
  await click("[data-project-delete-open]");
  assert.equal(await evaluate(`${submit}.textContent`), "重试清理");
  await click("[data-project-delete-dialog] button[type=submit]");
  await waitFor(`window.__deleteBodies.length === 3 && ${submit}.textContent === '重试清理' && !${submit}.disabled`);
  const retried = (await sent())[2];
  assert.equal(retried.idempotency_key, started.idempotency_key);
  assert.equal(retried.output_files, "delete");

  t.diagnostic("not asked, files found and kept: the note starts by saying so");
  const quiet = await create("没被问到的项目");
  await openSettings(quiet);
  await click("[data-project-delete-open]");
  await waitFor(`${dialog}.querySelector('[data-project-delete-scope] span').textContent !== ''`);
  assert.equal(await evaluate(`${dialog}.querySelector('[data-project-delete-output]').hidden`), true);
  assert.doesNotMatch(await evaluate<string>(`${dialog}.querySelector('.runtime-plan-body > p[id]').textContent`), /你自己选的文件夹/);
  await stubDelete([{ status: 200, body: { deletion: { cleanup_state: "complete" }, kept_output_directory: "/kept/outputs/" + quiet } }]);
  await click("[name=delete_confirmed]");
  await click("[data-project-delete-dialog] button[type=submit]");
  await waitFor(`!${dialog}.querySelector('[data-project-delete-kept]').hidden`);
  assert.equal(await evaluate(`${dialog}.querySelector('[data-project-delete-kept-path]').textContent`), "/kept/outputs/" + quiet);
  assert.match(await evaluate<string>(`${dialog}.querySelector('[data-project-delete-kept-note]').textContent`), /^里面有文件，删除时没有动它们。文件夹以项目编号命名/);
  assert.equal((await sent())[0].output_files, undefined, "nothing was asked, so no choice is sent");
});

// Global settings open over the named project's workbench (specs/artifact-positioning S6): moving between categories,
// into the planning editor and out again stays on that page, and closing settings is back at the work.
test("global settings retain project context through sections, planning cancel and return", {timeout:60_000}, async t=>{
  const b=await openGoalBrowser(t,true);if(!b)return;
  const {origin,projectId,sessionId,command,evaluate,click,openGoalFrame,navigate,waitFor}=b;
  const shown=(selector:string)=>waitFor(`!!document.querySelector('[data-work-surface=settings] ${selector}')`,15_000);
  for(const desktop of [false,true]) {
    await navigate(()=>command('Page.navigate',{url:`${origin}/projects/${projectId}/${desktop?'?desktop=1':''}`},sessionId));
    await waitFor("document.querySelector('[data-titlebar-tabs] .tab-add-button')");
    await click('[data-plugin-id=goals]');
    await openGoalFrame('.tree-node[data-select-goal=CORE]');
    await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal==='CORE'");
    await navigate(()=>command('Page.navigate',{url:`${origin}/settings/appearance?project=${projectId}${desktop?'&desktop=1':''}`},sessionId));
    await shown('[data-settings-panel=appearance]');
    const address=`/projects/${projectId}/${desktop?'?desktop=1':''}`;
    assert.equal(await evaluate('location.pathname + location.search'),address);
    for(const section of ['runtimes','planning']){
      await click(`[data-directory-panel=settings] [data-settings-section="${section}"]`);
      await shown(`[data-settings-panel="${section}"]`);
      assert.equal(await evaluate('location.pathname + location.search'),address);
    }
    await click('[data-work-surface=settings] a[href^="/settings/planning/new"]');
    await shown('[data-planning-edit-form]');
    await click('.planning-edit-footer a');
    await waitFor("!document.querySelector('[data-work-surface=settings] [data-planning-edit-form]')",15_000);
    await click('[data-directory-panel=settings] [data-settings-section="diagnostics"]');
    await shown('[data-settings-panel="diagnostics"]');
    await click('[data-cover-close]');
    assert.equal(await evaluate('location.pathname + location.search'),address);
    await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal==='CORE' && !document.querySelector('[data-goal-frame-surface]').hidden");
  }
  // Without a project named, settings open over the project last opened; closing them is back in that workbench.
  await navigate(()=>command('Page.navigate',{url:origin+'/settings/appearance'},sessionId));
  await shown('[data-settings-panel=appearance]');
  await click('[data-directory-panel=settings] [data-settings-section="runtimes"]');
  await shown('[data-settings-panel="runtimes"]');
  await click('[data-cover-close]');
  await waitFor("!document.querySelector('[data-tab-workspace]')?.dataset.exclusive");
  assert.equal(await evaluate('location.pathname'),`/projects/${projectId}/`);
});
