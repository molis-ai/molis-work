import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";

test("SYS-15-U9 S-47 Coding links and selects only through the trusted workspace service", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "coding");
  const prefix = `/projects/${browser.projectId}`;
  const first = join(browser.homeDirectory, "first-workspace"), second = join(browser.homeDirectory, "cancelled-workspace");
  await mkdir(first); await mkdir(second);
  await pluginFrameInitScript(t, browser, `window.molisWorkbenchPluginFactories=new Proxy({}, {
    set(target,key,value){target[key]=key==='coding'?host=>{window.workspaceHost=host;return value(host)}:value;return true}
  });`);
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + prefix + "/?openPlugin=coding" }, browser.sessionId));
  await browser.surfaceReady("coding"); await child.click("[data-coding-new]");
  await child.waitFor("document.querySelector('[data-coding-task]')?.getClientRects().length");
  const state = () => browser.evaluate<{ workspaces: Array<{ workspace_id: string; canonical_path: string }>; selected: string | null }>(
    `fetch(${JSON.stringify(prefix + "/api/project-settings/workspaces")}).then(r=>r.json())`);
  const initial = await state();
  for (const path of ["/api/workspaces", "/api/project-settings/workspaces", "/api/host/plugin-page-workspaces"]) {
    assert.equal(await child.evaluate(`fetch(${JSON.stringify(prefix + path)},{method:'POST',headers:{'x-molis-context-page':'invented'},body:JSON.stringify({operation:'add',value:${JSON.stringify(first)},workspace_path:${JSON.stringify(first)},user_confirmed:true})}).then(r=>r.status)`), 403);
  }
  const open = async () => {
    if (await child.evaluate("document.querySelector('.coding-context').hidden")) {
      await child.click("[data-coding-attach-toggle]"); await child.click("[data-coding-context-toggle]");
    }
    await child.click("[data-coding-workspace-open]");
    await child.waitFor("document.querySelector('[data-coding-workspace-dialog]').open");
  };
  const request = async (path: string) => {
    await child.evaluate(`document.querySelector('[data-coding-workspace-path]').value=${JSON.stringify(path)};document.querySelector('[data-coding-workspace-confirm]').checked=true`);
    await child.click("[data-coding-workspace-form] [type=submit]");
    await browser.waitFor(`document.querySelector('[data-page-dialog=confirm]')?.textContent.includes(${JSON.stringify(path)})`);
  };
  await open(); await request(first);
  assert.deepEqual(await state(), initial, "the child confirmation has not authorized a directory");
  await browser.evaluate("document.querySelector('[data-page-dialog=confirm] [type=submit]').click();document.querySelector('[data-page-dialog=confirm] form').requestSubmit()");
  assert.deepEqual(await state(), initial, "scripted clicks and form submissions cannot confirm the Host dialog");
  await browser.click("[data-page-dialog=confirm] [type=submit]");
  await child.waitFor("!document.querySelector('[data-coding-workspace-dialog]').open");
  const linked = await state(), canonical = await realpath(first), workspace = linked.workspaces.find(item => item.canonical_path === canonical);
  assert.ok(workspace, JSON.stringify(linked)); assert.equal(linked.selected, workspace.workspace_id);
  await child.waitFor("document.querySelector('[data-coding-workspace-label]').textContent.includes('first-workspace')");
  await open(); await request(second);
  await browser.click("[data-page-dialog=confirm] [type=button]");
  await child.waitFor("!document.querySelector('[data-coding-workspace-form] [type=submit]').disabled");
  assert.deepEqual(await state(), linked, "cancelling adds no directory and preserves the selected one");
  await child.click("[data-coding-workspace-close]");
  assert.equal(await child.evaluate("workspaceHost.workspaces.select('outside-this-project').then(()=>false,()=>true)"), true);
  assert.deepEqual(await state(), linked, "a foreign selection changes nothing");
  // The same public service follows an already authorized session directory without granting additional paths.
  await child.evaluate(`workspaceHost.workspaces.select(${JSON.stringify(workspace.workspace_id)})`);
  assert.deepEqual(await state(), linked);
  await open(); await request(second);
  await browser.evaluate("document.querySelector('[data-work-surface=coding]').hidden=true");
  await browser.waitFor("!document.querySelector('[data-page-dialog=confirm]')");
  assert.deepEqual(await state(), linked, "hiding cancels the pending confirmation");
});
