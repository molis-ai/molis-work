import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { escapeHtml } from "@molis-ai/molis-work-design-system";
import { LocalProjectDatabase } from "../apps/local-host/src/project-database.js";
import { seedDemoBoard, DEMO_BOARD_ID } from "../apps/local-host/src/demo-seed.js";
import { handleBuilderHttp, releaseBuilderSurface } from "../apps/local-host/src/plugin-builder-surface.js";
import { authorizeLocalWebRequest, sendLocalWebJson, type LocalMutationState } from "../apps/local-host/src/web-http.js";
import { BrowserFixtureRuntime, ChromeHarness, type ChromePage } from "./fixtures/plugin-builder-browser.js";

// Real browser + HTTP guard + PluginPlatform + SQLite. The model outputs are explicit fixtures.
test("plugin builder browser completes creation, installed data, publishing and mobile flows with fixture Prologue", { timeout: 110000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "plugin-builder-browser-"));
  const browser = await ChromeHarness.start(directory);
  if (!browser) { await rm(directory, { recursive: true, force: true }); return t.skip("Chrome required for browser workflow verification"); }
  const databasePath = join(directory, "project.db"); seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath), runtime = new BrowserFixtureRuntime(directory);
  const token = randomUUID() + randomUUID(), mutations = new Map<string, LocalMutationState>(), mutationHeaders: string[] = [];
  const ports = { store, boardId: DEMO_BOARD_ID, actorId: "browser-test", homeDirectory: directory, goalTitle: () => undefined, escapeHtml, translate: (value: string) => value, capabilities: runtime,
    execution: { async ready() {}, async models() { return [{ provider_id: "fixture", model_id: "fixture-prologue", label: "Fixture Prologue · browser test" }]; } },
  };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    if (!authorizeLocalWebRequest(request, response, url, token, mutations)) return;
    if (request.method === "POST") mutationHeaders.push(String(request.headers["x-molis-work-idempotency-key"]));
    void handleBuilderHttp(request, response, url, ports, token).then(handled => { if (!handled) sendLocalWebJson(response, 404, { error: "fixture route missing" }); }).catch(error => sendLocalWebJson(response, 500, { error: String(error) }));
  });
  t.after(async () => {
    await browser.close();
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    await releaseBuilderSurface(store, DEMO_BOARD_ID); store.close(); await rm(directory, { recursive: true, force: true });
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert.ok(address && typeof address === "object"); const origin = `http://127.0.0.1:${address.port}`;
  const screenshots = resolve("specs/plugin-builder/work-items/prologue-runtime/screenshots"); await mkdir(screenshots, { recursive: true });
  const downloads = join(directory, "downloads"); await mkdir(downloads);
  await browser.command("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true });
  await browser.command("Target.setDiscoverTargets", { discover: true });
  const page = await browser.page(); await page.viewport(1440, 1000);
  const errors: string[] = [];
  const noOverflow = async (target: ChromePage, label: string) => {
    const size = await target.evaluate<{ width: number; scroll: number }>("({width:innerWidth,scroll:document.documentElement.scrollWidth})");
    if (size.scroll > size.width + 1) errors.push(`${label} horizontal overflow: ${size.scroll} > ${size.width}`);
  };
  const mobileCheck = async (target: ChromePage) => {
    await target.viewport(390, 844, true); await target.command("Page.bringToFront");
    await target.wait("innerWidth === 390"); await noOverflow(target, "mobile builder");
    await target.screenshot(join(screenshots, "mobile.png"));
    try {
      await target.click("[data-pb-chat-toggle]"); await target.wait("document.querySelector('[data-builder]').classList.contains('pb-chat-open')");
      await target.fill("[data-pb-compose] textarea", "手机上继续编辑草稿");
      await target.screenshot(join(screenshots, "mobile-chat.png"));
      await target.click("[data-pb-chat-close]");
      await target.click("[data-pb-try]");
      await target.click("[data-pb-library]"); await target.wait("!document.querySelector('[data-pb-library-panel]').hidden");
      await target.click("[data-pb-library-close]");
    } catch (error) { const issue = "Mobile action unreachable: " + String(error); errors.push(issue); t.diagnostic(issue); }
    await target.viewport(1440, 1000); await target.command("Page.reload");
    await target.wait("document.querySelector('[data-pb-action=publish]') && !document.querySelector('[data-pb-action=publish]').hidden");
  };
  await page.command("Page.navigate", { url: origin + "/plugin-builder" }); await page.command("Page.bringToFront");
  await page.wait("document.querySelector('[data-pb-model]')?.value.includes('fixture-prologue')");
  await page.fill("[data-pb-compose] textarea", "做一个库存记录工具：输入商品、单价和数量，计算每件库存价值与总额，支持 CSV 导入导出。");
  await page.click("[data-pb-send]");
  await page.wait("document.querySelectorAll('[data-pb-candidate]').length === 2");
  await page.click('[data-pb-candidate="inventory-table"]'); await page.click("[data-pb-confirm]");
  await page.wait("document.querySelector('[data-node-id=form]') && document.querySelector('[data-pb-status]')?.textContent.includes('功能 Agent')");
  await page.click("[data-record-add]"); await page.wait("document.querySelector('[data-record-editor]')?.open");
  await page.fill('[data-record-form] input[name="quantity"]', "3");
  await page.fill('[data-record-form] input[name="price"]', "12.5");
  await page.fill('[data-record-form] input[name="name"]', "预览马克杯");
  const focusBefore = await page.evaluate("({value:document.activeElement.value,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd,name:document.activeElement.name})");
  await page.wait("document.querySelector('[data-node-id=collection]')");
  assert.deepEqual(await page.evaluate("({value:document.activeElement.value,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd,name:document.activeElement.name})"), focusBefore, "placing later UI parts must preserve the active input and caret");
  await page.wait("document.querySelector('[data-pb-status]')?.textContent.startsWith('界面与功能已接通')");
  await page.click("[data-record-submit]");
  await page.wait("!document.querySelector('[data-record-editor]')?.open");
  await page.wait("document.querySelector('[data-record-list]')?.textContent.includes('预览马克杯')");
  assert.ok((await page.evaluate<string>("document.querySelector('[data-record-list]').textContent")).includes("37.5"));
  await page.click("[data-pb-try]");
  await noOverflow(page, "desktop builder"); await page.screenshot(join(screenshots, "desktop.png"));
  await mobileCheck(page);
  await page.click('[data-pb-action="publish"]');
  await page.wait("document.querySelector('[data-pb-connected] a')");
  const pluginUrl = await page.evaluate<string>("document.querySelector('[data-pb-connected] a').href");
  const created = browser.event("Target.targetCreated", event => (event.targetInfo as { type?: string; url?: string }).type === "page");
  await page.click("[data-pb-connected] a");
  const popupInfo = (await created).targetInfo as { targetId: string }; const installed = await browser.page(popupInfo.targetId);
  await installed.viewport(1440, 1000); await installed.command("Page.bringToFront");
  await installed.wait("document.querySelector('[data-record-list] .pb-record-empty')");
  assert.equal(await installed.evaluate("document.querySelectorAll('[data-record-list] tbody tr, [data-record-list] .pb-record').length"), 0, "published plugin starts without preview records");
  assert.equal(await installed.evaluate("location.href"), pluginUrl);
  await installed.click("[data-record-add]"); await installed.wait("document.querySelector('[data-record-editor]')?.open");
  await installed.fill('[data-record-form] input[name="name"]', "正式马克杯");
  await installed.fill('[data-record-form] input[name="quantity"]', "4");
  await installed.fill('[data-record-form] input[name="price"]', "15");
  await installed.click("[data-record-submit]"); await installed.wait("!document.querySelector('[data-record-editor]')?.open && document.querySelector('[data-record-list]')?.textContent.includes('正式马克杯')");
  await installed.command("Page.reload"); await installed.wait("document.querySelector('[data-record-list]')?.textContent.includes('正式马克杯')");
  assert.ok((await installed.evaluate<string>("document.querySelector('[data-record-list]').textContent")).includes("60"));
  await installed.screenshot(join(screenshots, "installed.png"));
  await installed.viewport(390, 844, true); await noOverflow(installed, "mobile installed plugin");
  await installed.screenshot(join(screenshots, "mobile-installed.png")); await installed.viewport(1440, 1000);
  const downloadName = browser.event("Browser.downloadWillBegin"), downloaded = browser.event("Browser.downloadProgress", params => params.state === "completed");
  await installed.click("[data-record-export]");
  const filename = String((await downloadName).suggestedFilename); await downloaded;
  const csv = await readFile(join(downloads, filename));
  assert.deepEqual([...csv.subarray(0, 3)], [239, 187, 191], "download must carry a UTF-8 BOM");
  if (csv.subarray(3, 6).equals(Buffer.from([239, 187, 191]))) { const issue = "CSV download includes two UTF-8 BOMs (EF BB BF EF BB BF), breaking round-trip header import"; errors.push(issue); t.diagnostic(issue); }
  assert.match(csv.toString("utf8"), /name,quantity,price,value\r\n正式马克杯,4,15,60/);
  // Headless macOS does not deliver native popup selection reliably. This single select uses
  // DOM value/change; it still exercises the real UI listener, guarded HTTP and persistence.
  await installed.click(".pb-standalone-bar a"); await installed.wait("document.querySelector('[data-pb-action=publish]') && !document.querySelector('[data-pb-action=publish]').hidden");
  await installed.click("[data-pb-inspect-all]"); await installed.wait("!document.querySelector('[data-pb-inspector-panel]').hidden");
  await installed.evaluate("(()=>{const select=document.querySelector('[data-pb-layout]');select.value='cards';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await installed.wait("document.querySelector('[data-pb-layout]')?.value === 'cards'");
  await installed.wait("document.querySelector('[data-record-list]')?.classList.contains('cards')");
  await installed.click("[data-pb-inspector-close]");
  t.diagnostic("Draft layout changed through the real UI change handler; verifying installed version remains unchanged.");
  const published = await browser.page(); await published.viewport(1440, 1000); await published.command("Page.navigate", { url: pluginUrl });
  await published.command("Page.bringToFront");
  await published.wait("document.querySelector('[data-record-list] table')");
  assert.ok((await published.evaluate<string>("document.querySelector('[data-record-list]').textContent")).includes("正式马克杯"), "editing draft layout must preserve the installed version and its data");
  await installed.command("Page.bringToFront"); await installed.click('[data-pb-action="publish"]');
  await installed.wait("document.querySelector('[data-pb-publish-dialog]')?.open");
  await installed.click('[data-pb-compatibility][value="compatible"]');
  await installed.click('[data-pb-publish-confirm]');
  await installed.wait("document.querySelector('[data-pb-publish-dialog]')?.open === false");
  await installed.click('[data-pb-library]'); await installed.wait("document.querySelector('[data-pb-upgrade]')?.textContent.includes('升级到 v2')");
  assert.ok((await installed.evaluate<string>("document.querySelector('[data-pb-library-list]').textContent")).includes("已安装 v1 · 最新发布 v2"));
  await published.command("Page.bringToFront"); await published.command("Page.reload"); await published.wait("document.querySelector('[data-record-list] table') && document.querySelector('[data-record-list]').textContent.includes('正式马克杯')");
  assert.ok((await published.evaluate<string>("document.querySelector('.pb-standalone-bar').textContent")).includes("v1"), "publishing the candidate leaves the installed release active");
  await installed.command("Page.bringToFront"); await installed.click('[data-pb-upgrade]');
  await installed.wait("document.querySelector('[data-pb-upgrade]') === null");
  await published.command("Page.bringToFront"); await published.command("Page.reload"); await published.wait("document.querySelector('[data-record-list]')?.classList.contains('cards') && document.querySelector('[data-record-list]').textContent.includes('正式马克杯')");
  assert.ok((await published.evaluate<string>("document.querySelector('.pb-standalone-bar').textContent")).includes("v2"));
  await published.viewport(390, 844, true); await noOverflow(published, "mobile installed plugin"); await published.screenshot(join(screenshots, "mobile-installed.png"));
  assert.deepEqual(runtime.starts.map(start => start.role), ["design", "behavior"], "UI parts come from the spec board, not a whole-page model run");
  assert.equal(new Set(mutationHeaders).size, mutationHeaders.length, "browser mutations must each use an independent idempotency key");
  assert.ok(mutationHeaders.every(value => value.length >= 8));
  assert.deepEqual(errors, [], "browser contract defects");
});
