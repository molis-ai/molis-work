import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { HomeConsentLedger, homeIntegrationRegistry, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { integrationPackage } from "./fixtures/home-upgrade-source.js";
import { newPublisher, signedPackage } from "./fixtures/sandbox-package.js";
import { person, ref } from "./fixtures/home-sandbox.js";
import { connectorControl } from "./fixtures/connector-control.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

test("RAC-2619 real signed File previews show exact origins for initial installation and Home upgrade; cancel writes nothing", { skip: process.platform !== "darwin", timeout: 150_000 }, async t => {
  const executable = process.env.MOLIS_WORK_TEST_CHROME;
  assert.equal(executable, "/Users/yijunwang/.local/bin/molis-test-browser", "the dedicated browser is required, without a daily Chrome fallback");
  await access(executable, constants.X_OK);
  await access("/Users/yijunwang/.local/share/molis-test-browser/engine/chrome-headless-shell", constants.X_OK);
  const directory = await mkdtemp(join(tmpdir(), "t141-browser-"));
  let browser: ChromeHarness | undefined;
  t.after(async () => { try { await browser?.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  const f = await serveHomeRuntime(t, { completeText: null }), project = await f.project("Home upgrade");
  browser = await ChromeHarness.start(directory, { executable });
  const page = await browser.page();
  await page.command("Runtime.enable");
  await page.command("Page.navigate", { url: f.origin + `/projects/${project.project_id}/settings/plugins` });
  await page.wait("!!document.querySelector('[data-plugin-trust-pick]')");
  const publisher = newPublisher(), first = integrationPackage(publisher), pluginId = first.payload.manifest.plugin_id;
  const next = integrationPackage(publisher, { version: "1.1.0", title: "New feed <b>plain</b>", origins: ["https://new.example.com", "https://second.example.com"],
    code: `export const operations={'integration.health':async()=>({ok:true,status:'connected',message:'v2'}),'integration.poll':async()=>({ok:true,items:[{externalId:'v2',title:'v2',summary:'v2'}],cursor:'v2'})};` });
  const select = async (bundle: typeof first, name: string) => {
    const file = join(directory, name + ".json"); await writeFile(file, JSON.stringify(bundle));
    const doc = await page.command<{ root: { nodeId: number } }>("DOM.getDocument");
    const input = await page.command<{ nodeId: number }>("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "[data-plugin-trust-pick]" });
    await page.command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] });
    await page.wait("document.querySelector('[data-plugin-trust-preview]')?.hidden === false", { describe: "document.querySelector('[data-plugin-trust-error]')?.innerText" });
  };
  const text = () => page.evaluate<string>("document.querySelector('[data-plugin-trust-preview]').innerText");
  const written = async () => ({ pins: new HomeConsentLedger(f.home).publishers(),
    packages: await readdir(join(f.home, "plugin-packages")).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; }),
    record: f.host.homePlugins!.installation(pluginId),
    services: (await homeIntegrationRegistry(f.home)).connectionServices().filter(entry => entry.owner === pluginId) });
  const cancel = async () => { await page.click("[data-plugin-trust-preview] .mw-btn--secondary"); await page.wait("document.querySelector('[data-plugin-trust-preview]').hidden"); };
  const confirm = async () => {
    if (await page.evaluate("!!document.querySelector('[data-plugin-trust-preview] input')")) {
      await page.fill("[data-plugin-trust-preview] input", "Fixture publisher");
    }
    await page.click("[data-plugin-trust-preview] .mw-btn--primary");
    await page.wait("document.querySelector('[data-plugin-trust-preview]').hidden", { describe: "document.querySelector('[data-plugin-trust-error]')?.innerText" });
  };
  const before = await written();
  await select(first, "first-cancel");
  assert.match(await text(), /Example feed/); assert.match(await text(), /example-feed/);
  assert.ok((await text()).includes("https://api.example-feed.com"));
  await cancel(); assert.deepEqual(await written(), before);
  await select(first, "first-install"); await confirm();
  const installed = await written(); assert.equal(installed.record!.version, "1.0.0");
  await select(next, "upgrade-cancel");
  const shown = await text();
  assert.match(shown, /1\.0\.0/); assert.match(shown, /1\.1\.0/);
  for (const value of ["New feed <b>plain</b>", "example-feed", "https://new.example.com", "https://second.example.com"]) assert.ok(shown.includes(value), value);
  assert.equal(await page.evaluate("document.querySelectorAll('[data-plugin-trust-preview] b').length"), 0, "service titles are text, never markup");
  await cancel(); assert.deepEqual(await written(), installed);
  const screenshots = join(process.cwd(), ".impeccable/qa/review/t141"); await mkdir(screenshots, { recursive: true });
  for (const locale of ["zh", "en"] as const) {
    await page.command("Page.navigate", { url: f.origin + "/locale?lang=" + locale + "&next=" + encodeURIComponent(`/projects/${project.project_id}/settings/plugins`) });
    await page.wait("document.querySelector('[data-plugin-trust-home]')?.innerText.includes('1.0.0')");
    await select(next, "upgrade-" + locale);
    assert.ok((await text()).includes(locale === "zh" ? "可访问的服务地址" : "Service addresses it may access"));
    for (const width of [1440, 1024, 390]) {
      await page.viewport(width, 1000, width === 390);
      for (const theme of ["light", "dark"]) {
        await page.evaluate(`document.documentElement.dataset.theme = '${theme}'; document.documentElement.dataset.resolvedTheme = '${theme}'`);
        assert.equal(await page.evaluate("document.querySelector('[data-plugin-trust-preview]').getBoundingClientRect().width > 0"), true);
        assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true, "preview does not cause horizontal overflow");
        assert.equal(await page.evaluate("(() => { const panel = document.querySelector('[data-plugin-trust-preview]').getBoundingClientRect(); return [...document.querySelectorAll('[data-plugin-trust-preview] button')].every(button => { const box = button.getBoundingClientRect(); return box.left >= panel.left && box.right <= panel.right; }); })()"), true, "both confirmation controls fit inside the visible preview");
        await page.screenshot(join(screenshots, `${locale}-${width}-${theme}.png`));
      }
    }
    await cancel(); assert.deepEqual(await written(), installed);
  }
  await page.viewport(1440, 1000);
  await select(next, "upgrade-confirm"); await confirm();
  await page.wait("document.querySelector('[data-plugin-trust-home]').innerText.includes('1.1.0')");
  assert.equal(f.host.homePlugins!.installation(pluginId)!.install_id, installed.record!.install_id);
  const registry = await homeIntegrationRegistry(f.home);
  assert.deepEqual(registry.connectionServices().find(entry => entry.owner === pluginId)!.declaration.origins, ["https://new.example.com", "https://second.example.com"]);
  const bound = await registry.bind("example-feed", "source", { source_id: "browser-source", connection_id: null, credential_ref: null, config: {} });
  const pulled = await bound.connector_driver.poll({ cursor: null }, connectorControl());
  assert.equal(pulled.ok, true); if (pulled.ok) assert.equal(pulled.events[0]!.payload.summary, "v2");
  await page.command("Page.reload");
  await page.wait("document.querySelector('[data-plugin-trust-home]')?.innerText.includes('1.1.0')");
  // The same real picker continues to compare project packages against the project's list.
  const projectPublisher = newPublisher(), projectBundle = signedPackage(projectPublisher);
  const client = f.host.actionClient(project.reference);
  const preview = await client.invoke(person(project.project_id), ref(pluginInstallActions.preview), { bundle: projectBundle }) as { preview_id: string };
  await client.invoke(person(project.project_id), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Project publisher" });
  await page.command("Page.reload");
  await page.wait("document.querySelector('[data-plugin-trust-list]')?.innerText.includes('1.0.0')");
  await select(signedPackage(projectPublisher, (_files, manifest) => { manifest.upgrade_compatibility = { compatible_from_versions: ["1.0.0"] }; }, { version: "1.1.0" }), "project-upgrade");
  assert.match(await text(), /1\.0\.0/); assert.match(await text(), /1\.1\.0/);
  assert.ok(!(await text()).includes("Service addresses it may access"), "an app with no origins has no empty service group"); await cancel();
});
