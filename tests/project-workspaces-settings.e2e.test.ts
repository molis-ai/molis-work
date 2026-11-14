import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// 「输入与输出」 in project settings (design workbench-shared-paths 03; 05-materials-directories B1 ④): inputs that can be added, removed and
// made the output; the one output (SSC-03), the default one until another is chosen and not made before it is used (SSC-24); a change made
// elsewhere meanwhile is refused and read again (SSC-03); what a folder stands in for, changed and unlinked here (SSC-26), a refused folder
// said where it was chosen (SSC-27). Git reads the output (Files did too until batch 06 retired it); a Coding session keeps the folder it was given.
test("SSC-03 SSC-24 SSC-26 SSC-27 inputs and output: add, make output, refuse a stale revision, change and unlink what a folder stands in for; Git follows the output, Coding stays", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const git = await pluginFrameBrowser(t, browser, "git");
  const { command, sessionId, navigate, origin, projectId, homeDirectory, evaluate, click, waitFor, reloadPage } = browser;
  const prefix = `/projects/${projectId}`;
  for (const name of ["alpha", "beta"]) {
    const directory = join(homeDirectory, name); await mkdir(directory);
    execFileSync("git", ["init", "-b", "main"], { cwd: directory, stdio: "ignore" });
    await writeFile(join(directory, `${name}.txt`), `${name} content`);
  }
  // A folder of another device may only be read from a folder outside the Home (SSC-27): these two are.
  const outside = await realpath(await mkdtemp(join(tmpdir(), "molis-directories-")));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const gamma = join(outside, "gamma"), delta = join(outside, "delta");
  await mkdir(gamma); await mkdir(delta);
  const defaultMade = existsSync(join(homeDirectory, "outputs", projectId));
  const section = "document.querySelector('[data-project-directories]')";
  const ready = `${section}?.dataset.state==='ready' && !${section}.hasAttribute('aria-busy')`;
  const status = () => evaluate<string>(`${section}.querySelector('[data-directories-status]').textContent`);
  const row = (list: "inputs" | "output", name: string) => `${section}.querySelector('[data-directories-${list}] [data-directory-row]:has([title$="/${name}"])')`;
  const outputPath = () => evaluate<string>(`${section}.querySelector('[data-directories-output] [data-text=path]')?.title ?? ''`);
  const api = (path: string, body?: unknown, method = "POST") => evaluate<any>(`(async()=>{const response=await fetch(${JSON.stringify(prefix + path)},${body === undefined ? '{}' : `{method:${JSON.stringify(method)},headers:molisWorkControlHeaders(),body:JSON.stringify(${JSON.stringify(body)})}`});return {status:response.status,body:await response.json()};})()`);
  const add = async (path: string, name: string) => {
    await evaluate(`${section}.querySelector('[data-directories-add] [name=path]').value=${JSON.stringify(path)}`);
    await click('[data-directories-add] [type=submit]');
    await waitFor(`!!${row("inputs", name)} && ${ready}`);
  };

  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/" }, sessionId));
  assert.equal(await evaluate("!!document.querySelector('[data-plugin-strip] [data-plugin-id=workspace]')"), false);
  t.diagnostic("open 输入与输出 in the workbench's settings");
  await click(".navigator-project-settings");
  await waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  assert.match(await evaluate<string>("document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]').textContent"), /输入与输出/);
  await click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
  await waitFor(ready);
  // The one output is the default output directory, named so; it is made only when first used (SSC-24).
  assert.equal(await evaluate(`${section}.querySelectorAll('[data-directories-output] [data-directory-row]').length`), 1);
  assert.equal(await evaluate(`${section}.querySelector('[data-directories-output] [data-text=name]').textContent`), "默认输出目录");
  assert.ok((await outputPath()).endsWith(`/outputs/${projectId}`));
  assert.equal(await evaluate(`!!${section}.querySelector('[data-directories-output] [data-if=unmade]')`), !defaultMade);

  t.diagnostic("a refused add keeps the path to correct");
  await command("Network.enable", {}, sessionId);
  await command("Network.setBlockedURLs", { urls: [origin + prefix + "/api/project-settings/directories"] }, sessionId);
  await evaluate(`${section}.querySelector('[data-directories-add] [name=path]').value=${JSON.stringify(join(homeDirectory, "alpha"))}`);
  await click("[data-directories-add] [type=submit]");
  await waitFor(`${section}.querySelector('[data-directories-status]').dataset.tone==='error' && ${ready}`);
  assert.equal(await evaluate(`${section}.querySelector('[data-directories-add] [name=path]').value`), join(homeDirectory, "alpha"));
  assert.equal(await evaluate(`${section}.querySelectorAll('[data-directories-inputs] [data-directory-row]').length`), 0);
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);

  for (const name of ["alpha", "beta"]) { t.diagnostic("add " + name); await add(join(homeDirectory, name), name); }
  assert.match(await status(), /「beta」加为输入了/);
  assert.equal(await evaluate(`${section}.querySelector('[data-directories-add] [name=path]').value`), "");
  const ids = await evaluate<Record<string, string>>(`Object.fromEntries(["alpha","beta"].map(name=>[name,${section}.querySelector('[data-directories-inputs] [data-directory-row]:has([title$="/'+name+'"])').dataset.directoryRow]))`);

  t.diagnostic("a Coding session keeps the folder it was given");
  const session = await api("/api/plugins/io.molis.work.coding/sessions", { title: "独立目录" });
  assert.equal(session.status, 200);
  const sessionPath = "/api/plugins/io.molis.work.coding/sessions/" + session.body.session.session_id;
  assert.equal((await api(sessionPath, { configuration: { intent: "discuss", workspace_id: ids.alpha, provider_id: "", model_id: "" } }, "PATCH")).status, 200);

  t.diagnostic("make beta the output");
  await click(`[data-project-directories] [data-act=set-output][data-workspace="${ids.beta}"]`);
  await waitFor(`(${section}.querySelector('[data-directories-output] [data-text=path]')?.title ?? '').endsWith('/beta') && ${ready}`);
  assert.match(await status(), /输出改成「beta」了/);
  assert.equal(await evaluate(`!!${row("output", "beta")}?.querySelector('[data-if=input]') && !!${row("output", "beta")}?.querySelector('[data-if=output]')`), true);
  assert.equal(await evaluate(`!!${row("inputs", "beta")}?.querySelector('[data-if=same]') && !${row("inputs", "beta")}?.querySelector('[data-act=set-output]')`), true);
  assert.equal((await api(sessionPath)).body.configuration.workspace_id, ids.alpha);
  t.diagnostic("Git reads the output");
  await click("[data-plugin-strip] [data-plugin-id=git]");
  await git.waitFor("document.querySelector('[data-companion=git]')?.textContent.includes('beta.txt')");

  t.diagnostic("standalone settings: a change made elsewhere meanwhile is refused and read again (SSC-03)");
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/workspaces" }, sessionId));
  await waitFor(ready);
  assert.ok((await outputPath()).endsWith("/beta"));
  const before = await api("/api/project-settings/directories", undefined);
  assert.equal(before.status, 200);
  assert.equal((await api("/api/project-settings/directories", { change: "add_input", input: { workspace_path: gamma, expected_revision: before.body.revision } })).status, 200);
  await click(`[data-project-directories] [data-act=remove][data-workspace="${ids.alpha}"]`);
  await waitFor(`!!${row("inputs", "gamma")} && ${ready}`);
  assert.match(await status(), /刚在别处改过，已重新读取/);
  assert.ok(await evaluate(`!!${row("inputs", "alpha")}`), "the stale change was not made");
  await click(`[data-project-directories] [data-act=remove][data-workspace="${ids.alpha}"]`);
  await waitFor(`!${row("inputs", "alpha")} && ${ready}`);
  assert.match(await status(), /「alpha」不再是输入，磁盘上的文件不动/);
  assert.equal(existsSync(join(homeDirectory, "alpha", "alpha.txt")), true);

  t.diagnostic("what a folder stands in for: shown under it, changed and unlinked here (SSC-26)");
  const read = await api("/api/project-settings/directories", undefined);
  const gammaId = read.body.directories.find((item: { canonical_path: string }) => item.canonical_path === gamma).workspace_id;
  assert.equal((await api("/api/project-settings/directories", { change: "map_source", input: { source_workspace_id: "workspace-from-laptop", workspace_id: gammaId, expected_revision: read.body.revision } })).status, 200);
  await reloadPage();
  await waitFor(ready);
  const link = `${section}.querySelector('[data-directory-link]')`;
  assert.equal(await evaluate(`${link}?.previousElementSibling?.dataset.directoryRow`), gammaId);
  assert.match(await evaluate<string>(`${link}.textContent`), /对应另一台设备上的文件夹/);
  await click(`[data-project-directories] [data-directory-link] [data-act=map]`);
  const chooser = "document.querySelector('[data-directory-chooser]')";
  await waitFor(`${chooser}?.matches(':popover-open')`);
  assert.equal(await evaluate(`${chooser}.querySelector('[aria-checked=true]')?.dataset.target`), gammaId);
  assert.equal(await evaluate(`${chooser}.contains(document.activeElement)`), true);
  // A folder in the Home is refused, and said under the choice, which stays open to be changed (SSC-27).
  await click(`[data-directory-chooser] [data-target="${ids.beta}"]`);
  assert.match(await evaluate<string>(`${chooser}.querySelector('[data-chooser-say]').textContent`), /改到「beta」里/);
  await click("[data-directory-chooser] [data-act=chooser-confirm]");
  await waitFor(`${chooser}?.querySelector('[data-chooser-say]').dataset.tone==='error' && ${ready}`);
  assert.equal(await evaluate(`${chooser}.matches(':popover-open')`), true);
  assert.equal(await evaluate(`${link}?.previousElementSibling?.dataset.directoryRow`), gammaId);
  // Another folder from the system window joins the project as an input, and the references are read there.
  await evaluate(`(()=>{const original=window.fetch;window.fetch=(input,init)=>String(input).endsWith('/api/workspaces/pick')?Promise.resolve(Response.json({path:${JSON.stringify(delta)}})):original(input,init);})()`);
  await click("[data-directory-chooser] [data-target=pick]");
  await waitFor(`${chooser}.querySelector('[data-target=pick]')?.hasAttribute('data-chosen') && !${chooser}.querySelector('[data-act=chooser-confirm]').disabled`);
  // The picked folder is named on the item that picked it.
  assert.equal(await evaluate(`${chooser}.querySelector('[data-target=pick] .mw-menu__desc').textContent`), delta);
  await click("[data-directory-chooser] [data-act=chooser-confirm]");
  await waitFor(`!${chooser} && !!${row("inputs", "delta")} && ${ready}`);
  assert.match(await status(), /改成在「delta」里读了/);
  assert.equal(await evaluate(`${link}?.previousElementSibling?.querySelector('[data-text=path]').title`), delta);
  assert.equal(await evaluate("document.activeElement?.dataset.act"), "map");
  await click(`[data-project-directories] [data-directory-link] [data-act=unmap]`);
  await waitFor(`!${link} && ${ready}`);
  assert.match(await status(), /已取消对应/);
  assert.ok(await evaluate(`!!${row("inputs", "delta")}`), "the folder stays in the project");

  t.diagnostic("set the output back to the default output directory from its chooser");
  await click("[data-project-directories] [data-act=change-output]");
  await waitFor(`${chooser}?.matches(':popover-open')`);
  assert.equal(await evaluate(`[...${chooser}.querySelectorAll('[data-target]')].some(item=>item.dataset.target==="${ids.beta}")`), false, "the output now is not offered");
  await click("[data-directory-chooser] [data-target=default]");
  assert.equal(await evaluate(`${chooser}.querySelector('[data-act=chooser-confirm]').textContent.trim()`), "设为输出");
  await click("[data-directory-chooser] [data-act=chooser-confirm]");
  await waitFor(`!${chooser} && (${section}.querySelector('[data-directories-output] [data-text=path]')?.title ?? '').endsWith('/outputs/${projectId}') && ${ready}`);
  assert.equal(await evaluate(`${section}.querySelector('[data-directories-output] [data-text=name]').textContent`), "默认输出目录");
  assert.equal(await evaluate(`!!${section}.querySelector('[data-directories-output] [data-if=unmade]')`), !existsSync(join(homeDirectory, "outputs", projectId)));
  await reloadPage();
  await waitFor(ready);
  assert.ok((await outputPath()).endsWith(`/outputs/${projectId}`));

  t.diagnostic("one line per row in both languages, both themes and three widths");
  const screenshots = resolve(".impeccable/qa/review", "project-directories");
  await mkdir(screenshots, { recursive: true });
  // A source link again, so the shots show every kind of row.
  const last = await api("/api/project-settings/directories", undefined);
  const deltaId = last.body.directories.find((item: { canonical_path: string }) => item.canonical_path === delta).workspace_id;
  await api("/api/project-settings/directories", { change: "map_source", input: { source_workspace_id: "workspace-output-from-laptop", workspace_id: deltaId, expected_revision: last.body.revision } });
  for (const locale of ["zh", "en"] as const) {
    await command("Network.setCookie", { name: "molis_work_locale", value: locale, url: origin }, sessionId);
    for (const { width, theme, mobile } of [{ width: 1440, theme: "light", mobile: false }, { width: 1024, theme: "dark", mobile: false }, { width: 390, theme: "dark", mobile: true }]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile }, sessionId);
      await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
      await reloadPage();
      await waitFor(`${ready} && document.documentElement.dataset.resolvedTheme === ${JSON.stringify(theme)}`);
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${locale} ${width}: no sideways scroll`);
      // Names, paths, notes and buttons each stay on one line, inside the section.
      const wrapped = await evaluate<string[]>(`[...${section}.querySelectorAll('.project-directory__name, .project-directory__path, .project-directory__note > span, .project-directory .mw-btn, .project-directory-link .mw-btn, .project-directory-link__copy > *, .project-directory .mw-btn [data-slot=button-label], .project-directory-link .mw-btn [data-slot=button-label]')]
        // A button's own box is taller than its line; whether its label wraps is read from the label's line boxes.
        .filter(node => node.getClientRects().length > 1 || (!node.matches('.mw-btn') && node.scrollHeight > parseFloat(getComputedStyle(node).lineHeight || '20') * 1.6) || node.getBoundingClientRect().right > ${section}.getBoundingClientRect().right + 1).map(node => node.className + ':' + node.textContent)`);
      assert.deepEqual(wrapped, [], `${locale} ${width} ${theme}`);
      const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(resolve(screenshots, `directories-${locale}-${width}-${theme}.png`), Buffer.from(shot.data, "base64"));
    }
    await click(`[data-project-directories] [data-directory-link] [data-act=map]`);
    // Measured and shot once it has come in.
    await waitFor(`${chooser}?.matches(':popover-open') && ${chooser}.getAnimations().every(animation => animation.playState !== 'running')`);
    const box = await evaluate<{ left: number; right: number; top: number; bottom: number }>(`(()=>{const r=${chooser}.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})()`);
    assert.ok(box.left >= 0 && box.right <= 390 && box.top >= 0 && box.bottom <= 900, `${locale}: the chooser stays in the window ${JSON.stringify(box)}`);
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(resolve(screenshots, `directories-chooser-${locale}-390-dark.png`), Buffer.from(shot.data, "base64"));
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
    await waitFor(`!${chooser} && document.activeElement?.dataset.act === 'map'`);
  }
  await command("Network.setCookie", { name: "molis_work_locale", value: "zh", url: origin }, sessionId);
});
