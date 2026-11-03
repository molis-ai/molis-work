import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { asideReply } from "./fixtures/ending-review.js";

/** One streamed model turn of plain text. */
function turn(text: string): string {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture-model", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return events.join("");
}

// specs/prologue-adoption §4.5 (item 12): the Assistant's panel follows a running work by waiting on the Host for its
// view to change. While the model is still thinking the page sends no reads on a timer; the reply shows as soon as it lands.
test("the Assistant's panel follows a running work by waiting for it to change, not by reading it on a timer", { timeout: 120_000 }, async t => {
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  const answered = Promise.withResolvers<void>(), asked = Promise.withResolvers<void>();
  let turns = 0;
  const model = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    // A round that changed nothing has its ending reviewed (D1②): answered "nothing found" without spending a scripted turn.
    const review = asideReply(raw);
    if (review) { res.writeHead(200, { "content-type": "text/event-stream" }); res.end(turn(review)); return; }
    if (turns++ === 0) { asked.resolve(); await answered.promise; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(turn(turns === 1 ? "会议纪要整理好了：三项决定，两项待办。" : "好的。"));
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { answered.resolve(); model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
    const connection = withConnectorConnections(homeDirectory, store => { const created = store.createToken({ serviceId: "model-api", displayName: "local-only", token: "fixture-local-model-key" }); store.assertTarget(created.connection_id, "model-api", `http://127.0.0.1:${address.port}`); return created; });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "local-only", display_name: "本机 HTTP 模型", base_url: `http://127.0.0.1:${address.port}`, api_format: "anthropic-messages", models: [{ model_id: "fixture-model", enabled: true }] });
  }));
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-assistant-input]'))");
  // Every request the page makes about a work: a plain read of it, or a wait for it to change.
  await evaluate(`(() => { window.__workRequests = []; const fetch0 = window.fetch; window.fetch = (input, init) => {
    const path = new URL(typeof input === "string" ? input : input.url, location.href).pathname;
    if (/\\/api\\/assistant\\/works\\/[^/]+(\\/wait)?$/.test(path) && (!init || !init.method || init.method === "GET")) window.__workRequests.push({ at: Date.now(), wait: path.endsWith("/wait") });
    return fetch0(input, init); }; })()`);
  await click("[data-assistant-input]");
  await command("Input.insertText", { text: "整理一下今天的会议纪要" }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await asked.promise;
  await waitFor("window.__workRequests.some(request => request.wait)", 10_000);
  // The model thinks for four seconds; the page only waits.
  const before = await evaluate<number>("Date.now()");
  await new Promise(resolve => setTimeout(resolve, 4_000));
  const quiet = await evaluate<Array<{ at: number; wait: boolean }>>(`window.__workRequests.filter(request => request.at >= ${before})`);
  assert.equal(quiet.filter(request => !request.wait).length, 0, "no timed reads while the model thinks");
  assert.ok(quiet.length <= 2, `at most a couple of waits in four quiet seconds (${quiet.length})`);
  const released = Date.now();
  answered.resolve();
  await waitFor("document.querySelector('[data-assistant-panel]').textContent.includes('三项决定，两项待办')", 10_000);
  assert.ok(Date.now() - released < 3_000, `the reply shows as soon as it lands (${Date.now() - released} ms)`);
  // The finished work is not followed any further.
  await waitFor("!document.querySelector('[data-assistant-panel]').textContent.includes('正在')", 10_000).catch(() => {});
  const settled = await evaluate<number>("window.__workRequests.length");
  await new Promise(resolve => setTimeout(resolve, 2_500));
  assert.ok(await evaluate<number>("window.__workRequests.length") - settled <= 1, "a finished work is not followed");
});
