import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { createArtifactReferenceRenderer } from "@molis-ai/molis-work-app-workbench";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { bindFileEntriesHandler, defineFileContentAction, defineFileEntriesAction, definePlugin, fileContentOf } from "@molis-ai/molis-work-plugin-sdk";
import { armResponse, openAuditBrowser, releaseResponse, typeField, until, waitHeld, type AuditBrowser } from "./fixtures/workbench-audit-browser.js";

test("W2-18-SETTINGS-LATE-01: a delayed failed settings load cannot replace another category or its unsaved input", { timeout: 120_000 }, async t => {
  const browser = await openAuditBrowser(t); if (!browser) return;
  await browser.click(".navigator-project-settings");
  await browser.waitFor("!!document.querySelector('[data-project-rename] input')");
  const path = browser.origin + "/projects/" + browser.projectId + "/settings/workspaces?embed=1";
  await browser.command("Network.enable", {}, browser.sessionId);
  await browser.command("Network.setBlockedURLs", { urls: [path] }, browser.sessionId);
  await armResponse(browser, "settings-A", "/settings/workspaces", "GET", "fetch");
  await browser.click("[data-directory-panel=project-settings] [data-settings-section=workspaces]"); await waitHeld(browser, "settings-A");
  await browser.click("[data-directory-panel=project-settings] [data-settings-section=general]");
  await browser.waitFor("!!document.querySelector('[data-project-rename] input')");
  await typeField(browser, "[data-project-rename] input", "General settings unsaved input B");
  const address = await browser.evaluate("location.href");
  await releaseResponse(browser, "settings-A");
  await browser.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  assert.equal(await browser.evaluate("document.querySelector('[data-project-rename] input')?.value"), "General settings unsaved input B");
  assert.equal(await browser.evaluate("document.querySelector('[data-directory-panel=project-settings] [aria-current=page]')?.dataset.settingsSection"), "general");
  assert.equal(await browser.evaluate("document.querySelector('[data-work-surface=project-settings] [data-settings-loading]')"), null);
  assert.equal(await browser.evaluate("location.href"), address);
  await browser.command("Network.setBlockedURLs", { urls: [] }, browser.sessionId);
  await browser.click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
  await browser.waitFor("!!document.querySelector('[data-project-workspaces-add]')", 15_000);
});

