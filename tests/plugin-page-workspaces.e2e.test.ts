import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";
import { CODING_TAKEN, codingAdd } from "./fixtures/coding-composer.js";

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
  // The session on show takes the workbench bar's one input.
  await browser.waitFor(CODING_TAKEN);
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
      await browser.evaluate(codingAdd("context"));
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
  assert.ok(asked.includes(`原默认目录「${output.display_name}」将移出项目`) && asked.includes("已有文件保留"), asked);
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

test("BL-set-output-revision SYS-15-U9 an output confirmed in one window after another window changed the folders is refused as stale", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "coding");
  const prefix = `/projects/${browser.projectId}`;
  const asked = join(browser.homeDirectory, "asked-output"), elsewhere = join(browser.homeDirectory, "elsewhere-output");
  await mkdir(asked); await mkdir(elsewhere);
  const state = () => browser.evaluate<{ directories: Array<{ workspace_id: string; canonical_path: string; display_name: string; roles: string[] }>; revision: string }>(
    `fetch(${JSON.stringify(prefix + "/api/project-settings/directories")}).then(r=>r.json())`);

  // Window B: the project settings in a second window of its own (not a background tab, so window A stays visible and keeps its dialog),
  // opened before window A brings Coding forward so B shows the project's home rather than the restored Coding tab.
  const { targetId } = await browser.command<{ targetId: string }>("Target.createTarget", { url: "about:blank", newWindow: true });
  t.after(() => browser.command("Target.closeTarget", { targetId }).catch(() => undefined));
  const other = await browser.openPage(targetId);
  await other.viewport(1360, 900);
  await other.command("Page.navigate", { url: browser.origin + prefix + "/" });
  await other.wait("!!document.querySelector('.navigator-project-settings')", { timeoutMs: 30_000 });
  // The project settings entry is in the project menu: open it first, as a person does.
  await other.click("details:has(.navigator-project-settings) > summary");
  await other.click(".navigator-project-settings");
  await other.wait("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  await other.click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
  await other.wait("!!document.querySelector('[data-directories-add]') && document.querySelector('[data-project-directories]')?.dataset.state==='ready'");
  for (const path of [asked, elsewhere]) {
    await other.evaluate(`(()=>{const node=document.querySelector('[data-directories-add] [name=path]');node.value=${JSON.stringify(path)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await other.click("[data-directories-add] [type=submit]");
    await other.wait(`document.querySelector('[data-directories-inputs]').textContent.includes(${JSON.stringify(path.split("/").pop())})`);
  }
  // Window A: Coding, whose page asks for the output.
  await pluginFrameInitScript(t, browser, `window.molisWorkbenchPluginFactories=new Proxy({}, {
    set(target,key,value){target[key]=key==='coding'?host=>{window.workspaceHost=host;return value(host)}:value;return true}
  });`);
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + prefix + "/?openPlugin=coding" }, browser.sessionId));
  await browser.surfaceReady("coding"); await child.click("[data-coding-new]");
  await browser.waitFor(CODING_TAKEN);
  const before = await state();
  const [askedPath, elsewherePath] = [await realpath(asked), await realpath(elsewhere)];
  const askedFolder = before.directories.find(item => item.canonical_path === askedPath)!, elsewhereFolder = before.directories.find(item => item.canonical_path === elsewherePath)!;
  assert.ok(askedFolder && elsewhereFolder, JSON.stringify(before));

  const setOutput = (id: string) => child.evaluate(`(()=>{const button=document.createElement('button');document.body.append(button);
    window.setOutputResult=new Promise(resolve=>button.addEventListener('click',()=>workspaceHost.workspaces.setOutput(${JSON.stringify(id)}).then(()=>resolve('set'),error=>resolve(String(error.message))),{once:true}));
    return true})()`).then(() => child.click("body > button:last-of-type"));
  const dialogNames = (name: string) => browser.waitFor(`document.querySelector('[data-page-dialog=confirm]')?.textContent.includes(${JSON.stringify(name)})`);

  // A opens the confirmation; B then makes another folder the output; A confirms what it was shown.
  await setOutput(askedFolder.workspace_id);
  await dialogNames(askedFolder.display_name);
  await other.click(`[data-directories-inputs] [data-directory-row="${elsewhereFolder.workspace_id}"] [data-act=set-output]`);
  await other.wait(`document.querySelector('[data-directories-output] [data-directory-row] [data-text=path]')?.title === ${JSON.stringify(elsewherePath)}`);
  const changedElsewhere = await state();
  assert.deepEqual(changedElsewhere.directories.find(item => item.workspace_id === elsewhereFolder.workspace_id)?.roles, ["input", "output"], "B's change took effect");
  assert.ok(await browser.evaluate("!!document.querySelector('[data-page-dialog=confirm]')"), "A's dialog is still open while B changes the folders");
  await browser.click("[data-page-dialog=confirm] [type=submit]");
  assert.equal(await child.evaluate("window.setOutputResult"), "项目的文件夹刚在别处改过，这次没有改动。请再操作一次，按最新的文件夹确认。",
    "A is told plainly that what it confirmed is out of date");
  const kept = await state();
  assert.deepEqual(kept, changedElsewhere, "the stale confirmation changed nothing: B's output stays");
  assert.deepEqual(kept.directories.find(item => item.workspace_id === askedFolder.workspace_id)?.roles, ["input"]);

  // Asked again, A's dialog is built from the folders as they are now (B's output named), and confirming it works.
  await setOutput(askedFolder.workspace_id);
  await dialogNames(askedFolder.display_name);
  const question = String(await browser.evaluate("document.querySelector('[data-page-dialog=confirm]').textContent"));
  assert.ok(question.includes(`原目录「${elsewhereFolder.display_name}」停止写入`), question);
  await browser.click("[data-page-dialog=confirm] [type=submit]");
  assert.equal(await child.evaluate("window.setOutputResult"), "set");
  const after = await state();
  assert.deepEqual(after.directories.find(item => item.workspace_id === askedFolder.workspace_id)?.roles, ["input", "output"], "A's folder is the output now");
  assert.deepEqual(after.directories.find(item => item.workspace_id === elsewhereFolder.workspace_id)?.roles, ["input"], "B's folder stays an input");
  assert.equal(after.directories.filter(item => item.roles.includes("output")).length, 1);
});
