import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { effectsFromContract, sandboxPluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { requiredHeadlessTestBrowser } from "./fixtures/dedicated-headless-browser.js";
import { fixture, homePackage, mac, operate, operationsOf } from "./fixtures/home-sandbox.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { newPublisher, signedPackage } from "./fixtures/sandbox-package.js";
import { serveTestHost } from "./fixtures/test-home.js";

// BL-915 (specs/visual-ui-experience/work-items/batch27-sandbox-recovery/spec.md, option A chosen by the user 2026-11-11): on the 插件 page, an
// uninstall that deleted data but left something in place says so where the row was: each kind with why, that the rest is gone, and 「知道了」.
// A clean-up that stopped part way is said and retried in the same row. Real Host, real signed packages, the person's own clicks.

const LIBRARY_ID = "io.molis.work.example.kept", LIBRARY_EN_ID = "io.molis.work.example.kept-en";
const SCHEMA = "CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);";
const libraryPackage = (pluginId = LIBRARY_ID) => signedPackage(newPublisher(), (files, manifest) => {
  const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
  contract.operations.find(operation => operation.id === "notes.add")!.effects = { storage: ["read", "write"], homeDatabase: ["read", "write"] };
  Object.assign(manifest, sandboxPluginManifest({ pluginId: manifest.plugin_id, name: "Kept notes", version: manifest.version, publisher: manifest.publisher, presentation: false,
    runtime: { scope: "home" }, effects: effectsFromContract(contract), homeDatabase: { version: 1, schema: SCHEMA } }));
  files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
  files[SANDBOX_PACKAGE_FILES.entrypoint] = `export const operations = { 'notes.list': async () => [], 'notes.add': async (input, sdk) => { await sdk.homeDatabase.transaction([{ sql: 'INSERT INTO notes(text) VALUES (?)', parameters: [input.text] }]); return true; } };\n`;
}, { pluginId });
const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: null, permissions: ["storage:private", "home-database:read", "home-database:write"] };

