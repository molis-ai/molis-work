import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";

test("SYS-15-U9 S-47 Coding links a folder and makes one the output only through the trusted workspace service", { timeout: 90_000 }, async t => {
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
  const state = () => browser.evaluate<{ directories: Array<{ workspace_id: string; canonical_path: string; display_name: string; roles: string[] }>; revision: string }>(
    `fetch(${JSON.stringify(prefix + "/api/project-settings/directories")}).then(r=>r.json())`);
  const initial = await state();
  for (const path of ["/api/workspaces", "/api/project-settings/directories", "/api/host/plugin-page-workspaces"]) {
    assert.equal(await child.evaluate(`fetch(${JSON.stringify(prefix + path)},{method:'POST',headers:{'x-molis-context-page':'invented'},body:JSON.stringify({operation:'add',value:${JSON.stringify(first)},workspace_path:${JSON.stringify(first)},user_confirmed:true})}).then(r=>r.status)`), 403);
  }
  const output = initial.directories.find(item => item.roles.includes("output"))!;
  assert.equal(await child.evaluate(`fetch(${JSON.stringify(prefix + "/api/host/plugin-page-workspaces")},{method:'POST',headers:{'x-molis-context-page':'invented'},body:JSON.stringify({operation:'set_output',value:${JSON.stringify(output.workspace_id)}})}).then(r=>r.status)`), 403);
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
  const linked = await state(), canonical = await realpath(first), workspace = linked.directories.find(item => item.canonical_path === canonical);
  assert.ok(workspace, JSON.stringify(linked)); assert.deepEqual(workspace.roles, ["input"], "a folder a page adds is an input");
  await child.waitFor("document.querySelector('[data-coding-workspace-label]').textContent.includes('first-workspace')");
  await open(); await request(second);
  await browser.click("[data-page-dialog=confirm] [type=button]");
  await child.waitFor("!document.querySelector('[data-coding-workspace-form] [type=submit]').disabled");
  assert.deepEqual(await state(), linked, "cancelling adds no directory");
  await child.click("[data-coding-workspace-close]");
  // Making a folder the output: one outside this project is refused before any dialog; one of its folders is named by the Host, not the page.
  const setOutput = (id: string) => child.evaluate(`(()=>{const button=document.createElement('button');document.body.append(button);
    window.setOutputResult=new Promise(resolve=>button.addEventListener('click',()=>workspaceHost.workspaces.setOutput(${JSON.stringify(id)}).then(()=>resolve('set'),error=>resolve(String(error.message))),{once:true}));
    return true})()`).then(() => child.click("body > button:last-of-type"));
  await setOutput("outside-this-project");
  assert.notEqual(await child.evaluate("window.setOutputResult"), "set");
  assert.deepEqual(await state(), linked, "a folder outside the project is not made the output");
  await setOutput(workspace.workspace_id);
  await browser.waitFor(`document.querySelector('[data-page-dialog=confirm]')?.textContent.includes(${JSON.stringify(workspace.display_name)})`);
  // The dialog says what happens to the output now: no longer written, its files stay, and, being only the output, it leaves the project.
  const asked = String(await browser.evaluate("document.querySelector('[data-page-dialog=confirm]').textContent"));
  assert.ok(asked.includes(`现在的输出目录「${output.display_name}」不再写入`) && asked.includes("它会从项目里移出"), asked);
  await browser.click("[data-page-dialog=confirm] [type=button]");
  assert.equal(await child.evaluate("window.setOutputResult"), "已取消");
  assert.deepEqual(await state(), linked, "cancelling keeps the output where it was");
  await setOutput(workspace.workspace_id);
  await browser.waitFor(`document.querySelector('[data-page-dialog=confirm]')?.textContent.includes(${JSON.stringify(workspace.display_name)})`);
  await browser.click("[data-page-dialog=confirm] [type=submit]");
  assert.equal(await child.evaluate("window.setOutputResult"), "set");
  const moved = await state();
  assert.deepEqual(moved.directories.find(item => item.workspace_id === workspace.workspace_id)?.roles, ["input", "output"], "the person confirmed: it is the output now");
  assert.equal(moved.directories.filter(item => item.roles.includes("output")).length, 1, "and the only one");
  await open(); await request(second);
  await browser.evaluate("document.querySelector('[data-work-surface=coding]').hidden=true");
  await browser.waitFor("!document.querySelector('[data-page-dialog=confirm]')");
  assert.deepEqual(await state(), moved, "hiding cancels the pending confirmation");
});
