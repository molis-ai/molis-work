import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { withConnectorConnections } from "../apps/local-host/src/connector-connection-store.js";
// The same module the running Host uses: completions go through the Home Runtime that Host has bound.
import { saveJellyModelSettings, readJellyModelSettings, createJellyCompletion } from "../apps/local-host/dist/jelly-model.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

for (const width of [1440, 390]) {
  test(`configured model ${width}px: Lingguang replies and Jelly repairs a retained disconnected selection`, { timeout: 45_000 }, async t => {
    const old = { ...process.env }; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
    for (const key of ["MOLIS_WORK_TEXT_API_KEY", "MINIMAX_API_KEY"]) delete process.env[key];
    t.after(() => { process.env = old; resetSecretStoreCache(); });
    const received: string[] = [];
    const model = createServer(async (request, response) => {
      let body = ""; for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body); received.push(payload.model);
      const content = "从同一角度再拍一张窗边的照片。", usage = { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 };
      // Text now goes through the Home's Prologue Runtime, which asks OpenAI-compatible services to stream.
      if (payload.stream) {
        response.writeHead(200, { "content-type": "text/event-stream" });
        const chunk = (value: unknown) => response.write(`data: ${JSON.stringify(value)}\n\n`);
        chunk({ id: "fixture", object: "chat.completion.chunk", model: payload.model, choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] });
        chunk({ id: "fixture", object: "chat.completion.chunk", model: payload.model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage });
        response.end("data: [DONE]\n\n");
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content } }], usage }));
    });
    t.after(() => new Promise<void>(resolve => { model.close(() => resolve()); model.closeAllConnections(); }));
    await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
    const address = model.address(); assert.ok(address && typeof address === "object");
    const modelUrl = `http://127.0.0.1:${address.port}/v1`;
    const browser = await openGoalBrowser(t, true);
    if (!browser) return;
    const { homeDirectory: home, command, sessionId, navigate, origin, projectId, waitFor, click, evaluate } = browser;
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    let firstConnection = "";
    try {
      for (const id of ["a", "b"]) {
        const connection = withConnectorConnections(home, store => {
          const c = store.createToken({ serviceId: "model-api", displayName: `测试账号 ${id}`, token: `browser-fixture-key-${id}` });
          store.assertTarget(c.connection_id, "model-api", modelUrl); return c;
        });
        catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: id, display_name: id === "a" ? "原来的模型" : "备用模型", base_url: modelUrl,
          api_format: "openai-chat-completions", models: [{ model_id: `${id}-model`, enabled: true }] });
        if (id === "a") firstConnection = connection.connection_id;
      }
    } finally { catalog.close(); }
    await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
    await waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')");
    await click('[data-plugin-picker-popover] [data-plugin-id=lingguang]');
    await waitFor("document.body.dataset.desktopSurface === 'lingguang'");
    await click('[data-lingguang-capture]');
    await waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true'");
    await evaluate(`(() => { const body = document.querySelector('[data-lingguang-body]'); body.value='记录窗边的光'; body.dispatchEvent(new InputEvent('input',{bubbles:true})); })()`);
    await click('[data-lingguang-brainstorm-current]');
    await waitFor("!document.querySelector('[data-lingguang-pane=chat]').hidden");
    await evaluate(`document.querySelector('[data-lingguang-chat-input]').value='明天可以做什么？'`);
    await click('[data-lingguang-chat] [type=submit]');
    await waitFor("document.querySelector('[data-lingguang-messages]').textContent.includes('从同一角度再拍一张窗边的照片')");
    assert.deepEqual(received, ["a-model"]);
    saveJellyModelSettings(home, { provider_id: "a", model_id: "a-model" });
    withConnectorConnections(home, store => store.disconnect(firstConnection));
    await click('[data-plugin-strip] [data-plugin-id=jelly]');
    await waitFor("document.body.dataset.desktopSurface === 'jelly'");
    await click('[data-jelly-more]');
    await click('[data-jelly-model]');
    await waitFor("document.querySelector('[data-jelly-model-status]')?.textContent.includes('选择仍保留')");
    assert.equal(await evaluate("document.querySelector('[data-jelly-provider=a]').getAttribute('aria-pressed')"), "true");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    const output = reviewEvidenceUrl("action-service/"); await mkdir(output, { recursive: true });
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(new URL(`model-disconnected-${width}.png`, output), Buffer.from(shot.data, "base64"));
    await click('[data-jelly-dialog-ok]');
    await waitFor("document.querySelector('[data-jelly-dialog-error]')?.textContent.includes('原选择已保留')");
    assert.equal(readJellyModelSettings(home).selection?.provider_id, "a");
    await click('[data-jelly-provider=b]');
    await click('[data-jelly-dialog-ok]');
    await waitFor("!document.querySelector('[data-jelly-dialog]').open");
    assert.equal(readJellyModelSettings(home).selection?.provider_id, "b");
    assert.equal(await createJellyCompletion(home)!("Use the user's new selection"), "从同一角度再拍一张窗边的照片。");
    assert.deepEqual(received, ["a-model", "b-model"]);
    await navigate(() => command("Page.navigate", { url: `${origin}/settings/models?provider=a` }, sessionId));
    await waitFor("document.querySelector('[data-model-connection]')?.selectedOptions[0]?.textContent.includes('连接不可用')");
    assert.equal(await evaluate("document.querySelector('[data-model-connection]').value"), firstConnection);
    await evaluate("document.querySelector('[data-model-connection]').closest('.model-field').scrollIntoView({block:'center',behavior:'instant'})");
    await waitFor("(() => { const rect = document.querySelector('[data-model-connection]').closest('.model-field').getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; })()");
    const settingsShot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(new URL(`model-connection-retained-${width}.png`, output), Buffer.from(settingsShot.data, "base64"));
  });
}