test("BL-915 B27-UN-02 B27-UN-04 B27-UN-05 the 插件 page shows what an uninstall left in place of its row until 「知道了」, and a stopped clean-up is said and retried in its row, for the Home and a project, by pointer and by keyboard", { ...mac, timeout: 240_000 }, async t => {
  const h = await fixture(t), served = await serveTestHost(null, { home: h.home, host: h.host });
  const directory = await mkdtemp(join(tmpdir(), "b27-uninstall-retained-")), shots = fileURLToPath(reviewEvidenceUrl("b27-uninstall-retained"));
  let browser: ChromeHarness | undefined;
  t.after(async () => { try { await browser?.close(); await served.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  await mkdir(shots, { recursive: true });

  // A Home package with its own library, written once; a file the Host never made sits beside its database, so the library is kept and said so.
  const keep = async (pluginId: string) => {
    await h.install(libraryPackage(pluginId));
    const install = h.host.homePlugins!.installation(pluginId)!.install_id;
    for (const permission of ["home-database:read", "home-database:write"]) await served.web.post("/api/settings/plugin-permissions/set", { install_id: install, permission, granted: true });
    await operate(h.homeClient(), caller, await operationsOf(h.homeClient(), caller, pluginId), "notes.add", { text: "one" });
    const library = join(h.home, "sbxdb-" + createHash("sha256").update(pluginId).digest("hex").slice(0, 32));
    writeFileSync(join(library, "notes.txt"), "not the Host's");
    return library;
  };
  const library = await keep(LIBRARY_ID);

  browser = await ChromeHarness.start(directory, { executable: requiredHeadlessTestBrowser() });
  const page = await browser.page();
  await page.command("Runtime.enable");
  await page.viewport(1024, 900);
  const project = await served.createProject("插件设置"), settings = `/projects/${project.project_id}/settings/plugins`;
  /** Load a page and wait until the old document is gone and the plugin lists are drawn. */
  const go = async (path: string | null) => {
    await page.evaluate("window.beforeLoad = true").catch(() => undefined);
    await page.command(path === null ? "Page.reload" : "Page.navigate", path === null ? {} : { url: served.origin + path });
    for (let tries = 0; ; tries++) {
      try { if (await page.evaluate<boolean>("!window.beforeLoad && document.readyState === 'complete' && !!document.querySelector('[data-plugin-trust-home] details')")) break; } catch { /* the page is between documents */ }
      assert.ok(tries < 150, `the page loads: ${path}`); await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  await go(settings);
  const press = async (scope: string, label: string) => {
    await page.wait(`[...document.querySelectorAll(${JSON.stringify(scope + " button")})].some(b => b.textContent === ${JSON.stringify(label)} && !b.disabled)`);
    await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(scope + " button")})].find(b => b.textContent === ${JSON.stringify(label)} && !b.disabled).click()`);
  };
  /** One key, pressed and let go, as the person's keyboard sends it. */
  const key = async (name: "Tab" | "Enter") => {
    const code = name === "Tab" ? 9 : 13, text = name === "Enter" ? "\r" : undefined;
    await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: name, code: name, windowsVirtualKeyCode: code, ...(text ? { text } : {}) });
    await page.command("Input.dispatchKeyEvent", { type: "keyUp", key: name, code: name, windowsVirtualKeyCode: code });
  };
  const focused = () => page.evaluate<string>("document.activeElement?.textContent?.trim() ?? ''");
  /** Tab until the focused control says `label`, checking each stop is inside `scope`; a control the keyboard cannot reach fails here. */
  const tabTo = async (label: string, scope: string) => {
    for (let stops = 0; stops < 12; stops++) {
      await key("Tab");
      if (await focused() === label) return;
      assert.equal(await page.evaluate(`!!document.activeElement?.closest(${JSON.stringify(scope)})`), true, `focus stays in ${scope} on the way to ${label}`);
    }
    assert.fail(`the keyboard reaches ${label}`);
  };
  const open = (name: string) => page.evaluate(`[...document.querySelectorAll('[data-plugin-trust-home] details')].find(d => d.querySelector('summary').textContent.includes(${JSON.stringify(name)})).open = true`);

  await open("Kept notes");
  await press("[data-plugin-trust-home]", "卸载并删除数据");
  await press("dialog[open]", "卸载并删除数据");
  await page.wait("document.querySelector('[data-plugin-trust-home] .plugin-trust-result') !== null", { describe: "document.querySelector('[data-plugin-trust-error]')?.innerText" });
  const shown = await page.evaluate<{ text: string; tone: string; focused: boolean; kinds: number; marks: number; rows: number }>(`(() => {
    const result = document.querySelector('[data-plugin-trust-home] .plugin-trust-result'), alert = result.querySelector('.mw-alert');
    return { text: result.innerText, tone: alert.className, focused: document.activeElement === result, kinds: result.querySelectorAll('.plugin-trust-kept > li').length,
      marks: result.querySelectorAll('.plugin-trust-kept svg').length, rows: [...document.querySelectorAll('[data-plugin-trust-home] summary')].filter(s => s.textContent.includes('Kept notes')).length };
  })()`);
  assert.match(shown.text, /已卸载 Kept notes · 有 1 项留下了/u);
  assert.match(shown.text, /它的个人库/u); assert.match(shown.text, /核实不了是不是它的，为稳妥没有删/u); assert.match(shown.text, /其余数据已经删除。/u);
  assert.doesNotMatch(shown.text, /sbxdb-|notes\.txt|io\.molis/u, "no store name, path or id is shown");
  assert.match(shown.tone, /mw-alert--warning/u, "something to check is a warning, not just information");
  assert.deepEqual([shown.focused, shown.kinds, shown.marks, shown.rows], [true, 1, 1, 0], "focus moves to the result, one kind with its mark, the row is gone");
  assert.equal(await page.evaluate("document.querySelector('[data-settings-toast], [data-toast]')?.classList.contains('is-visible') ?? false"), false, "no toast competes with it");
  assert.equal(existsSync(join(library, "notes.txt")), true);
  await page.screenshot(join(shots, "kept-1024-zh-light.png"));
  await page.viewport(390, 844, true);
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, "no sideways scroll at 390");
  await page.screenshot(join(shots, "kept-390-zh-light.png"));
  // B27-UN-05: at 1440 the result keeps its row's place and width, inside the page's column.
  await page.viewport(1440, 950);
  const wide = await page.evaluate<{ fits: boolean; inColumn: boolean }>(`(() => {
    const result = document.querySelector('[data-plugin-trust-home] .plugin-trust-result').getBoundingClientRect(), list = document.querySelector('[data-plugin-trust-home]').getBoundingClientRect();
    return { fits: document.documentElement.scrollWidth <= window.innerWidth, inColumn: result.left >= list.left - 1 && result.right <= list.right + 1 };
  })()`);
  assert.deepEqual(wide, { fits: true, inColumn: true }, "at 1440 the result sits in the list's column, no sideways scroll");
  await page.screenshot(join(shots, "kept-1440-zh-light.png"));
  await page.viewport(1024, 900);
  await press("[data-plugin-trust-home]", "知道了");
  await page.wait("document.querySelector('[data-plugin-trust-home] .plugin-trust-result') === null");
  assert.doesNotMatch(await page.evaluate<string>("document.querySelector('[data-plugin-trust-home]').innerText"), /Kept notes/u, "put away, and the plugin is not listed");

  // The same in English and dark, for a second package of the same name (an uninstalled plugin id is not installed again here).
  await keep(LIBRARY_EN_ID);
  await page.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await go(`/locale?lang=en&next=${encodeURIComponent(settings)}`);
  // B27-UN-05: this time by keyboard alone, from the row's own summary: open it, reach the button, confirm in the dialog, put the result away.
  await page.evaluate(`[...document.querySelectorAll('[data-plugin-trust-home] summary')].find(s => s.textContent.includes('Kept notes')).focus()`);
  await key("Enter");
  assert.equal(await page.evaluate("document.activeElement.closest('details').open"), true, "Enter on the summary opens the row");
  await tabTo("Uninstall and delete data", "[data-plugin-trust-home] details[open]");
  await key("Enter");
  await page.wait("!!document.querySelector('dialog[open]') && !!document.activeElement?.closest('dialog[open]')", { describe: "document.activeElement?.outerHTML" });
  await tabTo("Uninstall and delete data", "dialog[open]");
  await key("Enter");
  await page.wait("document.querySelector('[data-plugin-trust-home] .plugin-trust-result') !== null", { describe: "document.querySelector('[data-plugin-trust-error]')?.innerText" });
  assert.equal(await page.evaluate("document.activeElement === document.querySelector('[data-plugin-trust-home] .plugin-trust-result')"), true, "the result takes the focus");
  const english = await page.evaluate<string>("document.querySelector('[data-plugin-trust-home] .plugin-trust-result').innerText");
  for (const words of ["Kept notes is uninstalled · 1 left in place", "Its library", "Couldn’t confirm it was this plugin’s, so it was left in place", "Everything else was deleted.", "Got it"]) assert.ok(english.includes(words), words);
  assert.equal(english.match(/[㐀-鿿]/u), null, "no Chinese is left in English");
  await page.screenshot(join(shots, "kept-1024-en-dark.png"));
  await page.viewport(1440, 950);
  await page.screenshot(join(shots, "kept-1440-en-dark.png"));
  await page.viewport(1024, 900);
  await tabTo("Got it", "[data-plugin-trust-home] .plugin-trust-result");
  await key("Enter");
  await page.wait("document.querySelector('[data-plugin-trust-home] .plugin-trust-result') === null");
  assert.equal(await page.evaluate("!!document.activeElement && document.activeElement !== document.body && !!document.activeElement.closest('[data-plugin-trust-settings]')"), true,
    "put away by keyboard, the focus stays in the plugin settings, not lost to the page");
  await page.command("Emulation.setEmulatedMedia", { features: [] });
  await go(`/locale?lang=zh&next=${encodeURIComponent(settings)}`);

  // An uninstall whose clean-up stops part way (its files' folder now points outside the Home): said in its row, opened, retried there.
  const publisher = newPublisher(), broken = homePackage(publisher), brokenName = broken.payload.manifest.name;
  await h.install(broken);
  const installId = h.host.homePlugins!.installation(broken.payload.manifest.plugin_id)!.install_id;
  const outside = mkdtempSync(join(tmpdir(), "b27-outside-")), parent = join(h.home, "plugin-files"), held = parent + "-held";
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  mkdirSync(join(outside, installId));
  const moved = existsSync(parent);
  if (moved) renameSync(parent, held);
  symlinkSync(outside, parent);
  await go(null);
  await page.wait(`[...document.querySelectorAll('[data-plugin-trust-home] summary')].some(s => s.textContent.includes(${JSON.stringify(brokenName)}))`);
  await open(brokenName);
  await press("[data-plugin-trust-home]", "卸载并删除数据");
  await press("dialog[open]", "卸载并删除数据");
  await page.wait("document.querySelector('[data-plugin-trust-home] .mw-alert--danger') !== null && document.activeElement?.textContent === '重试卸载'", { describe: "document.querySelector('[data-plugin-trust-home]')?.innerText" });
  const failed = await page.evaluate<{ text: string; open: boolean; role: string | null; top: boolean; retry: number; focused: string | null; seen: boolean }>(`(() => {
    const alert = document.querySelector('[data-plugin-trust-home] .mw-alert--danger');
    return { text: alert.innerText, open: alert.closest('details').open, role: alert.getAttribute('role'), top: !document.querySelector('[data-plugin-trust-error]').hidden,
      retry: alert.querySelectorAll('.mw-btn--primary').length, focused: document.activeElement?.textContent ?? null,
      seen: (() => { const box = alert.getBoundingClientRect(); return box.top >= 0 && box.bottom <= window.innerHeight; })() };
  })()`);
  assert.match(failed.text, /卸载没做完/u); assert.match(failed.text, /重试卸载/u);
  assert.deepEqual([failed.open, failed.role, failed.top, failed.retry], [true, "alert", false, 1], "said in its own opened row, not at the top of the page");
  assert.deepEqual([failed.focused, failed.seen], ["重试卸载", true], "brought into view with the retry under the person's hand");
  await page.screenshot(join(shots, "failed-1024-zh-light.png"));
  unlinkSync(parent); if (moved) renameSync(held, parent);
  await press("[data-plugin-trust-home] .mw-alert--danger", "重试卸载");
  await page.wait(`![...document.querySelectorAll('[data-plugin-trust-home] summary')].some(s => s.textContent.includes(${JSON.stringify(brokenName)}))`, { describe: "document.querySelector('[data-plugin-trust-home]')?.innerText" });
  assert.equal(await page.evaluate("document.querySelector('[data-plugin-trust-home] .plugin-trust-result')"), null, "nothing was left, so nothing is listed");

  // B27-UN-05, the project's half: a package installed in this project whose clean-up stops part way is said and retried in the project's list,
  // and once nothing is left it goes with the usual short note, nothing listed in its place.
  const projectPackage = signedPackage(newPublisher(), undefined, { pluginId: "io.molis.work.example.project-notes" }), projectName = projectPackage.payload.manifest.name;
  const trust = `/projects/${project.project_id}/api/plugin-trust`;
  const pending = await served.web.post(`${trust}/install/preview`, { bundle: projectPackage }) as { preview_id: string };
  await served.web.post(`${trust}/install/confirm`, { preview_id: pending.preview_id, consent: true, pin_label: "Test publisher" });
  const projectInstall = (await served.web.get(`${trust}/overview`) as { plugins: Array<{ plugin_id: string; install_id: string }> })
    .plugins.find(plugin => plugin.plugin_id === "io.molis.work.example.project-notes")!.install_id;
  const projectFiles = join(h.home, "projects", project.project_id, "plugin-files"), projectHeld = projectFiles + "-held", projectOutside = mkdtempSync(join(tmpdir(), "b27-outside-project-"));
  t.after(() => rmSync(projectOutside, { recursive: true, force: true }));
  mkdirSync(join(projectOutside, projectInstall));
  mkdirSync(join(h.home, "projects", project.project_id), { recursive: true });
  const projectMoved = existsSync(projectFiles);
  if (projectMoved) renameSync(projectFiles, projectHeld);
  symlinkSync(projectOutside, projectFiles);
  await go(null);
  await page.wait(`[...document.querySelectorAll('[data-plugin-trust-list] summary')].some(s => s.textContent.includes(${JSON.stringify(projectName)}))`);
  await page.evaluate(`[...document.querySelectorAll('[data-plugin-trust-list] details')].find(d => d.querySelector('summary').textContent.includes(${JSON.stringify(projectName)})).open = true`);
  await press("[data-plugin-trust-list]", "卸载并删除数据");
  await press("dialog[open]", "卸载并删除数据");
  await page.wait("document.querySelector('[data-plugin-trust-list] .mw-alert--danger') !== null && document.activeElement?.textContent === '重试卸载'", { describe: "document.querySelector('[data-plugin-trust-list]')?.innerText" });
  assert.match(await page.evaluate<string>("document.querySelector('[data-plugin-trust-list] .mw-alert--danger').innerText"), /卸载没做完/u);
  assert.equal(await page.evaluate("document.querySelector('[data-plugin-trust-home] .mw-alert--danger')"), null, "said in the project's own list, not the personal space's");
  await page.viewport(1440, 950);
  await page.screenshot(join(shots, "project-failed-1440-zh-light.png"));
  await page.viewport(1024, 900);
  unlinkSync(projectFiles); if (projectMoved) renameSync(projectHeld, projectFiles);
  await key("Enter");
  await page.wait(`![...document.querySelectorAll('[data-plugin-trust-list] summary')].some(s => s.textContent.includes(${JSON.stringify(projectName)}))`, { describe: "document.querySelector('[data-plugin-trust-list]')?.innerText" });
  assert.equal(await page.evaluate("document.querySelector('[data-plugin-trust-list] .plugin-trust-result')"), null, "nothing was left in the project, so nothing is listed");
  assert.equal(existsSync(join(projectOutside, projectInstall)), true, "the folder outside the Home was never deleted through the link");
});
