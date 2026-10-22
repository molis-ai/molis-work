import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";

for (const [width, locale] of [[1440, "zh"], [390, "zh"], [1440, "en"], [390, "en"]] as const) test(`RAC-58 Images ${locale} ${width}px: revoked and missing selections stay explicit, then user chooses and generates`, { timeout: 90_000 }, async t => {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file"; resetSecretStoreCache();
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache(); });
  let calls = 0;
  const provider = createServer(async (req, res) => { for await (const _ of req) {} calls++; res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ data: [{ b64_json: PNG }] })); });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  t.after(() => { provider.closeAllConnections(); return new Promise<void>(resolve => provider.close(() => resolve())); });
  const address = provider.address(); assert.ok(address && typeof address === "object");
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { homeDirectory, origin, projectId, command, sessionId, navigate } = browser;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, browser, "images");
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  const auth = withConnectorConnections(homeDirectory, store => store.createToken({ serviceId: "image-api", displayName: "图像测试账号", token: "fixture-only-image-key" }));
  const replacement = withConnectorConnections(homeDirectory, store => store.createToken({ serviceId: "image-api", displayName: "备用图像账号", token: "fixture-only-replacement-key" }));
  const input = async (selector: string, value: string) => evaluate(`(() => { const node=document.querySelector(${JSON.stringify(selector)}); node.value=${JSON.stringify(value)}; node.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const api = async (method: string, path: string, body?: unknown) => evaluate<any>(`(async () => { const r=await fetch(${JSON.stringify(`/projects/${projectId}/api/plugins/io.molis.work.images${path}`)}, {method:${JSON.stringify(method)},headers:molisWorkControlHeaders(),${body === undefined ? "" : `body:JSON.stringify(${JSON.stringify(body)}),`}}); const body=await r.json(); if(!r.ok)throw new Error(JSON.stringify(body)); return body; })()`);
  const output = reviewEvidenceUrl("action-service/"); await mkdir(output, { recursive: true });
  const screenshot = async (name: string) => {
    await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    const result = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(new URL(`images-${name}-${width}-${locale}.png`, output), Buffer.from(result.data, "base64"));
  };
  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=${locale}&next=${encodeURIComponent(`/projects/${projectId}/?openPlugin=images`)}` }, sessionId));
  await browser.waitFor("document.querySelector('[data-plugin-id=images]')");
  if (await browser.evaluate("document.body.dataset.desktopSurface") !== "images") {
    await browser.click('[data-plugin-strip] [data-plugin-id="images"]');
  }
  await browser.waitFor("document.body.dataset.desktopSurface === 'images'");
  assert.equal(await evaluate("document.querySelector('[data-images-history-empty] strong').textContent"), locale === "en" ? "No images yet" : "还没有图片");
  assert.equal(await evaluate("document.querySelector('[data-images-prompt]').placeholder"), locale === "en"
    ? "For example: A desk at dawn, coffee and an open book, sunlight from the left, film photography, warm tones."
    : "例如：清晨的书桌，一杯咖啡和翻开的书，阳光从左侧照入，胶片摄影，暖色调。");
  const { connection: chosen } = await api("POST", "/connections", { name: "当前生图服务", api_format: "openai-images", base_url: baseUrl, model: "fixture", auth_connection_id: auth.connection_id });
  const { connection: backup } = await api("POST", "/connections", { name: "本机备用服务", api_format: "openai-images", base_url: baseUrl, model: "fixture" });
  await click("[data-images-refresh]"); await click("[data-images-new]");
  await input("[data-images-prompt]", "雨后树叶上的水珠");
  await waitFor("!document.querySelector('[data-images-generate]').disabled");
  withConnectorConnections(homeDirectory, store => store.disconnect(auth.connection_id));
  await click("[data-images-workspace] [data-images-refresh]");
  await waitFor("document.querySelector('[data-images-generate]').disabled && !document.querySelector('[data-images-service-unavailable]').hidden");
  assert.match(await evaluate<string>("document.querySelector('[data-images-service-label]').textContent"), /当前生图服务/);
  await screenshot("revoked");
  await click("[data-images-connections]");
  await waitFor("document.querySelector('[data-images-dialog]').open");
  assert.equal(await evaluate("document.querySelector('[data-images-connection-auth]').value"), auth.connection_id);
  assert.match(await evaluate<string>("document.querySelector('[data-images-connection-auth]').selectedOptions[0].textContent"), locale === "en" ? /unavailable/ : /不可用/);
  await screenshot("connection");
  await evaluate(`(() => { const node=document.querySelector('[data-images-connection-auth]'); node.value=${JSON.stringify(replacement.connection_id)}; node.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await input("[data-images-connection-url]", baseUrl);
  assert.equal(await evaluate("document.querySelector('[data-images-connection-auth]').value"), replacement.connection_id, "Changing the URL must not reset an explicitly selected account");
  await click("[data-images-save-connection]"); await waitFor("!document.querySelector('[data-images-dialog]').open");
  assert.equal(withConnectorConnections(homeDirectory, store => store.binding("home", "images", chosen.id)?.connection_id), replacement.connection_id);

  await api("DELETE", `/connections/${chosen.id}`); await click("[data-images-workspace] [data-images-refresh]");
  await waitFor("document.querySelector('[data-images-generate]').disabled && !document.querySelector('[data-images-service-unavailable]').hidden");
  assert.match(await evaluate<string>("document.querySelector('[data-images-service-label]').textContent"), locale === "en" ? /selected image service is unavailable/ : /所选生图服务不可用/);
  assert.equal(await evaluate("document.querySelector('[data-images-prompt]').value"), "雨后树叶上的水珠");
  assert.equal(calls, 0); await screenshot("missing");
  await click("[data-images-service-menu] summary"); await click(`[data-images-use-connection="${backup.id}"]`);
  await waitFor("!document.querySelector('[data-images-generate]').disabled"); await click("[data-images-generate]");
  await waitFor("document.querySelector('[data-images-result] img')?.naturalWidth > 0", 12_000).catch(async error => {
    throw new Error(JSON.stringify({calls, persisted:await api("GET","/jobs"), view:await evaluate("({content:document.querySelector('[data-images-result]').textContent,images:[...document.querySelectorAll('[data-images-result] img')].map(img=>({src:img.src,title:img.title}))})")}), { cause: error });
  });
  assert.equal(calls, 1);
  assert.equal(await evaluate("document.querySelector('[data-images-title]').textContent"), locale === "en" ? "Results" : "生成结果");
  assert.equal(await evaluate("document.querySelector('[data-images-result] h2').textContent"), locale === "en" ? "Generated" : "已生成");
  assert.doesNotMatch(await evaluate<string>("document.querySelector('[data-images=workbench]').textContent"), /images\.(?:compose|service|history|account|result|status|error)\./);
  const imageUrl = await evaluate<string>("document.querySelector('[data-images-result] img').src");
  assert.deepEqual(Buffer.from(await (await fetch(imageUrl + "?download=1")).arrayBuffer()), Buffer.from(PNG, "base64"));
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  await screenshot("result");
});
