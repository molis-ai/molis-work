import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

/** One streamed model turn: a tool call, or plain text. */
function turn(tool?: { name: string; input: unknown }, text = "记下了。"): string {
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

// Undoing from the Assistant's panel is a change to the plugin's data like the change itself: the plugin's page shows it
// at once instead of on its next poll (Todo reads again only every minute).
test("a change taken back from the Assistant's panel leaves the owner's page at once", { timeout: 120_000 }, async t => {
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  const script = [
    () => turn({ name: "change-reversible", input: { capability_id: "todo.items.create", version: 1, provider_id: "io.molis.work.todo", input: { title: "把评审纪要发给全组" } } }),
  ];
  let turns = 0;
  const model = createServer(async (req, res) => {
    for await (const _chunk of req) { /* the request itself is not under test */ }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end((script[turns++] ?? (() => turn()))());
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
    catalog.models.upsert({ provider_id: "local-only", display_name: "本机 HTTP 模型", base_url: `http://127.0.0.1:${address.port}`, api_format: "anthropic-messages", models: [{ model_id: "fixture-model", enabled: true }] });
    catalog.models.setCredential("local-only", "fixture-local-model-key");
  }));
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=todo]')");
  if (await evaluate("document.body.dataset.desktopSurface") !== "todo") await click('[data-plugin-strip] [data-plugin-id=todo]');
  await waitFor("document.body.dataset.desktopSurface === 'todo' && document.querySelector('[data-todo-view=\"all\"]')");
  await click('[data-todo-view="all"]');

  const listed = "[...document.querySelectorAll('[data-todo-id]')].some(node => node.offsetParent && node.textContent.includes('把评审纪要发给全组'))";
  await click("[data-assistant-input]");
  await command("Input.insertText", { text: "记一下：把评审纪要发给全组" }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  // The Assistant's change shows on the page (the page already rereads after a change).
  await waitFor(listed, 30_000);

  await waitFor("Boolean(document.querySelector('[data-assistant-side-toggle]')?.getClientRects().length)");
  if (await evaluate("document.querySelector('[data-assistant-side-toggle]').getAttribute('aria-expanded')") !== "true") await click("[data-assistant-side-toggle]");
  const undo = '[data-assistant-side] button[aria-label="撤销：待办 · 新建待办"]';
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(undo)}))`, 10_000);
  await evaluate(`document.querySelector(${JSON.stringify(undo)}).scrollIntoView({ block: "center" })`);
  await click(undo);
  await waitFor("document.querySelector('[data-assistant-side]').textContent.includes('已撤销')");
  // Well before Todo's own minute-long poll.
  await waitFor(`!(${listed})`, 4_000);
});
