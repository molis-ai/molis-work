import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openCogniaStore } from "@molis-ai/molis-work-plugin-cognia";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
for (const width of [1440, 390]) test(`Cognia ${width}px: directory preview, import, synthesize, review and fixed citation through actual UI`, { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, async prompt => { assert.match(prompt, /ORIGINAL_EVIDENCE/); assert.doesNotMatch(prompt, /UPDATED_EVIDENCE/); return "# 已核对的知识\n保留来源中的原始事实 [S1]"; }); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, reloadPage, origin, projectId, homeDirectory } = browser;
  const read = () => { const store = openCogniaStore(homeDirectory); try { return { materials: store.materials(), drafts: store.drafts() }; } finally { store.close(); } };
  const vault = join(homeDirectory, "chosen-vault"); await mkdir(vault); await writeFile(join(vault, "原始资料.md"), "# 原始资料\nORIGINAL_EVIDENCE\n<script>window.untrustedExecuted=true</script>");
  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  const open = async () => {
    await waitFor("document.querySelector('[data-plugin-id=cognia]')");
    if (await evaluate("document.body.dataset.desktopSurface") !== "cognia") {
      if (width === 390) await click('.workspace-chrome [data-directory-show]');
      await click('[data-plugin-strip] [data-plugin-id=cognia]');
    }
    await waitFor("document.body.dataset.desktopSurface === 'cognia' && !document.querySelector('[data-cognia-rows]').textContent.includes('正在读取')");
  };
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=cognia` }, sessionId)); await open();
  await click('[data-cognia-action=import]'); await waitFor("document.querySelector('[data-cognia-dialog]').open");
  await evaluate(`document.querySelector('[data-cognia-form] [name=path]').value=${JSON.stringify(vault)}`);
  await click('[data-cognia-submit]'); await waitFor("document.querySelector('[data-cognia-step]').textContent === '预览' && !document.querySelector('[data-cognia-submit]').disabled");
  assert.equal(read().materials.length, 0);
  await click('[data-cognia-submit]'); await waitFor("document.querySelector('[data-cognia-step]').textContent === '结果' && !document.querySelector('[data-cognia-submit]').disabled");
  assert.equal(read().materials.length, 1); const source = read().materials[0]!;
  await click('[data-cognia-submit]'); await waitFor("!document.querySelector('[data-cognia-dialog]').open && document.querySelector('[data-cognia-heading]').textContent === '原始资料'");
  assert.equal(await evaluate("window.untrustedExecuted === true"), false);
  await click('[data-cognia-action=synthesize-current]'); await waitFor("document.querySelector('[data-cognia-dialog]').open");
  await click('[data-cognia-submit]'); await waitFor("document.querySelector('#cognia-dialog-title').textContent === '审阅知识草稿' && !document.querySelector('[data-cognia-submit]').disabled");
  assert.equal(read().materials.length, 1); assert.equal(read().drafts[0]!.references[0]!.revision, 1);
  const output = new URL("../.impeccable/review/action-service/", import.meta.url); await mkdir(output, { recursive: true });
  await writeFile(new URL(`cognia-review-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  await click('[data-cognia-submit]'); await waitFor("!document.querySelector('[data-cognia-dialog]').open && document.querySelector('[data-cognia-heading]').textContent === '已核对的知识'");
  assert.equal(read().materials.length, 2); assert.ok(read().drafts[0]!.saved_id);
  // Another importer updates the current source while the saved knowledge still references v1.
  const changed = openCogniaStore(homeDirectory);
  try { changed.commit(changed.preview({ kind: "markdown", name: "same vault", locator: changed.sources().find(item => item.id === source.source_id)!.locator, files: [{ path: source.path, data: Buffer.from("# 原始资料\nUPDATED_EVIDENCE").toString("base64") }] }).id); } finally { changed.close(); }
  assert.equal(read().materials.length, 2); assert.equal(read().materials.find(item => item.id === source.id)!.revision, 2);
  await click('[data-cognia-reading] [data-cognia-action=reference]'); await waitFor("document.querySelector('[data-cognia-heading]').textContent === '原始资料'");
  assert.equal(await evaluate("document.querySelector('[data-cognia-download]').href.endsWith('revision=1')"), true);
  await click('[data-cognia-action=synthesize-current]'); await click('[data-cognia-submit]');
  await waitFor("document.querySelector('#cognia-dialog-title').textContent === '审阅知识草稿' && !document.querySelector('[data-cognia-submit]').disabled");
  assert.equal(read().drafts.length, 2); assert.equal(read().drafts[0]!.references[0]!.revision, 1);
  await click('[data-cognia-dialog] header [data-cognia-action=close]');
  await reloadPage(); await open();
  await waitFor("document.querySelectorAll('[data-cognia-id]').length === 2");
  assert.equal(read().materials.find(m => m.id === source.id)!.body.includes("UPDATED_EVIDENCE"), true);
  await writeFile(new URL(`cognia-library-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"));
});

for (const width of [1440, 390]) test(`Cognia ${width}px uses configured HTTP Prologue, saves reviewed output and reflects model disablement`, { timeout: 90_000 }, async t => {
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  const requests: Array<{ path: string; key: unknown; body: Record<string, unknown> }> = [];
  const model = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    requests.push({ path: req.url!, key: req.headers["x-api-key"], body: JSON.parse(body) });
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(await cogniaModelResponse("# 本机模型整理结果\n已核对本机资料 [S1]").text());
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, reloadPage, origin, projectId, homeDirectory } = browser;
  await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
    catalog.models.upsert({ provider_id: "local-only", display_name: "本机 HTTP 模型", base_url: `http://127.0.0.1:${address.port}`, api_format: "anthropic-messages", models: [{ model_id: "fixture-model", enabled: true }] });
    catalog.models.setCredential("local-only", "fixture-local-model-key");
  }));
  const read = () => { const store = openCogniaStore(homeDirectory); try { return { materials: store.materials(), drafts: store.drafts() }; } finally { store.close(); } };
  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  const open = async () => {
    await waitFor("document.querySelector('[data-plugin-id=cognia]')");
    if (await evaluate("document.body.dataset.desktopSurface") !== "cognia") {
      if (width === 390) await click('.workspace-chrome [data-directory-show]');
      await click('[data-plugin-strip] [data-plugin-id=cognia]');
    }
    await waitFor("document.body.dataset.desktopSurface === 'cognia' && !document.querySelector('[data-cognia-rows]').textContent.includes('正在读取')");
  };
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=cognia` }, sessionId)); await open();
  await waitFor("document.querySelector('[data-cognia-model]').textContent.includes('Prologue')");
  assert.equal(requests.length, 0);
  await click('[data-cognia-action=add]'); await waitFor("document.querySelector('[data-cognia-dialog]').open");
  await evaluate("document.querySelector('[data-cognia-form] [name=title]').value='本机资料';document.querySelector('[data-cognia-form] [name=body]').value='LOCAL_UI_EVIDENCE'");
  await click('[data-cognia-submit]'); await waitFor("!document.querySelector('[data-cognia-dialog]').open && document.querySelector('[data-cognia-heading]').textContent === '本机资料'");
  assert.equal(await evaluate("document.querySelector('[data-cognia-action=synthesize-current]').disabled"), false);
  await click('[data-cognia-action=synthesize-current]'); await click('[data-cognia-submit]');
  await waitFor("document.querySelector('#cognia-dialog-title').textContent === '审阅知识草稿' && !document.querySelector('[data-cognia-submit]').disabled");
  assert.equal(requests.length, 1); assert.equal(requests[0]!.path, "/v1/messages"); assert.equal(requests[0]!.key, "fixture-local-model-key");
  assert.equal(requests[0]!.body.model, "fixture-model"); assert.equal((requests[0]!.body.tools as unknown[] | undefined)?.length ?? 0, 0);
  assert.match(JSON.stringify(requests[0]!.body.messages), /LOCAL_UI_EVIDENCE/);
  assert.equal(read().materials.length, 1); assert.equal(read().drafts.length, 1);
  const output = new URL("../.impeccable/review/action-service/", import.meta.url); await mkdir(output, { recursive: true });
  await writeFile(new URL(`cognia-http-review-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  await click('[data-cognia-submit]'); await waitFor("!document.querySelector('[data-cognia-dialog]').open && document.querySelector('[data-cognia-heading]').textContent === '本机模型整理结果'");
  assert.equal(read().materials.length, 2); assert.equal(read().materials.find(m => m.title === "本机模型整理结果")!.body, "已核对本机资料 [S1]");
  await reloadPage(); await open(); assert.equal(read().materials.length, 2); assert.equal(requests.length, 1);
  await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => catalog.models.upsert({ ...catalog.models.get("local-only")!, enabled: false })));
  await reloadPage(); await open();
  await waitFor("document.querySelector('[data-cognia-model]').textContent.includes('没有可用的文字模型')");
  assert.equal(await evaluate("document.querySelector('[data-cognia-action=synthesize]').disabled"), true);
  assert.match(await evaluate<string>("document.querySelector('[data-cognia-action=synthesize]').title"), /模型设置和服务连接/);
  await click('[data-cognia-action=add]'); await waitFor("document.querySelector('[data-cognia-dialog]').open");
  await evaluate("document.querySelector('[data-cognia-form] [name=title]').value='停用后仍可保存';document.querySelector('[data-cognia-form] [name=body]').value='保留原始资料'");
  await click('[data-cognia-submit]'); await waitFor("!document.querySelector('[data-cognia-dialog]').open && document.querySelector('[data-cognia-heading]').textContent === '停用后仍可保存'");
  assert.equal(await evaluate("document.querySelector('[data-cognia-action=synthesize-current]').disabled"), true);
  await click('[data-cognia-action=back]'); await waitFor("!document.querySelector('[data-cognia-model]').hidden");
  assert.equal(read().materials.length, 3); assert.equal(read().drafts.length, 1); assert.equal(requests.length, 1);
  await writeFile(new URL(`cognia-http-disabled-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"));
});
