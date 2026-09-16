import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("onboarding header links receive real pointer clicks in Web, desktop and narrow layouts", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { origin, sessionId, command, evaluate, click, navigate } = browser;
  const projects = await (await fetch(origin + "/api/settings/projects")).json();
  for (const { width, desktop } of [{ width: 1440, desktop: false }, { width: 980, desktop: true }, { width: 480, desktop: false }]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    const path = "/onboarding?mode=new-project" + (desktop ? "&desktop=1" : "");
    await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
    assert.equal(await evaluate("document.body.dataset.onboardingMode"), "new_project");
    await navigate(() => click('.onboarding-topbar-actions a'));
    assert.equal(await evaluate("location.pathname"), "/");
    assert.equal(await evaluate("new URLSearchParams(location.search).get('migration')"), "1");
    assert.equal(await evaluate("document.querySelector('[data-project-migration-dialog]')?.open"), true);
    assert.equal(await evaluate("new URLSearchParams(location.search).get('desktop')"), desktop ? "1" : null);
    await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
    await navigate(() => click('[data-onboarding-dismiss]'));
    assert.equal(await evaluate("location.pathname"), "/");
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
  await navigate(() => click("[data-onboarding-dismiss]"));
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
  await navigate(() => click("[data-onboarding-dismiss]"));
  const created = await evaluate<{ project: { project_id: string } }>(`fetch('/api/settings/projects', {
    method: 'POST', headers: molisWorkControlHeaders(), body: JSON.stringify({display_name:'项目设置浏览器测试',user_confirmed:true})
  }).then(async response => { if (!response.ok) throw new Error(await response.text()); return response.json(); })`);
  const projectId = created.project.project_id;
  const prefix = `/projects/${projectId}`;
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/general?desktop=1" }, sessionId));
  await waitFor("document.body.classList.contains('project-preferences-page') && !!document.querySelector('[data-project-rename]')");
  assert.equal(await evaluate("!!document.querySelector('.project-name-form[data-project-rename]')"), true);
  assert.equal(await evaluate("document.querySelector('.project-settings-navigation a[href*=rules]') != null"), true);
  assert.equal(await evaluate("document.querySelector('[data-settings-fold=guidance]')"), null);
  await click('[data-project-rename] input');
  await evaluate("document.querySelector('[data-project-rename] input').select()");
  await command("Input.insertText", { text: "项目的新名称" }, sessionId);
  await navigate(() => click('[data-project-rename] button[type=submit]'));
  assert.equal(await evaluate("document.querySelector('[data-project-rename] input').value"), "项目的新名称");
  await click('[data-project-delete-open]');
  assert.equal(await evaluate("document.querySelector('[data-project-delete-dialog]').open"), true);
  assert.equal(await evaluate("document.querySelector('[data-project-delete-dialog] button[type=submit]').disabled"), true);
  assert.match(await evaluate<string>("document.querySelector('[data-project-delete-dialog]').textContent"), /项目的新名称/);
  await click('[data-project-delete-cancel]');
  assert.equal((await fetch(origin + prefix + "/settings/general")).status, 200);
  await click('[data-project-delete-open]');
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor("!document.querySelector('[data-project-delete-dialog]').open");
  assert.equal((await fetch(origin + prefix + "/settings/general")).status, 200);

  // Exercise both themes and a narrow layout against the actual settings and modal.
  for (const { width, theme } of [{ width: 1280, theme: "light" }, { width: 480, theme: "dark" }]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
    await waitFor(`document.documentElement.dataset.resolvedTheme === ${JSON.stringify(theme)}`);
    const pageScreenshot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(`/private/tmp/molis-work-project-settings-${width}-${theme}.png`, Buffer.from(pageScreenshot.data, "base64"));
    await click('[data-project-delete-open]');
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    assert.equal(await evaluate("document.querySelector('[data-project-delete-dialog]').clientHeight < 500"), true);
    const screenshot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(`/private/tmp/molis-work-project-delete-${width}-${theme}.png`, Buffer.from(screenshot.data, "base64"));
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
  await waitFor("document.querySelector('[data-project-delete-error]').textContent.includes('Connection lost after deletion')");
  assert.equal((await fetch(origin + prefix + "/settings/general")).status, 404);
  await navigate(() => click('[data-project-delete-dialog] button[type=submit]'));
  assert.equal(await evaluate("location.pathname + location.search"), "/?desktop=1");
  assert.deepEqual(await (await fetch(origin + "/api/settings/projects")).json(), { projects: [] });
});

test("global settings retain project context through sections, planning cancel and return", {timeout:60_000}, async t=>{
  const b=await openGoalBrowser(t,true);if(!b)return;
  const {origin,projectId,sessionId,command,evaluate,click,navigate,waitFor}=b;
  for(const desktop of [false,true]) {
    await navigate(()=>command('Page.navigate',{url:`${origin}/projects/${projectId}/${desktop?'?desktop=1':''}`},sessionId));
    await waitFor("document.querySelector('[data-titlebar-tabs] .tab-item')");
    await click('[data-plugin-id=goals]');
    await click('.tree-node[data-select-goal=CORE]');
    await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal==='CORE'");
    await navigate(()=>command('Page.navigate',{url:`${origin}/settings/appearance?project=${projectId}${desktop?'&desktop=1':''}`},sessionId));
    for(const section of ['runtimes','planning']){
      await navigate(()=>click(`.settings-navigation a[href^="/settings/${section}"]`));
      assert.equal(await evaluate("new URLSearchParams(location.search).get('project')"),projectId);
      assert.equal(await evaluate("new URLSearchParams(location.search).get('desktop')"),desktop?'1':null);
    }
    await navigate(()=>click('a[href^="/settings/planning/new"]'));
    await navigate(()=>click('.planning-edit-footer a'));
    await navigate(()=>click('.settings-navigation a[href^="/settings/diagnostics"]'));
    await navigate(()=>click('.settings-nav-back'));
    assert.equal(await evaluate('location.pathname'),`/projects/${projectId}/`);
    await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal==='CORE' && !document.querySelector('[data-goal-frame-surface]').hidden");
  }
  await navigate(()=>command('Page.navigate',{url:origin+'/settings/appearance'},sessionId));
  await navigate(()=>click('.settings-navigation a[href^="/settings/runtimes"]'));
  await navigate(()=>click('[aria-label="关闭全局设置"]'));
  assert.equal(await evaluate('location.pathname'),'/');
});
