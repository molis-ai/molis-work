import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { asideReply } from "./fixtures/ending-review.js";

/** One streamed model turn: plain text, or one tool call. */
function turn(text: string, tool?: { name: string; input: unknown }): string {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture-model", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: `call-${Math.random().toString(36).slice(2)}`, name: tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return events.join("");
}

// specs/prologue-adoption §4.6 (item 14): a work that handed a part to a sub-task and ended its round goes on by itself
// once the sub-task is done. The panel, still following it while the sub-task runs, shows that round as the Host's,
// with what it made of the result, without the person doing anything.
test("the panel shows a work going on by itself when the sub-task it handed out comes back", { timeout: 120_000 }, async t => {
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  const childDone = Promise.withResolvers<void>(), childAsked = Promise.withResolvers<void>();
  const parentScript = [
    turn("", { name: "delegate-work", input: { title: "起草会议纪要", brief: "把今天的会议整理成纪要。", acceptance: "三条决定、两条待办" } }),
    turn("已交给子任务起草，它做完我再汇总。"),
    turn("纪要已核对：三条决定、两条待办都在，可以发了。"),
  ];
  let parentTurns = 0;
  const model = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    // A round that changed nothing has its ending reviewed (D1②): answered "nothing found" without spending a scripted turn.
    const review = asideReply(raw);
    if (review) { res.writeHead(200, { "content-type": "text/event-stream" }); res.end(turn(review)); return; }
    if (raw.includes("委托的子任务")) { childAsked.resolve(); await childDone.promise; res.writeHead(200, { "content-type": "text/event-stream" }); res.end(turn("纪要草稿：三条决定、两条待办。")); return; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(parentScript[parentTurns++] ?? turn("好的。"));
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { childDone.resolve(); model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
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
  await click("[data-assistant-input]");
  await command("Input.insertText", { text: "把今天的会议整理成纪要，分给子任务起草" }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await childAsked.promise;
  const panel = "document.querySelector('[data-assistant-panel]').textContent";
  await waitFor(`${panel}.includes('它做完我再汇总')`, 20_000);
  const shot = async (name: string) => {
    const directory = join(process.cwd(), ".impeccable/qa/review/prologue-adoption"); await mkdir(directory, { recursive: true });
    const image = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(directory, `${name}.png`), Buffer.from(image.data, "base64"));
  };
  await shot("handback-waiting");
  childDone.resolve();
  // Nobody touches the page: the round the Host writes and its reply arrive by themselves.
  await waitFor(`${panel}.includes('子任务都已交回') && ${panel}.includes('可以发了')`, 30_000);
  // The round is the Host's, not shown as something the person said.
  assert.equal(await evaluate<boolean>("[...document.querySelectorAll('[data-assistant-panel] .assistant-msg--host')].some(node => node.textContent.includes('子任务都已交回'))"), true);
  assert.equal(await evaluate<boolean>("[...document.querySelectorAll('[data-assistant-panel] .assistant-msg--user')].some(node => node.textContent.includes('子任务都已交回'))"), false);
  await shot("handback-continued");
  assert.equal(parentTurns, 3, "one hand-back round");
  await new Promise(resolve => setTimeout(resolve, 1_500));
  assert.equal(parentTurns, 3, "and only one");
});