const reference = createArtifactReferenceRenderer({ escape: value => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;"), icon: () => "", text: value => value });

for (const first of ["success", "error"] as const) {
  test(`W2-18-REFERENCE-LATE-01: closing A and opening B ignores A's delayed ${first} from the real file reader`, { timeout: 120_000 }, async t => {
    const browser = await openAuditBrowser(t); if (!browser) return;
    const root = join(browser.homeDirectory, "audit-workspace");
    if (first === "success") await writeFile(join(root, "A.txt"), "A file content");
    await writeFile(join(root, "B.txt"), "B file content");
    const links = reference("project://A.txt", "File A") + reference("project://B.txt", "File B");
    await browser.evaluate(`(() => { const nav=document.createElement('nav'); nav.id='audit-references'; nav.innerHTML=${JSON.stringify(links)};
      [...nav.querySelectorAll('a[data-project-reference]')].forEach((link,index)=>{link.id='audit-reference-'+index;});
      nav.style.cssText='position:fixed;top:100px;left:600px;z-index:1000'; document.body.append(nav); })()`);
    await armResponse(browser, "reference-A", encodeURIComponent("project://A.txt"), "GET", "text");
    await browser.click("#audit-reference-0"); await waitHeld(browser, "reference-A");
    await browser.click("[data-project-reference-dialog] [data-dialog-close]");
    await browser.click("#audit-reference-1");
    await browser.waitFor("document.querySelector('[data-project-reference-body]').textContent === 'B file content'");
    const before = await browser.evaluate(`({ title:document.querySelector('#project-reference-title').textContent, body:document.querySelector('[data-project-reference-body]').textContent,
      download:document.querySelector('[data-project-reference-download]').getAttribute('href'), open:document.querySelector('[data-project-reference-dialog]').open })`);
    await releaseResponse(browser, "reference-A");
    await browser.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.deepEqual(await browser.evaluate(`({ title:document.querySelector('#project-reference-title').textContent, body:document.querySelector('[data-project-reference-body]').textContent,
      download:document.querySelector('[data-project-reference-download]').getAttribute('href'), open:document.querySelector('[data-project-reference-dialog]').open })`), before);
    assert.equal((before as { body: string }).body, "B file content");
    await browser.click("[data-project-reference-dialog] [data-dialog-close]");
    await armResponse(browser, "closed-A", encodeURIComponent("project://A.txt"), "GET", "text");
    await browser.click("#audit-reference-0"); await waitHeld(browser, "closed-A");
    await browser.click("[data-project-reference-dialog] [data-dialog-close]");
    const closedBody = await browser.evaluate("document.querySelector('[data-project-reference-body]').textContent");
    await releaseResponse(browser, "closed-A");
    await browser.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.equal(await browser.evaluate("document.querySelector('[data-project-reference-dialog]').open"), false);
    assert.equal(await browser.evaluate("document.querySelector('[data-project-reference-body]').textContent"), closedBody);
  });
}

test("W2-18-MARKET-REFRESH-01: reopening the market after a switcher membership change follows the Host and Dock; failed reads leave the last facts and permit retry", { timeout: 120_000 }, async t => {
  const browser = await openAuditBrowser(t); if (!browser) return;
  const projects = async () => (await (await fetch(browser.origin + "/api/settings/project-plugins")).json()).projects as Array<{ project_id: string; plugins: string[]; hidden: string[] }>;
  // Form is personal: its effective membership also follows the persisted hidden list.
  const plugin = "form", hasForm = (row: { plugins: string[]; hidden: string[] }) => row.plugins.includes(plugin) || !row.hidden.includes(plugin);
  const initially = hasForm((await projects()).find(row => row.project_id === browser.projectId)!);
  await browser.click('[data-global-menu] [data-plugin-id="market"]');
  await browser.waitFor("!!document.querySelector('[data-market-project] option') && !document.querySelector('[data-market-add=form]').disabled");
  const membership = "document.querySelector('[data-market-add=form]').dataset.marketMembership";
  assert.equal(await browser.evaluate(membership), initially ? "added" : "available");
  await browser.click('[data-plugin-strip] [data-plugin-id="home"]');
  await browser.click("[data-plugin-picker-toggle]");
  await browser.click("[data-plugin-toggle=form]");
  if (initially) await browser.click("[data-plugin-toggle=form]");
  await until(projects, rows => hasForm(rows.find(row => row.project_id === browser.projectId)!) === !initially, "membership changed through the real switcher");
  await browser.waitFor(`document.querySelector('[data-plugin-toggle=form]')?.dataset.state === ${JSON.stringify(initially ? "available" : "added")}`, 15_000);
  if (!initially && !await browser.evaluate("document.querySelector('[data-plugin-tile=form] .dock-keep')?.getAttribute('aria-pressed') === 'true'")) {
    await browser.click("[data-plugin-tile=form] .dock-keep");
  }
  await browser.click("[data-plugin-picker-toggle]");
  await browser.click('[data-global-menu] [data-plugin-id="market"]');
  await browser.waitFor(`!document.querySelector('[data-market-add=form]').disabled && ${membership} === ${JSON.stringify(initially ? "available" : "added")}`, 15_000);
  assert.equal(await browser.evaluate("!!document.querySelector('[data-plugin-strip] [data-plugin-id=form]')"), !initially);
  assert.equal(hasForm((await projects()).find(row => row.project_id === browser.projectId)!), !initially);
  await browser.click('[data-plugin-strip] [data-plugin-id="home"]');
  await browser.command("Network.enable", {}, browser.sessionId);
  await browser.command("Network.setBlockedURLs", { urls: [browser.origin + "/api/settings/project-plugins"] }, browser.sessionId);
  await browser.click('[data-global-menu] [data-plugin-id="market"]');
  await browser.waitFor("!document.querySelector('[data-market-retry]').hidden");
  assert.equal(await browser.evaluate(membership), initially ? "available" : "added");
  assert.equal(await browser.evaluate("document.querySelector('[data-market-add=form]').disabled"), true);
  await browser.command("Network.setBlockedURLs", { urls: [] }, browser.sessionId);
  await browser.click("[data-market-retry]");
  await browser.waitFor("document.querySelector('[data-market-retry]').hidden && !document.querySelector('[data-market-add=form]').disabled");
  assert.equal(await browser.evaluate(membership), initially ? "available" : "added");
});

async function installFileSource(browser: AuditBrowser, key: string, openId: string, read: () => string) {
  assert.ok(browser.localHost);
  const kinds = [{ kind: key + "-file", title: key.toUpperCase() + " files", surface: "pages" }];
  const entries = defineFileEntriesAction("audit." + key + ".files.entries", kinds, key + " files", ["audit:read"]);
  const content = defineFileContentAction("audit." + key + ".files.content", kinds, key + " files", ["audit:read"]);
  const title = key.toUpperCase() + " document", subject = { kind: key + "-file", id: "same-id" };
  const definition = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.audit." + key, version: "1.0.0", name: title,
    kind: "app", publisher: { publisher_id: "audit", signature: "audit-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "audit:read", required: false, reason: "Read fixture files" }], actions: [entries, content],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } },
    async start() { return { kind: "app", actions: [
      { ...entries, ...bindFileEntriesHandler(entries, () => [{ subject, revision: "1", title, folder: [], media_type: "text/plain", size: null, updated_at: null, open: { surface: "pages", id: openId } }]) },
      { ...content, handle: () => fileContentOf({ subject, revision: "1", title, media_type: "text/plain", text: read() }) },
    ] }; },
  });
  const reference = molisWorkHostProjectReference({ databasePath: browser.databasePath, projectId: browser.projectId! });
  const repository = await browser.localHost.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db));
  const runtime = new PluginRuntime(repository, undefined, { hostIds: ISOLATED_HOST_IDS, actions: { registry: browser.localHost.actionRegistry(reference), project_id: reference.project_id } });
  const installed = runtime.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants: ["audit:read"] }).install.install_id;
  await runtime.start(installed);
  const sources = (await (await fetch(browser.origin + "/projects/" + browser.projectId + "/api/side/files/sources")).json()).sources as Array<{ id: string; kinds: Array<{ kind: string }> }>;
  const source = sources.find(row => row.kinds.some(kind => kind.kind === subject.kind)); assert.ok(source);
  return { source: source.id, subject, title, stop: () => runtime.stop(installed) };
}

