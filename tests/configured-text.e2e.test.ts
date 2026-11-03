import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { JellyModelSettings } from "@molis-ai/molis-work-plugin-jelly";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { asideReply } from "./fixtures/ending-review.js";

for (const width of [1440, 390]) {
  test(`configured model ${width}px: Lingguang replies and Jelly repairs a retained disconnected selection`, { timeout: 45_000 }, async t => {
    const old = { ...process.env }; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
    for (const key of ["MOLIS_WORK_TEXT_API_KEY", "MINIMAX_API_KEY"]) delete process.env[key];
    t.after(() => { process.env = old; resetSecretStoreCache(); });
    const received: string[] = [];
    const model = createServer(async (request, response) => {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString("utf8");
      // The Home's background knowledge cards for the demo project's pieces are answered aside: `received` is Lingguang's and Jelly's.
      const payload = JSON.parse(body), aside = asideReply(body); if (aside === undefined) received.push(payload.model);
      const title = "从同一角度再拍一张窗边的照片。";
      const content = aside ?? (payload.model === "b-model" ? JSON.stringify({ actions: [{ title, notes: "与原来的照片对照", minutes: 15 }], clarification_questions: [] }) : title);
      const usage = { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 };
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
    const { homeDirectory: home, command, sessionId, navigate, origin, controlToken, projectId } = browser;
    const views = {lingguang: await pluginFrameBrowser(t,browser,"lingguang"), jelly: await pluginFrameBrowser(t,browser,"jelly")};
    let active: Pick<typeof browser,"evaluate" | "waitFor" | "click"> = browser;
    const evaluate: typeof browser.evaluate = (...args) => active.evaluate(...args);
    const waitFor: typeof browser.waitFor = (...args) => active.waitFor(...args);
    const click: typeof browser.click = (...args) => active.click(...args);
    // W5-01-JMC-01: configuration and inference use the live Runtime HTTP routes.
    const jelly = async <T>(path: string, body?: unknown): Promise<T> => {
      const response = await fetch(`${origin}/api/plugins/io.molis.work.jelly${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { origin, "content-type": "application/json", "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": crypto.randomUUID() },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.headers.get("content-type")?.includes("ndjson")) {
        const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
        const final = events.at(-1); assert.equal(response.status, 200);
        assert.equal(final.type, "result", JSON.stringify(final)); return final.result as T;
      }
      const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result as T;
    };
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
    active = views.lingguang;
    await click('[data-lingguang-capture]');
    await waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true'");
    await evaluate(`(() => { const body = document.querySelector('[data-lingguang-body]'); body.value='记录窗边的光'; body.dispatchEvent(new InputEvent('input',{bubbles:true})); })()`);
    await click('[data-lingguang-brainstorm-current]');
    await waitFor("!document.querySelector('[data-lingguang-pane=chat]').hidden");
    await evaluate(`document.querySelector('[data-lingguang-chat-input]').value='明天可以做什么？'`);
    await click('[data-lingguang-chat] [type=submit]');
    await waitFor("document.querySelector('[data-lingguang-messages]').textContent.includes('从同一角度再拍一张窗边的照片')");
    assert.deepEqual(received, ["a-model"]);
    await jelly("/model-settings", { provider_id: "a", model_id: "a-model" });
    withConnectorConnections(home, store => store.disconnect(firstConnection));
    active = browser;
    await click('[data-plugin-strip] [data-plugin-id=jelly]');
    await waitFor("document.body.dataset.desktopSurface === 'jelly'");
    active = views.jelly;
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
    assert.equal((await jelly<JellyModelSettings>("/model-settings")).selection?.provider_id, "a");
    await click('[data-jelly-provider=b]');
    await click('[data-jelly-dialog-ok]');
    await waitFor("!document.querySelector('[data-jelly-dialog]').open");
    assert.equal((await jelly<JellyModelSettings>("/model-settings")).selection?.provider_id, "b");
    const planned = await jelly<{ plan: { actions: { title: string }[] }; method: string }>("/ai", { kind: "decompose", source_type: "text", text: "明天从同一角度拍窗边的照片" });
    assert.equal(planned.method, "model");
    assert.equal(planned.plan.actions[0]!.title, "从同一角度再拍一张窗边的照片。");
    assert.deepEqual(received, ["a-model", "b-model"]);
    active = browser;
    await navigate(() => command("Page.navigate", { url: `${origin}/settings/models?provider=a` }, sessionId));
    await waitFor("document.querySelector('[data-model-connection]')?.selectedOptions[0]?.textContent.includes('连接不可用')");
    assert.equal(await evaluate("document.querySelector('[data-model-connection]').value"), firstConnection);
    await evaluate("document.querySelector('[data-model-connection]').closest('.model-field').scrollIntoView({block:'center',behavior:'instant'})");
    await waitFor("(() => { const rect = document.querySelector('[data-model-connection]').closest('.model-field').getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; })()");
    const settingsShot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(new URL(`model-connection-retained-${width}.png`, output), Buffer.from(settingsShot.data, "base64"));
  });
}
