import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

/** One streamed model turn: a tool call, or plain text. */
function turn(tool?: { name: string; input: unknown }, text = "好的。"): string {
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

// PMR-12 (post-merge-review; fixed in c48a8608 and guarded only by hand until now): at about 800px the Assistant keeps its
// side pane in a closed drawer, so the conversation's top line must carry what the pane would: 去确认 for a change that
// waits on the person, landing on the card's own decision, and 继续 and 停止 once the work is paused.
test("with the side pane out of sight, the top line offers 去确认, then 继续 and 停止 for paused work", { timeout: 120_000 }, async t => {
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  // The first work proposes a change that needs the person's approval; the second work's model call is held until the
  // test has asked to pause, and then asks for a harmless tool so the round ends at a boundary.
  let turns = 0, release: (() => void) | undefined;
  const held = new Promise<void>(resolve => { release = resolve; });
  const model = createServer(async (req, res) => {
    for await (const _chunk of req) { /* the request itself is not under test */ }
    const index = turns++;
    if (index === 1) await held;
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(index === 0 ? turn({ name: "change-capability", input: { capability_id: "todo.items.create", version: 1, provider_id: "io.molis.work.todo", input: { title: "整理周报" } } })
      : index === 1 ? turn({ name: "context-remaining", input: {} }) : turn());
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { release?.(); model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
    catalog.models.upsert({ provider_id: "local-only", display_name: "本机 HTTP 模型", base_url: `http://127.0.0.1:${address.port}`, api_format: "anthropic-messages", models: [{ model_id: "fixture-model", enabled: true }] });
    catalog.models.setCredential("local-only", "fixture-local-model-key");
  }));
  await command("Emulation.setDeviceMetricsOverride", { width: 800, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  const say = async (text: string) => {
    await click("[data-assistant-input]");
    await command("Input.insertText", { text }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  };
  const shown = (selector: string) => `(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node || node.hidden || !node.getClientRects().length) return false;
    const box = node.getBoundingClientRect(); return box.width > 0 && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight; })()`;
  const strip = "[data-assistant-strip]";

  await say("记一下：整理周报");
  await waitFor(`${shown(strip)} && ${shown(`${strip} [data-assistant-strip-next]`)} && document.querySelector('${strip} [data-assistant-strip-next]').textContent === '去确认'`, 30_000);
  assert.equal(await evaluate("document.querySelector('[data-assistant-panel]').dataset.side"), "closed", "at this width the side pane is a closed drawer");
  await click(`${strip} [data-assistant-strip-next]`);
  // It lands on the card's own decision, not on a copy button inside the code it shows.
  await waitFor("Boolean(document.activeElement?.closest('[data-review]')) && !document.activeElement.classList.contains('assistant-code-copy')", 10_000);

  await click("[data-assistant-new]");
  await say("写一份周报草稿");
  await waitFor(`${shown(`${strip} [data-assistant-control=pause]`)}`, 30_000);
  await click(`${strip} [data-assistant-control=pause]`);
  release?.();
  await waitFor(`${shown(`${strip} [data-assistant-control=resume]`)} && ${shown(`${strip} [data-assistant-control=stop]`)}`, 30_000);
  assert.equal(await evaluate(`document.querySelector('${strip} [data-assistant-control=pause]').hidden`), true);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
});