async function createPage(browser: AuditBrowser, title: string): Promise<string> {
  const response = await fetch(browser.origin + "/projects/" + browser.projectId + "/api/plugins/io.molis.work.pages/pages", { method: "POST", headers: {
    origin: browser.origin, "content-type": "application/json", "x-molis-work-control-token": browser.controlToken, "x-molis-work-idempotency-key": randomUUID(),
  }, body: JSON.stringify({ title }) });
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()).document.id;
}

async function openFile(browser: AuditBrowser, target: { source: string; subject: { kind: string; id: string } }) {
  await browser.evaluate(`document.dispatchEvent(new CustomEvent('molis:side-open',{ detail:{ tab:'files',target:${JSON.stringify(target)},focus:true } }))`);
}

for (const first of ["success", "error"] as const) {
  test(`W2-18-FILE-PREVIEW-01: same-id files from real Runtime sources retain B's content, title and open target after A's delayed ${first}; handed previews and returning invalidate reads`, { timeout: 120_000 }, async t => {
    const browser = await openAuditBrowser(t); if (!browser) return;
    const docA = await createPage(browser, "A backing document"), docB = await createPage(browser, "B backing document");
    const a = await installFileSource(browser, "a", docA, () => { if (first === "error") throw new ActionError("audit.read_refused", "A fixture read refused"); return "A owner content"; });
    const b = await installFileSource(browser, "b", docB, () => "B owner content");
    try {
      await armResponse(browser, "file-A", "/api/side/files/content?source=" + encodeURIComponent(a.source));
      await openFile(browser, a); await waitHeld(browser, "file-A");
      await openFile(browser, b);
      await browser.waitFor("document.querySelector('[data-side-files-body]').textContent === 'B owner content'");
      await releaseResponse(browser, "file-A");
      await browser.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      assert.equal(await browser.evaluate("document.querySelector('[data-side-files-body]').textContent"), "B owner content");
      assert.equal(await browser.evaluate("document.querySelector('[data-side-files-title]').textContent"), "B document");
      assert.deepEqual(await browser.evaluate("({surface:document.querySelector('[data-side-files-action=open]').dataset.surface,id:document.querySelector('[data-side-files-action=open]').dataset.id})"), { surface: "pages", id: docB });
      await armResponse(browser, "file-handed", "/api/side/files/content?source=" + encodeURIComponent(a.source));
      await openFile(browser, a); await waitHeld(browser, "file-handed");
      await browser.evaluate(`document.dispatchEvent(new CustomEvent('molis:side-open',{detail:{tab:'files',target:{preview:{id:'same-id',title:'Handed preview',media_type:'text/plain',text:'Handed body'}}}}))`);
      await releaseResponse(browser, "file-handed");
      await browser.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      assert.equal(await browser.evaluate("document.querySelector('[data-side-files-body]').textContent"), "Handed body");
      assert.equal(await browser.evaluate("document.querySelector('[data-side-files-title]').textContent"), "Handed preview");
      await armResponse(browser, "file-return", "/api/side/files/content?source=" + encodeURIComponent(a.source));
      await openFile(browser, a); await waitHeld(browser, "file-return");
      await browser.click("[data-side-files-action=back]");
      await openFile(browser, b);
      await browser.waitFor("document.querySelector('[data-side-files-body]').textContent === 'B owner content'");
      await releaseResponse(browser, "file-return");
      await browser.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      assert.equal(await browser.evaluate("document.querySelector('[data-side-files-body]').textContent"), "B owner content");
      assert.equal(await browser.evaluate("document.querySelector('[data-side-files-title]').textContent"), "B document");
    } finally { await b.stop(); await a.stop(); }
  });
}
